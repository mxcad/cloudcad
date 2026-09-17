/**
 * 梦想网页CAD实时协同平台 部署包验证脚本（非交互式）
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
const { PRODUCT_NAME } = require('./lib/branding');
const { resolveMxcadAssemblyPath } = require('./lib/mxcad-path');
const { fillEmptySecrets } = require('./setup-offline');

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
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const PM2_HOME = path.join(DATA_DIR, 'pm2');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// Prisma schema-engine 预置二进制（pack-offline.js bundlePrismaSchemaEngine 预置到
// runtime/prisma-engines/，含全平台二进制）。pnpm store manifest 不引用 postinstall 下载的
// schema-engine，部署机重建 @prisma/engines 包目录缺该二进制 → prisma CLI（getEnginesPath）
// 找不到 → 回退联网下载 → 断网 migrate deploy 失败。故设 PRISMA_SCHEMA_ENGINE_BINARY 指向
// 预置二进制（绝对路径，prisma CLI Ry() 按 process.cwd() 解析）。
//
// 二进制按平台区分（debian/rhel/musl × openssl 版本 × arch）。选择策略：
//   - Windows：schema-engine-windows.exe。
//   - Linux：优先选与当前平台匹配的二进制（复刻 prisma CLI 平台检测：/etc/os-release →
//     distro family，openssl 版本 → libssl 后缀，arch → 文件名）；匹配不到则回退到
//     静态链接的 schema-engine-debian-openssl-1.1.x（无运行时 openssl 依赖，glibc 通用，
//     经验证在 ubuntu22 上 ldd 无 libssl 依赖、可正常运行），最后回退任意非 windows 二进制。
function detectLinuxSchemaEngineName() {
  try {
    // distro family：alpine→musl；centos/rhel/rocky/almalinux/fedora/suse→rhel；其余→debian
    let family = 'debian';
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
      const id = ((osRelease.match(/(^|\n)ID="?([^"\n]*)"?/i) || [])[2] || '').toLowerCase();
      const idLike = ((osRelease.match(/(^|\n)ID_LIKE="?([^"\n]*)"?/i) || [])[2] || '').toLowerCase();
      const ids = `${id} ${idLike}`;
      if (ids.includes('alpine')) family = 'musl';
      else if (/rhel|centos|rocky|almalinux|fedora|amzn|\bol\b|suse/.test(ids)) family = 'rhel';
      else family = 'debian'; // ubuntu/debian/raspbian 等默认 debian
    } catch { /* 保持默认 debian */ }
    // openssl 版本：优先 ldconfig 检测 libssl.so（libssl.so.3→3.0.x、libssl.so.1.1→1.1.x），
    // 其次 openssl version -v
    let libssl = '';
    try {
      const out = execSync('ldconfig -p 2>/dev/null', { encoding: 'utf-8' });
      const m = out.match(/libssl\.so\.(\d+)(?:\.(\d+))?/);
      if (m) libssl = `${m[1]}.${m[2] || '0'}.x`;
    } catch { /* 继续 */ }
    if (!libssl) {
      try {
        const out = execSync('openssl version -v 2>/dev/null', { encoding: 'utf-8' });
        const m = out.match(/^OpenSSL\s(\d+)\.(\d+)\.\d+/);
        if (m) libssl = `${m[1]}.${m[2]}.x`;
      } catch { /* 继续 */ }
    }
    const arch = process.arch === 'arm64' ? 'arm64' : '';
    if (family === 'musl') {
      return arch ? `schema-engine-linux-musl-${arch}-openssl-${libssl}` : 'schema-engine-linux-musl';
    }
    const archSuffix = arch ? `-${arch}` : '';
    const libsslSuffix = libssl ? `-openssl-${libssl}` : '';
    return `schema-engine-${family}${archSuffix}${libsslSuffix}`;
  } catch {
    return null;
  }
}

function getPrismaSchemaEnginePath() {
  const enginesDir = path.join(PROJECT_ROOT, 'runtime', 'prisma-engines');
  if (!fs.existsSync(enginesDir)) return null;
  const engines = fs
    .readdirSync(enginesDir)
    .filter((f) => f.startsWith('schema-engine') && !f.endsWith('.sha256'));
  if (engines.length === 0) return null;
  if (IS_WINDOWS) {
    const win = engines.find((f) => f === 'schema-engine-windows.exe');
    return path.join(enginesDir, win || engines[0]);
  }
  // Linux：优先平台匹配二进制，回退静态 debian（glibc 通用），最后任意非 windows
  const detected = detectLinuxSchemaEngineName();
  if (detected) {
    const match = engines.find((f) => f === detected);
    if (match) return path.join(enginesDir, match);
  }
  const fallback =
    engines.find((f) => f === 'schema-engine-debian-openssl-1.1.x') ||
    engines.find((f) => !f.includes('windows')) ||
    engines[0];
  return path.join(enginesDir, fallback);
}

