/**
 * CloudCAD 部署包验证脚本（非交互式）
 * 
 * 用于在断网环境中验证部署包可用性
 * 按顺序启动各服务，检查健康接口，输出日志状态
 * 
 * 使用方式：
 *   node runtime/scripts/verify-deploy.js
 */

const { spawn, spawnSync, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ==================== 配置 ====================

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..');
const PLATFORM_DIR = IS_WINDOWS 
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);
const DATA_DIR = path.join(PROJECT_ROOT, 'offline-data');
const PM2_HOME = path.join(DATA_DIR, 'pm2');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 端口配置
const PORTS = {
  backend: 3001,
  frontend: 3000,
  configService: 3002,
  postgresql: 5432,
  redis: 6379,
  cooperate: 3091,
};

// 超时配置
const MAX_STARTUP_WAIT = 120000; // 120秒
const HEALTH_CHECK_INTERVAL = 2000; // 2秒

// 可执行文件路径
const NODE_EXE = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'node', 'node.exe')
      : path.join(PLATFORM_DIR, 'node', 'bin', 'node'))
  : 'node';

const PM2_JS = USE_RUNTIME
  ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'pm2', 'bin', 'pm2')
  : null;

const PNPM_JS = USE_RUNTIME
  ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  : null;

// ==================== 日志函数 ====================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

function log(level, message) {
  const colorMap = {
    info: colors.green,
    warn: colors.yellow,
    error: colors.red,
    step: colors.cyan,
  };
  const color = colorMap[level] || '';
  console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`);
}

function logStep(step, total, message) {
  console.log(`${colors.cyan}[${step}/${total}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

// ==================== 工具函数 ====================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || PROJECT_ROOT,
    stdio: options.silent ? 'pipe' : 'inherit',
    shell: IS_WINDOWS,
    env: {
      ...process.env,
      ...options.env,
    },
    timeout: options.timeout || 60000,
  });
  return result.status === 0;
}

function runNode(scriptPath, args = [], options = {}) {
  return runCommand(NODE_EXE, [scriptPath, ...args], options);
}

// Prisma 二进制目标平台（必须与 pack-offline.js 中的 prepareDeployStore 一致）
const PRISMA_BINARY_TARGETS = [
  'windows',                   // Windows 系统
  'debian-openssl-1.1.x',      // Debian 10/11, Ubuntu 20.04 (OpenSSL 1.1)
  'debian-openssl-3.0.x',      // Debian 12, Ubuntu 22.04+ (OpenSSL 3.0)
  'rhel-openssl-1.0.x',        // CentOS 7 (OpenSSL 1.0)
  'rhel-openssl-3.0.x',        // Rocky 9, RHEL 9, AlmaLinux 9 (OpenSSL 3.0)
  'linux-musl',                // Alpine Linux
].join(',');