// 从 .env 文件读取端口配置
const BACKEND_ENV_PATH = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');

function parseEnvFileSimple(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  content.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  });
  return result;
}

function getPorts() {
  const defaults = {
    backend: 3001,
    frontend: 3000,
    configService: 3002,
    postgresql: 5432,
    redis: 6379,
    cooperate: 3091,
    conversion: 3100,
  };

  try {
    const envConfig = parseEnvFileSimple(BACKEND_ENV_PATH);
    return {
      backend: parseInt(envConfig.PORT || '3001', 10) || defaults.backend,
      frontend:
        parseInt(envConfig.FRONTEND_PORT || '3000', 10) || defaults.frontend,
      configService:
        parseInt(envConfig.CONFIG_SERVICE_PORT || '3002', 10) ||
        defaults.configService,
      postgresql:
        parseInt(envConfig.DB_PORT || '5432', 10) || defaults.postgresql,
      redis: parseInt(envConfig.REDIS_PORT || '6379', 10) || defaults.redis,
      cooperate:
        parseInt(envConfig.COOPERATE_PORT || '3091', 10) || defaults.cooperate,
      conversion:
        parseInt(envConfig.CONVERSION_SERVICE_PORT || '3100', 10) ||
        defaults.conversion,
    };
  } catch (err) {
    return defaults;
  }
}

// 端口配置（动态读取）
const PORTS = getPorts();

// 超时配置
const MAX_STARTUP_WAIT = 120000; // 120秒
const HEALTH_CHECK_INTERVAL = 2000; // 2秒

/**
 * 转换服务（conversion-service）启动配置（与 start.js 逻辑一致，D5：验收器独立，
 * 用本文件自己的 parseEnvFileSimple 而非 lib/*）。
 * 仅当后端 FUNCTION_EXECUTOR=conversion-service 时启用；Redis 连接/密码从后端 .env 同步。
 */
function getConversionServiceConfig() {
  const dist = path.join(
    PROJECT_ROOT,
    'packages',
    'conversion-service',
    'dist',
    'server.js'
  );
  const envConfig = parseEnvFileSimple(BACKEND_ENV_PATH);
  const executor = (envConfig.FUNCTION_EXECUTOR || 'process-pool').toLowerCase();
  if (executor !== 'conversion-service') {
    return { enabled: false, dist, env: {} };
  }
  const redisHost = envConfig.REDIS_HOST || 'localhost';
  const redisPort = envConfig.REDIS_PORT || '6379';
  const redisDb = envConfig.REDIS_DB || '0';
  const redisPassword = envConfig.REDIS_PASSWORD || '';
  const auth = redisPassword ? `:${redisPassword}@` : '';
  const env = {
    NODE_ENV: 'production',
    CONVERSION_SERVICE_PORT: String(PORTS.conversion),
    REDIS_URL: `redis://${auth}${redisHost}:${redisPort}/${redisDb}`,
    QUEUE_DRIVER: 'redis',
    ...(envConfig.INTERNAL_SERVICE_SECRET
      ? { INTERNAL_SERVICE_SECRET: envConfig.INTERNAL_SERVICE_SECRET }
      : {}),
    // S1-2 批量管理路由鉴权（同 start.js）：注入 CONVERSION_SERVICE_SECRET，
    // 使验收器拉起的转换服务能校验后端批量路由的 X-Conversion-Service-Secret 头。
    ...(envConfig.CONVERSION_SERVICE_SECRET
      ? { CONVERSION_SERVICE_SECRET: envConfig.CONVERSION_SERVICE_SECRET }
      : {}),
  };
  // mxcad 二进制绝对路径（同 start.js：conversion-service dist 布局下 PROJECT_ROOT 会算错）
  // 跨平台误配置回退走 lib/mxcad-path.js（同 start.js）：后端自身会回退 Linux 上的 Windows
  // .exe 配置，但转换服务直接读该 env 无守卫——原样注入会让它去 spawn 部署包里不存在的
  // runtime/windows/mxcad/mxcadassembly.exe → 每次转换 ENOENT。
  const mxcadAssemblyRaw = resolveMxcadAssemblyPath(envConfig);
  env.MXCAD_ASSEMBLY_PATH = path.isAbsolute(mxcadAssemblyRaw)
    ? mxcadAssemblyRaw
    : path.join(PROJECT_ROOT, mxcadAssemblyRaw);
  return { enabled: true, dist, env };
}

// 可执行文件路径
const NODE_EXE = USE_RUNTIME
  ? IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'node', 'node.exe')
    : path.join(PLATFORM_DIR, 'node', 'bin', 'node')
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
  'windows', // Windows 系统
  'debian-openssl-1.1.x', // Debian 10/11, Ubuntu 20.04 (OpenSSL 1.1)
  'debian-openssl-3.0.x', // Debian 12, Ubuntu 22.04+ (OpenSSL 3.0)
  'rhel-openssl-1.0.x', // CentOS 7 (OpenSSL 1.0)
  'rhel-openssl-3.0.x', // Rocky 9, RHEL 9, AlmaLinux 9 (OpenSSL 3.0)
  'linux-musl', // Alpine Linux
].join(',');

function runPnpm(args, options = {}) {
  // 设置环境变量：PATH 包含 node bin 目录，禁用 corepack
  const nodeBinDir = IS_LINUX
    ? path.join(PLATFORM_DIR, 'node', 'bin')
    : path.join(PLATFORM_DIR, 'node');
  
  // 添加 node_modules/.bin 到 PATH（pnpm exec 需要找到命令）
  const nodeModulesBinDirs = [
    path.join(PROJECT_ROOT, 'node_modules', '.bin'),
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.bin'),
  ];
  
  const existingPath = process.env.PATH || '';
  const pathParts = [nodeBinDir, ...nodeModulesBinDirs, existingPath];
  
  const env = {
    ...process.env,
    ...options.env,
    PATH: pathParts.join(path.delimiter),
    COREPACK_ENABLE: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    // Prisma: 使用已下载的二进制，不要联网下载
    PRISMA_CLI_BINARY_TARGETS: PRISMA_BINARY_TARGETS,
  };
  // Prisma schema-engine 预置二进制（离线 migrate deploy 用，见 getPrismaSchemaEnginePath）
  const schemaEnginePath = getPrismaSchemaEnginePath();
  if (schemaEnginePath) {
    env.PRISMA_SCHEMA_ENGINE_BINARY = schemaEnginePath;
  }

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
    ? IS_WINDOWS
      ? `${nodeDir};${existingPath}`
      : `${nodeDir}:${existingPath}`
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
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'GET',
        timeout,
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );

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
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
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
  const backendEnvExample = path.join(
    PROJECT_ROOT,
    'packages',
    'backend',
    '.env.example'
  );

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
  const nodeDir = IS_LINUX
    ? path.join(PLATFORM_DIR, 'node', 'bin')
    : path.join(PLATFORM_DIR, 'node');
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
  // 注意：必须把 @cloudcad/db、@cloudcad/contracts 也纳入 filter ——
  // pnpm --filter backend 不会安装 workspace 依赖（@cloudcad/db）自己的依赖
  // （如 @prisma/client），导致 packages/db/node_modules 为空、运行时
  // require('@prisma/client/runtime/client') 失败（MODULE_NOT_FOUND）。
  // 与 setup-offline.js runPnpmInstallOffline 保持一致。
  log(
    'info',
    '运行 pnpm --filter backend --filter @cloudcad/db --filter @cloudcad/contracts install --offline --prod...'
  );

  const installResult = spawnSync(
    NODE_EXE,
    [
      pnpmPath,
      '--filter',
      'backend',
      '--filter',
      '@cloudcad/db',
      '--filter',
      '@cloudcad/contracts',
      'install',
      '--offline',
      '--prod',
      '--reporter=append-only',
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: { ...env, CI: 'true' },
      shell: IS_WINDOWS,
      timeout: 180000,
    }
  );

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

  // 生成 .env 空白密钥（SESSION_SECRET/JWT_SECRET/PII_*/REDIS_PASSWORD/INTERNAL_SERVICE_SECRET）。
  // 验收器不跑 start.js（其 fillEmptySecrets 生成密钥），须自行补齐——否则后端生产模式
  // 校验 SESSION_SECRET/REDIS_PASSWORD 缺失而启动失败。redis-manager.js 从 .env 读
  // REDIS_PASSWORD 起 Redis（--requirepass），后端从 .env 读同值连接，须先于基础服务启动生成。
  fillEmptySecrets(BACKEND_ENV_PATH);

  const ecosystemPath = path.join(RUNTIME_DIR, 'ecosystem.config.js');

  // 停止旧进程
  runPm2(['delete', 'all'], { silent: true });
  runPm2(['kill'], { silent: true });

  // 启动基础服务
  if (
    !runPm2([
      'start',
      ecosystemPath,
      '--only',
      'postgresql,redis,cooperate,config-service',
    ])
  ) {
    logError('基础服务启动失败');
    return false;
  }

  // 等待 PostgreSQL 就绪
  log('info', '等待 PostgreSQL...');
  if (
    !(await waitForService('PostgreSQL', () => checkPort(PORTS.postgresql)))
  ) {
    logError('PostgreSQL 启动超时');
    return false;
  }
  logSuccess('PostgreSQL 已就绪');

  // 等待 Redis 就绪
  log('info', '等待 Redis...');
  if (!(await waitForService('Redis', () => checkPort(PORTS.redis)))) {
    logError('Redis 启动超时');
    return false;
  }
  logSuccess('Redis 已就绪');

  // 等待 Config-service 就绪（可选）
  log('info', '等待 Config-service...');
  if (
    await waitForService(
      'Config-service',
      () => checkPort(PORTS.configService),
      30000
    )
  ) {
    logSuccess('Config-service 已就绪');
  } else {
    log('warn', 'Config-service 未就绪，继续...');
  }

  // Cooperate 服务可选
  log('info', '等待 Cooperate...');
  if (
    await waitForService('Cooperate', () => checkPort(PORTS.cooperate), 30000)
  ) {
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

  // 检查 Prisma Client 是否存在（Prisma 7 prisma-client generator 产物在 db 包）
  const prismaClientPath = path.join(
    PROJECT_ROOT,
    'packages',
    'db',
    'dist'
  );
  if (!fs.existsSync(prismaClientPath)) {
    log('info', '生成 Prisma Client...');
    if (!runPnpm(['--filter', 'backend', 'db:generate'], { timeout: 120000 })) {
      logError('Prisma Client 生成失败');
      return false;
    }
  } else {
    log('info', 'Prisma Client 已存在');
  }

  // 执行迁移（始终使用 migrate deploy）
  log('info', '执行 prisma migrate deploy...');
  if (
    !runPnpm(['-F', 'backend', 'exec', 'prisma', 'migrate', 'deploy'], {
      timeout: 120000,
      env: { PGOPTIONS: '-c jit=off' },
    })
  ) {
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

  const backendMain = path.join(
    PROJECT_ROOT,
    'packages',
    'backend',
    'dist',
    'main.js'
  );

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
      ...(IS_LINUX && USE_RUNTIME
        ? {
            LD_LIBRARY_PATH: [
              path.join(PLATFORM_DIR, 'postgres', 'lib'),
              path.join(PLATFORM_DIR, 'redis', 'lib'),
              path.join(PLATFORM_DIR, 'subversion', 'lib'),
            ].join(':'),
          }
        : {}),
    },
  };

  const tempConfigPath = path.join(DATA_DIR, 'pm2-backend.config.js');
  fs.writeFileSync(
    tempConfigPath,
    `module.exports = { apps: [${JSON.stringify(backendConfig)}] };`
  );

  if (!runPm2(['start', tempConfigPath])) {
    logError('后端启动失败');
    return false;
  }

  // 等待后端就绪（使用 /api/health/live 端点，公开访问）
  log('info', '等待后端服务...');
  if (
    !(await waitForService('Backend', () =>
      checkHealth(PORTS.backend, '/api/health/live')
    ))
  ) {
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
  fs.writeFileSync(
    tempConfigPath,
    `module.exports = { apps: [${JSON.stringify(frontendConfig)}] };`
  );

  if (!runPm2(['start', tempConfigPath])) {
    logError('前端启动失败');
    return false;
  }

  // 等待前端就绪
  log('info', '等待前端服务...');
  if (
    !(await waitForService('Frontend', () => checkHealth(PORTS.frontend, '/')))
  ) {
    logError('前端启动超时');
    return false;
  }

  logSuccess('前端服务已就绪');

  // 转换服务（仅 FUNCTION_EXECUTOR=conversion-service 时）：Redis 连接/密码从后端 .env 同步
  const conversion = getConversionServiceConfig();
  if (conversion.enabled) {
    if (!fs.existsSync(conversion.dist)) {
      // S9-4：FUNCTION_EXECUTOR=conversion-service 但部署包未含产物属配置/包不一致，
      // 验收器须捕获（而非降级跳过）——否则断网门禁会"通过"一个转换服务未运行的坏部署
      logError(
        'FUNCTION_EXECUTOR=conversion-service 但转换服务构建产物不存在（' +
          conversion.dist +
          '）——部署包与配置不一致，验收失败'
      );
      return false;
    } else {
      log('info', '启动转换服务...');
      const conversionConfig = {
        name: 'conversion',
        script: conversion.dist,
        cwd: path.join(PROJECT_ROOT, 'packages', 'conversion-service'),
        autorestart: true,
        watch: false,
        max_restarts: 10,
        env: conversion.env,
      };
      const conversionTempConfig = path.join(DATA_DIR, 'pm2-conversion.config.js');
      fs.writeFileSync(
        conversionTempConfig,
        `module.exports = { apps: [${JSON.stringify(conversionConfig)}] };`
      );
      if (!runPm2(['start', conversionTempConfig])) {
        logError('转换服务启动失败');
        return false;
      }
      log('info', '等待转换服务...');
      if (
        !(await waitForService('Conversion', () =>
          checkHealth(PORTS.conversion, '/health')
        ))
      ) {
        logError('转换服务启动超时');
        return false;
      }
      logSuccess('转换服务已就绪');
    }
  }

  return true;
}