function runPnpm(args, options = {}) {
  // 设置环境变量：PATH 包含 node bin 目录，禁用 corepack
  const nodeBinDir = IS_LINUX ? path.join(PLATFORM_DIR, 'node', 'bin') : path.join(PLATFORM_DIR, 'node');
  const env = {
    ...process.env,
    ...options.env,
    PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH || ''}`,
    COREPACK_ENABLE: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    // Prisma: 使用已下载的二进制，不要联网下载
    PRISMA_CLI_BINARY_TARGETS: PRISMA_BINARY_TARGETS,
  };
  
  if (PNPM_JS && fs.existsSync(PNPM_JS)) {
    return runCommand(NODE_EXE, [PNPM_JS, ...args], { ...options, env });
  }
  return runCommand('pnpm', args, { ...options, env });
}

function runPm2(args, options = {}) {
  if (!PM2_JS || !fs.existsSync(PM2_JS)) {
    log('error', 'PM2 不可用');
    return false;
  }
  
  const nodeDir = path.dirname(NODE_EXE);
  const existingPath = process.env.PATH || '';
  const newPath = USE_RUNTIME
    ? (IS_WINDOWS ? `${nodeDir};${existingPath}` : `${nodeDir}:${existingPath}`)
    : existingPath;

  return runCommand(NODE_EXE, [PM2_JS, ...args], {
    ...options,
    env: {
      ...options.env,
      PM2_HOME,
      PATH: newPath,
    },
  });
}

/**
 * HTTP 健康检查
 */
function checkHealth(port, path = '/health', timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
      timeout,
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * TCP 端口检查
 */
function checkPort(port, timeout = 5000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = net.connect(port, 'localhost');
    
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    
    socket.on('error', () => resolve(false));
    
    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);
  });
}

/**
 * 等待服务就绪
 */
async function waitForService(name, checkFn, maxWait = MAX_STARTUP_WAIT) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    if (await checkFn()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }
  
  return false;
}

// ==================== 验证步骤 ====================

/**
 * 步骤1: 设置离线环境
 * 注意：部署包不包含开发依赖，需要从 store 安装生产依赖
 */
async function step1_SetupOffline() {
  logStep(1, 7, '设置离线环境...');
  
  // 检查必要的运行时组件
  const nodeExe = NODE_EXE;
  if (!fs.existsSync(nodeExe)) {
    logError(`Node.js 不存在: ${nodeExe}`);
    return false;
  }
  logSuccess(`Node.js: ${nodeExe}`);
  
  // 复制 .env.example 到 .env（如果不存在）
  const backendEnvPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  const backendEnvExample = path.join(PROJECT_ROOT, 'packages', 'backend', '.env.example');
  
  if (!fs.existsSync(backendEnvPath) && fs.existsSync(backendEnvExample)) {
    fs.copyFileSync(backendEnvExample, backendEnvPath);
    logSuccess('已复制 .env.example → .env');
  } else if (fs.existsSync(backendEnvPath)) {
    logSuccess('.env 已存在');
  } else {
    logError('.env.example 不存在');
    return false;
  }
  
  logSuccess('离线环境检查完成');
  return true;
}

/**
 * 步骤2: 安装生产依赖（从 store）
 * 注意：部署包只包含后端的生产依赖
 */
async function step2_InstallDeps() {
  logStep(2, 7, '安装生产依赖...');
  
  // 检查 .pnpm-store-deploy 是否存在
  const storePath = path.join(PROJECT_ROOT, '.pnpm-store-deploy');
  if (!fs.existsSync(storePath)) {
    logError(`pnpm store 不存在: ${storePath}`);
    return false;
  }
  logSuccess(`pnpm store: ${storePath}`);
  
  // 检查 pnpm
  const pnpmPath = USE_RUNTIME
    ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    : null;
  
  if (!pnpmPath || !fs.existsSync(pnpmPath)) {
    logError('pnpm 不存在');
    return false;
  }
  
  // 设置环境变量
  const nodeDir = IS_LINUX ? path.join(PLATFORM_DIR, 'node', 'bin') : path.join(PLATFORM_DIR, 'node');
  const env = {
    ...process.env,
    PATH: `${nodeDir}${path.delimiter}${process.env.PATH || ''}`,
    COREPACK_ENABLE: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    NPM_CONFIG_STORE_DIR: storePath,
    // Prisma: 使用已下载的二进制，不要联网下载
    PRISMA_CLI_BINARY_TARGETS: PRISMA_BINARY_TARGETS,
  };
  
  // 只安装后端生产依赖（部署包只包含后端依赖）
  log('info', '运行 pnpm --filter backend install --offline --prod...');
  
  const installResult = spawnSync(NODE_EXE, [pnpmPath, '--filter', 'backend', 'install', '--offline', '--prod'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env,
    shell: IS_WINDOWS,
    timeout: 180000,
  });
  
  if (installResult.status !== 0) {
    logError('后端生产依赖安装失败');
    return false;
  }
  
  logSuccess('后端生产依赖安装完成');
  return true;
}

/**
 * 步骤3: 启动基础服务 (PostgreSQL, Redis, Cooperate, Config-service)
 */
async function step3_StartInfrastructure() {
  logStep(3, 7, '启动基础服务...');
  
  const ecosystemPath = path.join(RUNTIME_DIR, 'ecosystem.config.js');
  
  // 停止旧进程
  runPm2(['delete', 'all'], { silent: true });
  runPm2(['kill'], { silent: true });
  
  // 启动基础服务
  if (!runPm2(['start', ecosystemPath, '--only', 'postgresql,redis,cooperate,config-service'])) {
    logError('基础服务启动失败');
    return false;
  }
  
  // 等待 PostgreSQL 就绪
  log('info', '等待 PostgreSQL...');
  if (!await waitForService('PostgreSQL', () => checkPort(PORTS.postgresql))) {
    logError('PostgreSQL 启动超时');
    return false;
  }
  logSuccess('PostgreSQL 已就绪');
  
  // 等待 Redis 就绪
  log('info', '等待 Redis...');
  if (!await waitForService('Redis', () => checkPort(PORTS.redis))) {
    logError('Redis 启动超时');
    return false;
  }
  logSuccess('Redis 已就绪');
  
  // 等待 Config-service 就绪（可选）
  log('info', '等待 Config-service...');
  if (await waitForService('Config-service', () => checkPort(PORTS.configService), 30000)) {
    logSuccess('Config-service 已就绪');
  } else {
    log('warn', 'Config-service 未就绪，继续...');
  }
  
  // Cooperate 服务可选
  log('info', '等待 Cooperate...');
  if (await waitForService('Cooperate', () => checkPort(PORTS.cooperate), 30000)) {
    logSuccess('Cooperate 已就绪');
  } else {
    log('warn', 'Cooperate 未就绪（可能未安装），继续...');
  }
  
  logSuccess('基础服务启动完成');
  return true;
}

/**
 * 步骤4: 数据库迁移
 */
async function step4_DatabaseMigration() {
  logStep(4, 7, '执行数据库迁移...');
  
  // 检查 .env 文件
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    logError('.env 文件不存在');
    return false;
  }
  
  // 检查 Prisma Client 是否存在
  const prismaClientPath = path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.prisma', 'client');
  if (!fs.existsSync(prismaClientPath)) {
    log('info', '生成 Prisma Client...');
    if (!runPnpm(['--filter', 'backend', 'db:generate'], { timeout: 120000 })) {
      logError('Prisma Client 生成失败');
      return false;
    }
  } else {
    log('info', 'Prisma Client 已存在');
  }
  
  // 执行迁移
  log('info', '执行 db:push...');
  if (!runPnpm(['--filter', 'backend', 'db:push'], { timeout: 120000 })) {
    logError('数据库迁移失败');
    return false;
  }
  
  logSuccess('数据库迁移完成');
  return true;
}

/**
 * 步骤5: 启动后端服务
 */
async function step5_StartBackend() {
  logStep(5, 7, '启动后端服务...');
  
  const backendMain = path.join(PROJECT_ROOT, 'packages', 'backend', 'dist', 'src', 'main.js');
  
  if (!fs.existsSync(backendMain)) {
    logError('后端构建产物不存在');
    return false;
  }
  
  // 启动后端
  // 注意：pnpm workspace 依赖在根目录 node_modules，需要设置 NODE_PATH
  // Linux 下需要设置 LD_LIBRARY_PATH 以加载运行时库
  const backendConfig = {
    name: 'backend',
    script: backendMain,
    cwd: path.join(PROJECT_ROOT, 'packages', 'backend'),
    autorestart: true,
    watch: false,
    max_restarts: 10,
    // 输出日志到文件以便诊断
    error_file: path.join(LOGS_DIR, 'backend-error.log'),
    out_file: path.join(LOGS_DIR, 'backend-out.log'),
    env: {
      NODE_ENV: 'production',
      NODE_PATH: path.join(PROJECT_ROOT, 'node_modules'),
      // Linux 运行时库路径
      ...(IS_LINUX && USE_RUNTIME ? {
        LD_LIBRARY_PATH: [
          path.join(PLATFORM_DIR, 'postgres', 'lib'),
          path.join(PLATFORM_DIR, 'redis', 'lib'),
          path.join(PLATFORM_DIR, 'subversion', 'lib'),
        ].join(':'),
      } : {}),
    },
  };
  
  const tempConfigPath = path.join(DATA_DIR, 'pm2-backend.config.js');
  fs.writeFileSync(tempConfigPath, `module.exports = { apps: [${JSON.stringify(backendConfig)}] };`);
  
  if (!runPm2(['start', tempConfigPath])) {
    logError('后端启动失败');
    return false;
  }
  
  // 等待后端就绪（使用 /api/health/live 端点，公开访问）
  log('info', '等待后端服务...');
  if (!await waitForService('Backend', () => checkHealth(PORTS.backend, '/api/health/live'))) {
    logError('后端启动超时');
    // 输出后端日志以便诊断
    log('warn', '后端错误日志:');
    const errorLog = path.join(LOGS_DIR, 'backend-error.log');
    if (fs.existsSync(errorLog)) {
      console.log(fs.readFileSync(errorLog, 'utf8'));
    } else {
      console.log('(日志文件不存在)');
    }
    log('warn', '后端输出日志:');
    const outLog = path.join(LOGS_DIR, 'backend-out.log');
    if (fs.existsSync(outLog)) {
      console.log(fs.readFileSync(outLog, 'utf8'));
    } else {
      console.log('(日志文件不存在)');
    }
    return false;
  }
  
  logSuccess('后端服务已就绪');
  return true;
}

/**
 * 步骤6: 启动前端服务
 */
async function step6_StartFrontend() {
  logStep(6, 7, '启动前端服务...');
  
  const frontendDist = path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist');
  
  if (!fs.existsSync(frontendDist)) {
    logError('前端构建产物不存在');
    return false;
  }
  
  const serveScript = path.join(RUNTIME_DIR, 'scripts', 'serve-static.js');
  
  if (!fs.existsSync(serveScript)) {
    logError('serve-static.js 不存在');
    return false;
  }
  
  // 启动前端静态服务
  const frontendConfig = {
    name: 'frontend',
    script: serveScript,
    cwd: PROJECT_ROOT,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
      SERVE_PORT: PORTS.frontend,
      SERVE_ROOT: frontendDist,
    },
  };
  
  const tempConfigPath = path.join(DATA_DIR, 'pm2-frontend.config.js');
  fs.writeFileSync(tempConfigPath, `module.exports = { apps: [${JSON.stringify(frontendConfig)}] };`);
  
  if (!runPm2(['start', tempConfigPath])) {
    logError('前端启动失败');
    return false;
  }
  
  // 等待前端就绪
  log('info', '等待前端服务...');
  if (!await waitForService('Frontend', () => checkHealth(PORTS.frontend, '/'))) {
    logError('前端启动超时');
    return false;
  }
  
  logSuccess('前端服务已就绪');
  return true;
}

/**
 * 步骤7: 最终验证
 */
async function step7_FinalVerification() {
  logStep(7, 7, '最终验证...');
  
  let allPassed = true;
  
  // 检查各服务状态
  const services = [
    { name: 'PostgreSQL', port: PORTS.postgresql, type: 'tcp' },
    { name: 'Redis', port: PORTS.redis, type: 'tcp' },
    { name: 'Config-service', port: PORTS.configService, type: 'tcp' },
    { name: 'Backend', port: PORTS.backend, path: '/api/health/live', type: 'http' },
    { name: 'Frontend', port: PORTS.frontend, path: '/', type: 'http' },
  ];
  
  for (const service of services) {
    let isReady;
    if (service.type === 'http') {
      isReady = await checkHealth(service.port, service.path || '/health');
    } else {
      isReady = await checkPort(service.port);
    }
    
    if (isReady) {
      logSuccess(`${service.name}: 端口 ${service.port} 正常`);
    } else {
      logError(`${service.name}: 端口 ${service.port} 无响应`);
      allPassed = false;
    }
  }
  
  // 获取 PM2 状态
  console.log('');
  log('info', 'PM2 服务状态:');
  runPm2(['status']);
  
  // 检查日志是否有错误
  console.log('');
  log('info', '检查日志错误...');
  
  const errorKeywords = ['Error:', 'error', 'ERROR', 'Exception', 'failed', 'Failed', 'FAILED'];
  const logFiles = fs.existsSync(LOGS_DIR) ? fs.readdirSync(LOGS_DIR) : [];
  let hasErrors = false;
  
  for (const logFile of logFiles) {
    if (logFile.endsWith('.log')) {
      const logPath = path.join(LOGS_DIR, logFile);
      const content = fs.readFileSync(logPath, 'utf8');
      
      for (const keyword of errorKeywords) {
        if (content.includes(keyword)) {
          log('warn', `${logFile} 包含错误关键词: ${keyword}`);
          hasErrors = true;
          // 输出最后 20 行
          const lines = content.split('\n').slice(-20).join('\n');
          console.log(lines);
          break;
        }
      }
    }
  }
  
  if (!hasErrors) {
    logSuccess('日志检查通过，无错误');
  }
  
  return allPassed && !hasErrors;
}

/**
 * 停止所有服务
 */
async function stopAll() {
  console.log('');
  log('info', '停止所有服务...');
  
  runPm2(['stop', 'all'], { silent: true });
  runPm2(['delete', 'all'], { silent: true });
  runPm2(['kill'], { silent: true });
  
  logSuccess('服务已停止');
}

// ==================== 主函数 ====================

async function main() {
  const args = process.argv.slice(2);
  const shouldStop = !args.includes('--no-stop');
  
  console.log('');
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   CloudCAD 部署包验证 (断网环境)${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log('');
  console.log(`平台: ${PLATFORM}`);
  console.log(`模式: ${USE_RUNTIME ? '内嵌 runtime' : '系统环境'}`);
  console.log(`项目根目录: ${PROJECT_ROOT}`);
  console.log('');
  
  ensureDir(DATA_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(PM2_HOME);
  
  let success = true;
  
  try {
    // 执行验证步骤
    if (!await step1_SetupOffline()) { success = false; }
    if (success && !await step2_InstallDeps()) { success = false; }
    if (success && !await step3_StartInfrastructure()) { success = false; }
    if (success && !await step4_DatabaseMigration()) { success = false; }
    if (success && !await step5_StartBackend()) { success = false; }
    if (success && !await step6_StartFrontend()) { success = false; }
    if (success && !await step7_FinalVerification()) { success = false; }
    
    // 输出结果
    console.log('');
    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
    
    if (success) {
      console.log(`${colors.green}${colors.bright}   ✓ 验证通过！${colors.reset}`);
      console.log('');
      console.log('服务地址:');
      console.log(`  后端:  http://localhost:${PORTS.backend}`);
      console.log(`  前端:  http://localhost:${PORTS.frontend}`);
      console.log(`  配置:  http://localhost:${PORTS.configService}`);
    } else {
      console.log(`${colors.red}${colors.bright}   ✗ 验证失败${colors.reset}`);
    }
    
    console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
    
  } catch (err) {
    log('error', `验证异常: ${err.message}`);
    console.error(err);
    success = false;
  } finally {
    if (shouldStop) {
      await stopAll();
    }
  }
  
  process.exit(success ? 0 : 1);
}

main();