/**
 * 步骤7: 最终验证
 */
async function step7_FinalVerification() {
  logStep(7, 7, '最终验证...');

  let allPassed = true;

  // 检查各服务状态（ADR-0059 决策 8：全服务健康检查）
  // optional=true 的服务（cooperate）未就绪只 warn 不 hard-fail（边缘环境可能未安装）
  const services = [
    { name: 'PostgreSQL', port: PORTS.postgresql, type: 'tcp' },
    { name: 'Redis', port: PORTS.redis, type: 'tcp' },
    { name: 'Config-service', port: PORTS.configService, type: 'tcp' },
    {
      name: 'Backend',
      port: PORTS.backend,
      path: '/api/health/live',
      type: 'http',
    },
    { name: 'Frontend', port: PORTS.frontend, path: '/', type: 'http' },
    { name: 'Cooperate', port: PORTS.cooperate, type: 'tcp', optional: true },
  ];

  // 转换服务（仅 FUNCTION_EXECUTOR=conversion-service 时纳入健康检查）
  const conversion = getConversionServiceConfig();
  if (conversion.enabled && fs.existsSync(conversion.dist)) {
    services.push({
      name: 'Conversion',
      port: PORTS.conversion,
      path: '/health',
      type: 'http',
    });
  }

  for (const service of services) {
    let isReady;
    if (service.type === 'http') {
      isReady = await checkHealth(service.port, service.path || '/health');
    } else {
      isReady = await checkPort(service.port);
    }

    if (isReady) {
      logSuccess(`${service.name}: 端口 ${service.port} 正常`);
    } else if (service.optional) {
      log(
        'warn',
        `${service.name}: 端口 ${service.port} 无响应（可选服务，可能未安装，不阻断）`
      );
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

  const errorKeywords = [
    'Error:',
    'error',
    'ERROR',
    'Exception',
    'failed',
    'Failed',
    'FAILED',
  ];
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
  console.log(
    `${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}   ${PRODUCT_NAME} 部署包验证 (断网环境)${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`
  );
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
    if (!(await step1_SetupOffline())) {
      success = false;
    }
    if (success && !(await step2_InstallDeps())) {
      success = false;
    }
    if (success && !(await step3_StartInfrastructure())) {
      success = false;
    }
    if (success && !(await step4_DatabaseMigration())) {
      success = false;
    }
    if (success && !(await step5_StartBackend())) {
      success = false;
    }
    if (success && !(await step6_StartFrontend())) {
      success = false;
    }
    if (success && !(await step7_FinalVerification())) {
      success = false;
    }

    // 输出结果
    console.log('');
    console.log(
      `${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`
    );

    if (success) {
      console.log(
        `${colors.green}${colors.bright}   ✓ 验证通过！${colors.reset}`
      );
      console.log('');
      console.log('服务地址:');
      console.log(`  后端:  http://localhost:${PORTS.backend}`);
      console.log(`  前端:  http://localhost:${PORTS.frontend}`);
      console.log(`  配置:  http://localhost:${PORTS.configService}`);
    } else {
      console.log(`${colors.red}${colors.bright}   ✗ 验证失败${colors.reset}`);
    }

    console.log(
      `${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`
    );
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
