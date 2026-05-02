/**
 * CloudCAD 运维 CLI（交互式）
 *
 * 使用方式：
 *   node runtime/scripts/cli.js
 *
 * 功能：
 *   - 开发模式：启动基础服务 + 数据库迁移 + 前后端开发服务器
 *   - 部署模式：启动基础服务 + 数据库迁移 + 构建部署
 *   - 基础服务：仅启动 PostgreSQL/Redis/Cooperate
 *   - 数据库操作：迁移、种子数据
 */

const readline = require('readline');
const { spawn, spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 导入离线环境设置函数（异步）
const {
  setup: setupOffline,
  checkPrismaClientExists,
} = require('./setup-offline');

// 判断是否是部署模式
const args = process.argv.slice(2);
const isDeployMode = args[0] === 'deploy';

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

// 解析 .env 文件（提前定义，供 getPorts 使用）
function parseEnvFileSimple(filePath) {
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

// 从 .env 文件读取端口配置
const BACKEND_ENV_PATH = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
function getPorts() {
  const defaults = {
    backend: 3001,
    frontend: 3000,
    configService: 3002,
    postgresql: 5432,
    redis: 6379,
    cooperate: 3091,
  };

  if (!fs.existsSync(BACKEND_ENV_PATH)) {
    return defaults;
  }

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
    };
  } catch (err) {
    return defaults;
  }
}

// 端口配置（动态读取）
let PORTS = getPorts();

// 可执行文件路径
const NODE_EXE = USE_RUNTIME
  ? IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'node', 'node.exe')
    : path.join(PLATFORM_DIR, 'node', 'bin', 'node')
  : 'node';

const PM2_JS = USE_RUNTIME
  ? IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'pm2', 'bin', 'pm2')
    : path.join(
        PLATFORM_DIR,
        'node',
        'node_modules',
        'pm2',
        'bin',
        'pm2'
      )
  : null;

// PM2 包装脚本路径（确保 PM2 daemon 能找到 node）
const PM2_CMD = USE_RUNTIME
  ? IS_WINDOWS
    ? path.join(PROJECT_ROOT, 'pm2.cmd')
    : path.join(PROJECT_ROOT, 'node', 'bin','pm2')
  : 'pm2';

// 使用真正的 pnpm.cjs，而不是 corepack 代理（离线环境下 corepack 会尝试联网）
const PNPM_JS = USE_RUNTIME
  ? path.join(PLATFORM_DIR, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  : path.join(PLATFORM_DIR, 'node', 'bin', 'pnpm');

// ==================== 工具函数 ====================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${colors[color] || ''}${message}${colors.reset}`);
}

function clearScreen() {
  console.clear();
}

function openBrowser(url) {
  let child;
  try {
    if (IS_WINDOWS) {
      child = spawn('cmd', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
      });
    } else if (IS_LINUX) {
      child = spawn('xdg-open', [url], {
        detached: true,
        stdio: 'ignore',
      });
    } else {
      child = spawn('open', [url], {
        detached: true,
        stdio: 'ignore',
      });
    }

    // 处理 spawn 错误，防止未捕获的异常
    child.on('error', () => {
      // 静默忽略打开浏览器的错误
    });

    child.unref();
  } catch {
    // 静默忽略打开浏览器的错误
  }
}

async function checkHttpHealth(port, path, timeout = 60000) {
  const http = require('http');
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const tryCheck = () => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path,
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            retry();
          }
        }
      );

      req.on('error', () => retry());
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
      req.end();
    };

    const retry = () => {
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`健康检查超时 (${timeout / 1000}s)`));
      } else {
        setTimeout(tryCheck, 1000);
      }
    };

    tryCheck();
  });
}

async function waitAndOpenBrowsers() {
  log('cyan', '等待所有服务就绪...');

  const services = [
    {
      port: PORTS.backend,
      name: '后端服务',
      path: '/api/health/live',
      type: 'http',
      url: `http://localhost:${PORTS.backend}/api/docs`,
    },
    {
      port: PORTS.configService,
      name: '配置中心',
      path: '/health',
      type: 'http',
      url: `http://localhost:${PORTS.configService}`,
    },
    {
      port: PORTS.frontend,
      name: '前端页面',
      type: 'port',
      url: `http://localhost:${PORTS.frontend}`,
    },
  ];

  const readyServices = [];

  for (const service of services) {
    try {
      if (service.type === 'http') {
        await checkHttpHealth(service.port, service.path, 60000);
      } else {
        await waitForPort(service.port, service.name, 60000);
      }
      log('green', `  ✓ ${service.name} 已就绪`);
      readyServices.push(service);
    } catch (err) {
      log('yellow', `  ⚠ ${service.name} 启动超时，跳过打开浏览器`);
    }
  }

  console.log('');
  log('cyan', '正在打开浏览器...');

  for (const service of readyServices) {
    openBrowser(service.url);
  }
}

async function waitForPort(port, name, timeout = 30000) {
  const net = require('net');
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.on('connect', () => {
        socket.destroy();
        log('green', `  ✓ ${name} 已就绪 (端口 ${port})`);
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        retry();
      });

      socket.on('error', () => {
        socket.destroy();
        retry();
      });

      socket.connect(port, '127.0.0.1');
    };

    const retry = () => {
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`${name} 启动超时 (${timeout / 1000}s)`));
      } else {
        setTimeout(tryConnect, 500);
      }
    };

    tryConnect();
  });
}

function printHeader() {
  console.log('');
  console.log(
    `${colors.bright}${colors.cyan}╔══════════════════════════════════════════╗`
  );
  console.log(`║        CloudCAD 运维管理中心             ║`);
  console.log(`╚══════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`  平台: ${PLATFORM}`);
  console.log(`  模式: ${USE_RUNTIME ? '内嵌 runtime' : '系统环境'}`);
  console.log(`  PM2:  ${PM2_JS && fs.existsSync(PM2_JS) ? '可用' : '不可用'}`);
  console.log('');
}

// ==================== 执行函数 ====================

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: options.silent ? 'pipe' : 'inherit',
    shell: IS_WINDOWS,
    env: {
      ...process.env,
      ...options.env,
    },
  });
  return result.status === 0;
}

/**
 * 运行命令并捕获输出，实时显示进度
 */
function runCommandWithProgress(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: IS_WINDOWS,
      env: {
        ...process.env,
        ...options.env,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      // 实时输出
      if (!options.silent) {
        process.stdout.write(output);
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      // 实时输出
      if (!options.silent) {
        process.stderr.write(output);
      }
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
      });
    });
  });
}

function runPnpm(args, options = {}) {
  // 设置 PATH：包含 node bin 目录和 node_modules/.bin
  const nodeBinDir = IS_LINUX
    ? path.join(PLATFORM_DIR, 'node', 'bin')
    : path.join(PLATFORM_DIR, 'node');
  
  const nodeModulesBinDirs = [
    path.join(PROJECT_ROOT, 'node_modules', '.bin'),
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.bin'),
  ];
  
  const existingPath = process.env.PATH || '';
  const pathParts = [nodeBinDir, ...nodeModulesBinDirs, existingPath];
  const newPath = pathParts.join(path.delimiter);
  
  // 创建独立的环境变量对象，不影响 process.env
  const env = Object.assign({}, process.env, options.env, {
    PATH: newPath,
    COREPACK_ENABLE: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  });

  if (PNPM_JS && fs.existsSync(PNPM_JS)) {
    return runCommand(NODE_EXE, [PNPM_JS, ...args], { ...options, env });
  }
  return runCommand('pnpm', args, { ...options, env });
}

function runPm2(args, options = {}) {
  // 优先使用 pm2.cmd/pm2 包装脚本，确保 PM2 daemon 能找到 node
  // 包装脚本会设置 PATH，daemon 继承后能正确 spawn('node', ...)
  if (PM2_CMD && fs.existsSync(PM2_CMD)) {
    return runCommand(PM2_CMD, args, {
      ...options,
      env: {
        ...options.env,
        PM2_HOME,
      },
    });
  }

  // 回退：直接使用 node 运行 pm2.js（需要手动设置 PATH）
  if (!PM2_JS || !fs.existsSync(PM2_JS)) {
    log('red', '[错误] PM2 不可用');
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

function runInNewWindow(title, command, args) {
  if (IS_WINDOWS) {
    const cmd =
      args.length > 0
        ? `start "${title}" cmd /k "${command} ${args.join(' ')}"`
        : `start "${title}" cmd /k "${command}"`;
    spawn('cmd', ['/c', cmd], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      shell: true,
    }).unref();
  } else {
    // Linux: 使用 gnome-terminal 或 xterm
    const terminal = process.env.TERM_PROGRAM || 'xterm';
    spawn(terminal, ['-e', `${command} ${args.join(' ')}`], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

// ==================== 业务逻辑 ====================

async function startInfrastructure(usePm2 = true) {
  log('blue', '[1/3] 启动基础服务...');

  if (usePm2) {
    if (!PM2_JS || !fs.existsSync(PM2_JS) || !USE_RUNTIME) {
      log('red', '[错误] PM2 不可用，请确保 runtime 环境已正确安装');
      return false;
    }

    const ecosystemPath = path.join(RUNTIME_DIR, 'ecosystem.config.js');

    // 先停止旧进程
    runPm2(['delete', 'all'], { silent: true });
    // 启动基础服务（包含部署配置中心）
    if (
      !runPm2([
        'start',
        ecosystemPath,
        '--only',
        'postgresql,redis,cooperate,config-service',
      ])
    ) {
      log('red', '[错误] 基础服务启动失败');
      return false;
    }

    log('green', '[✓] 基础服务已启动（PM2 模式）');
    return true;
  } else {
    // 前台模式：使用独立脚本启动
    const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
    const redisManagerScript = path.join(
      RUNTIME_DIR,
      'scripts',
      'redis-manager.js'
    );
    const cooperateScript = path.join(
      RUNTIME_DIR,
      'scripts',
      'cooperate-manager.js'
    );
    const configServiceScript = path.join(
      PROJECT_ROOT,
      'packages',
      'config-service',
      'server.js'
    );

    const pgProcess = spawn(NODE_EXE, [pgManagerScript, 'start'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: IS_WINDOWS,
      detached: false,
    });
    childProcesses.add(pgProcess);
    log('cyan', '  PostgreSQL 已启动');

    const redisProcess = spawn(NODE_EXE, [redisManagerScript, 'start'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: IS_WINDOWS,
      detached: false,
    });
    childProcesses.add(redisProcess);
    log('cyan', '  Redis 已启动');

    if (fs.existsSync(cooperateScript)) {
      const cooperateProcess = spawn(NODE_EXE, [cooperateScript], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: IS_WINDOWS,
        detached: false,
      });
      childProcesses.add(cooperateProcess);
      log('cyan', '  协同服务已启动');
    }

    if (fs.existsSync(configServiceScript)) {
      const configProcess = spawn(NODE_EXE, [configServiceScript], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: IS_WINDOWS,
        detached: false,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          CONFIG_SERVICE_PORT: String(PORTS.configService),
        },
      });
      childProcesses.add(configProcess);
      log('cyan', '  配置中心已启动');
    }

    log('green', '[✓] 基础服务已启动（前台模式）');
    return true;
  }
}

async function stopInfrastructure() {
  log('blue', '停止所有服务...');

  // 1. 调用各管理脚本的 stop 命令
  const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
  const redisManagerScript = path.join(
    RUNTIME_DIR,
    'scripts',
    'redis-manager.js'
  );

  if (fs.existsSync(pgManagerScript)) {
    log('cyan', '停止 PostgreSQL...');
    runCommand(NODE_EXE, [pgManagerScript, 'stop'], { silent: true });
  }

  // Redis 没有独立的 stop 命令，后面通过进程名处理

  // 2. 停止 PM2 管理的进程
  if (PM2_JS && fs.existsSync(PM2_JS)) {
    runPm2(['stop', 'all'], { silent: true });
    runPm2(['delete', 'all'], { silent: true });
    // 停止 PM2 daemon
    runPm2(['kill'], { silent: true });
  }

  // 3. 通过进程名杀死残留进程（兜底）
  if (IS_WINDOWS) {
    const processNames = [
      { exe: 'postgres.exe', name: 'PostgreSQL' },
      { exe: 'redis-server.exe', name: 'Redis' },
      { exe: 'mxcadassembly.exe', name: 'Cooperate' },
      { exe: 'node.exe', name: 'Node.js' },
    ];

    for (const proc of processNames) {
      const result = spawnSync(
        'tasklist',
        ['/FI', `IMAGENAME eq ${proc.exe}`, '/FO', 'CSV', '/NH'],
        {
          encoding: 'utf8',
          shell: true,
        }
      );

      const lines = result.stdout
        .split('\n')
        .filter((line) => line.includes(proc.exe));
      for (const line of lines) {
        const match = line.match(/"([^"]+)"/g);
        if (match && match.length >= 2) {
          const pid = match[1].replace(/"/g, '');
          if (pid && pid !== 'PID') {
            log('cyan', `停止 ${proc.name} (PID: ${pid})...`);
            spawnSync('taskkill', ['/F', '/PID', pid], {
              shell: true,
              stdio: 'pipe',
            });
          }
        }
      }
    }
  } else {
    // Linux: 通过进程名杀死
    const processNames = ['postgres', 'redis-server', 'mxcadassembly', 'node'];
    for (const name of processNames) {
      spawnSync('pkill', ['-f', name], { stdio: 'pipe' });
    }
  }

  log('green', '[✓] 服务已停止');
}

// ==================== 数据库备份与恢复 ====================

/**
 * 列出所有备份文件
 * @returns {Array<{name: string, path: string, size: number, modified: Date}>}
 */
function listBackupFiles() {
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) return [];

  return fs
    .readdirSync(backupDir)
    .filter((file) => file.startsWith('db_backup_') && file.endsWith('.sql'))
    .map((file) => {
      const fullPath = path.join(backupDir, file);
      const stats = fs.statSync(fullPath);
      return {
        name: file,
        path: fullPath,
        size: stats.size,
        modified: stats.mtime,
      };
    })
    .sort((a, b) => b.modified - a.modified); // 按时间倒序
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 获取 pg_dump 路径
 */
function getPgDumpPath() {
  if (USE_RUNTIME) {
    return IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'pg_dump.exe')
      : path.join(PLATFORM_DIR, 'postgres', 'bin', 'pg_dump');
  }
  return IS_WINDOWS ? 'pg_dump.exe' : 'pg_dump';
}

/**
 * 获取 psql 路径
 */
function getPsqlPath() {
  if (USE_RUNTIME) {
    return IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'psql.exe')
      : path.join(PLATFORM_DIR, 'postgres', 'bin', 'psql');
  }
  return IS_WINDOWS ? 'psql.exe' : 'psql';
}

/**
 * 获取 PostgreSQL lib 路径（Linux）
 */
function getPostgresLibPath() {
  return path.join(PLATFORM_DIR, 'postgres', 'lib');
}

/**
 * 获取所有运行时库路径（PostgreSQL、SVN 等）
 * 用于设置 LD_LIBRARY_PATH
 */
function getRuntimeLibPaths() {
  if (!IS_LINUX || !USE_RUNTIME) return '';
  
  const paths = [
    path.join(PLATFORM_DIR, 'postgres', 'lib'),
    path.join(PLATFORM_DIR, 'subversion', 'lib'),
    // 如果有其他运行时库，也加到这里
  ].filter(p => fs.existsSync(p));
  
  return paths.join(':');
}

/**
 * 构建数据库命令的环境变量
 */
function getDbEnv() {
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  const envConfig = parseEnvFile(envPath);

  return {
    env: {
      ...process.env,
      PGPASSWORD: envConfig.DB_PASSWORD || '',
      ...(IS_LINUX && USE_RUNTIME
        ? {
            LD_LIBRARY_PATH: getRuntimeLibPaths(),
          }
        : {}),
    },
    config: envConfig,
  };
}

/**
 * 检查数据库是否存在
 */
async function checkDatabaseExists(host, port, user, database) {
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    return false;
  }

  const { env } = getDbEnv();

  // 使用 shell 方式确保 stdout 能正确捕获，关键是要正确转义 SQL 中的引号
  const cmd = `"${psqlPath}" -h "${host}" -p "${port}" -U "${user}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${database}'"`;

  const result = spawnSync(cmd, [], {
    env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  // 命令执行成功，检查输出
  if (result.status === 0) {
    return result.stdout && result.stdout.trim() === '1';
  }

  // 命令执行失败，区分处理
  const errorMsg = (result.stderr || result.stdout || '').toLowerCase();

  // 密码错误/认证失败 - 无法确定，假设存在
  if (
    errorMsg.includes('password') ||
    errorMsg.includes('authentication') ||
    errorMsg.includes('invalid password')
  ) {
    log('yellow', '⚠️  数据库认证失败，假设数据库已存在');
    return true;
  }

  // 其他错误（如 psql 不存在）- 无法确定
  log('yellow', `⚠️  数据库检查失败: ${result.stderr || result.stdout}`);
  return false;
}

/**
 * 检查数据库是否为空（无用户表）
 */
async function isDatabaseEmpty(host, port, user, database) {
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    return true;
  }

  const { env } = getDbEnv();

  // 检查是否存在 users 表（或其他核心表）来判断数据库是否为空
  const cmd = `"${psqlPath}" -h "${host}" -p "${port}" -U "${user}" -d "${database}" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public' LIMIT 1"`;

  const result = spawnSync(cmd, [], {
    env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  // 如果查询失败或没有结果，认为是空数据库
  if (result.status !== 0) {
    return true;
  }

  const hasUsersTable = result.stdout && result.stdout.trim() === '1';
  return !hasUsersTable;
}

/**
 * 备份数据库
 * @param {Object} options - 选项
 * @param {string} options.backupDir - 备份目录（可选）
 * @param {string} options.filename - 文件名（可选）
 * @returns {Promise<boolean>} - 是否成功
 */
async function backupDatabase(options = {}) {
  log('blue', '📦 正在备份数据库...');

  const backupDir = options.backupDir || path.join(DATA_DIR, 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = options.filename || `db_backup_${timestamp}.sql`;
  const backupFile = path.join(backupDir, filename);

  // 确保备份目录存在
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 读取数据库配置
  const { env, config: envConfig } = getDbEnv();

  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';

  // 确定 pg_dump 路径
  const pgDumpPath = getPgDumpPath();
  if (!fs.existsSync(pgDumpPath)) {
    log('red', `❌ 未找到 pg_dump 工具：${pgDumpPath}`);
    return false;
  }

  // 构建命令参数
  const args = [
    '-h',
    dbHost,
    '-p',
    dbPort,
    '-U',
    dbUser,
    '-d',
    dbName,
    '-f',
    backupFile,
    '--no-owner',
    '--no-privileges',
    '--clean',
    '--if-exists',
  ];

  log('cyan', `执行: ${path.basename(pgDumpPath)} ${args.join(' ')}`);

  const result = spawnSync(pgDumpPath, args, {
    env,
    shell: IS_WINDOWS,
    stdio: 'pipe',
    timeout: 120000, // 120 秒超时
  });

  if (result.status === 0 && fs.existsSync(backupFile)) {
    const size = fs.statSync(backupFile).size;
    log('green', `✅ 数据库备份成功`);
    log('cyan', `   文件：${path.relative(PROJECT_ROOT, backupFile)}`);
    log('cyan', `   大小：${formatSize(size)}`);

    // 自动清理旧备份（保留 10 个）
    cleanupOldBackups(10);

    return true;
  } else {
    const errOutput = result.stderr ? result.stderr.toString() : '未知错误';
    log('red', `❌ 数据库备份失败：${errOutput}`);
    return false;
  }
}

/**
 * 列出备份文件
 */
async function listBackups() {
  log('blue', '📋 数据库备份列表');

  const backups = listBackupFiles();
  if (backups.length === 0) {
    log('yellow', '没有找到备份文件');
    return;
  }

  console.log('');
  console.log(
    `${colors.cyan}序号  备份文件名                              大小          创建时间${colors.reset}`
  );
  console.log('─'.repeat(90));

  backups.forEach((backup, index) => {
    const sizeStr = formatSize(backup.size).padStart(12);
    const timeStr = backup.modified.toLocaleString('zh-CN');
    const numStr = (index + 1).toString().padStart(4);

    console.log(`${numStr}  ${backup.name.padEnd(40)} ${sizeStr}  ${timeStr}`);
  });

  console.log('');
  log('cyan', `共 ${backups.length} 个备份`);
}

/**
 * 提示用户选择备份文件
 */
async function promptSelectBackup(backups) {
  console.log('');
  log('cyan', '可用的备份文件：');
  backups.forEach((backup, index) => {
    log('cyan', `  ${index + 1}. ${backup.name} (${formatSize(backup.size)})`);
  });
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(
      `${colors.yellow}请选择要恢复的备份编号 (或输入 q 取消): ${colors.reset}`,
      (ans) => {
        rl.close();
        resolve(ans.trim());
      }
    );
  });

  if (answer.toLowerCase() === 'q') {
    log('yellow', '已取消恢复');
    return null;
  }

  const index = parseInt(answer, 10) - 1;
  if (isNaN(index) || index < 0 || index >= backups.length) {
    log('red', '❌ 无效的选择');
    return null;
  }

  return backups[index].path;
}

/**
 * 提示用户确认
 */
async function promptConfirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(`${colors.yellow}${message}${colors.reset}`, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });

  return answer === 'yes' || answer === 'y';
}

/**
 * 恢复数据库
 * @param {string} backupFile - 备份文件路径（可选）
 * @returns {Promise<boolean>} - 是否成功
 */
async function restoreDatabase(backupFile) {
  log('blue', '🔄 数据库恢复');
  console.log('');

  // 如果没有指定文件，列出备份供用户选择
  if (!backupFile) {
    const backups = listBackupFiles();
    if (backups.length === 0) {
      log('red', '❌ 没有找到备份文件');
      return false;
    }

    backupFile = await promptSelectBackup(backups);
    if (!backupFile) return false;
  }

  // 验证备份文件存在
  if (!fs.existsSync(backupFile)) {
    log('red', `❌ 备份文件不存在：${backupFile}`);
    return false;
  }

  // 警告用户并确认
  log('yellow', '⚠️  警告：恢复操作将覆盖当前数据库！');
  log('cyan', `目标备份：${path.relative(PROJECT_ROOT, backupFile)}`);
  console.log('');

  const confirmed = await promptConfirm('是否继续？(yes/no): ');
  if (!confirmed) {
    log('yellow', '已取消恢复');
    return false;
  }

  // 读取数据库配置
  const { env, config: envConfig } = getDbEnv();

  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';

  // 确定 psql 路径
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    log('red', `❌ 未找到 psql 工具：${psqlPath}`);
    return false;
  }

  // 构建命令参数
  const args = [
    '-h',
    dbHost,
    '-p',
    dbPort,
    '-U',
    dbUser,
    '-d',
    dbName,
    '-f',
    backupFile,
  ];

  log('cyan', `执行: ${path.basename(psqlPath)} ${args.join(' ')}`);
  console.log('');

  // 执行恢复
  const result = spawnSync(psqlPath, args, {
    env,
    shell: IS_WINDOWS,
    stdio: 'inherit', // 显示实时进度
    timeout: 180000, // 180 秒超时
  });

  console.log('');

  // 检查结果
  if (result.status === 0) {
    log('green', '✅ 数据库恢复成功');
    return true;
  } else {
    log('red', '❌ 数据库恢复失败');
    return false;
  }
}

/**
 * 清理旧备份
 * @param {number} maxBackups - 保留数量（默认 10）
 * @returns {Promise<{deleted: number, kept: number}>}
 */
async function cleanupOldBackups(maxBackups = 10) {
  const backups = listBackupFiles();
  if (backups.length <= maxBackups) {
    if (backups.length > 0) {
      log(
        'cyan',
        `备份文件数量 (${backups.length}) 未超过限制 (${maxBackups})，无需清理`
      );
    }
    return { deleted: 0, kept: backups.length };
  }

  const toDelete = backups.slice(maxBackups);
  let deleted = 0;

  log('blue', `🧹 正在清理旧备份，保留最新的 ${maxBackups} 个...`);

  for (const backup of toDelete) {
    try {
      fs.unlinkSync(backup.path);
      log('cyan', `   已清理：${backup.name}`);
      deleted++;
    } catch (err) {
      log('yellow', `   清理失败：${backup.name} - ${err.message}`);
    }
  }

  log(
    'green',
    `清理完成：删除 ${deleted} 个，保留 ${backups.length - deleted} 个`
  );
  return { deleted, kept: backups.length - deleted };
}

// ==================== 数据库迁移 ====================

/**
 * 创建数据库（如果不存在）
 */
async function createDatabase(host, port, user, database) {
  const psqlPath = getPsqlPath();
  if (!fs.existsSync(psqlPath)) {
    log('red', `[错误] psql 不存在: ${psqlPath}`);
    return false;
  }

  const { env } = getDbEnv();

  log('cyan', `正在创建数据库: ${database} ...`);

  // 使用 shell 方式执行命令
  const cmd = `"${psqlPath}" -h "${host}" -p "${port}" -U "${user}" -d postgres -c "CREATE DATABASE ${database}"`;

  const result = spawnSync(cmd, [], {
    env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const errorMsg = result.stderr || result.stdout || '未知错误';
    log('red', `[错误] 数据库创建失败: ${errorMsg}`);
    return false;
  }

  return true;
}

/**
 * 检查是否有待应用的迁移
 * @returns {Promise<boolean>} - 是否有 pending migrations
 */
async function hasPendingMigrations() {
  try {
    const isWin = IS_WINDOWS;
    const pnpmCmd =
      PNPM_JS && fs.existsSync(PNPM_JS) ? `"${NODE_EXE}" "${PNPM_JS}"` : 'pnpm';

    const cmd = `${pnpmCmd} --filter backend prisma migrate status`;
    const result = spawnSync(cmd, [], {
      cwd: PROJECT_ROOT,
      shell: isWin,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    if (result.status === 0) {
      return false;
    }

    const output = result.stdout || result.stderr || '';
    const pendingMatch = output.match(
      /(\d+)\s*migrations?\s*have not yet been applied/i
    );
    if (pendingMatch) {
      const count = parseInt(pendingMatch[1], 10);
      return count > 0;
    }

    return true;
  } catch {
    return true;
  }
}

async function fixMigrationStatus() {
  log('cyan', '检查数据库迁移状态...');

  const statusResult = runPnpm(
    ['--filter', 'backend', 'prisma', 'migrate', 'status'],
    {
      captureOutput: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  if (statusResult) {
    log('cyan', '[跳过] 迁移状态正常');
    return true;
  }

  // 迁移状态异常，解析错误并修复
  log('yellow', '⚠️  检测到迁移状态异常，尝试自动修复...');

  // 解析 migrate status 输出找出失败的迁移
  // 常见问题：
  // 1. 数据库有失败迁移记录但本地无文件 -> 标记为 rolled back
  // 2. 迁移已应用但字段已存在 -> 标记为 applied

  // 尝试获取失败迁移名称
  const statusOutput = execSync(`pnpm --filter backend prisma migrate status`, {
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
  });

  // 查找数据库中存在但本地不存在的迁移
  const dbOnlyMigrationMatch = statusOutput.match(
    /The migration from the database are not found locally in prisma\/migrations:\s*(\d+)/
  );
  // 查找未应用的迁移
  const pendingMatch = statusOutput.match(
    /The migration have not yet been applied:\s*(\d+)/
  );

  if (dbOnlyMigrationMatch) {
    const failedMigration = dbOnlyMigrationMatch[1];
    log('cyan', `修复: 标记失败迁移 ${failedMigration} 为 rolled back`);
    execSync(
      `pnpm --filter backend prisma migrate resolve --rolled-back ${failedMigration}`,
      {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      }
    );
  }

  if (pendingMatch) {
    const pendingMigration = pendingMatch[1];
    log('cyan', `修复: 标记待处理迁移 ${pendingMigration} 为 applied`);
    execSync(
      `pnpm --filter backend prisma migrate resolve --applied ${pendingMigration}`,
      {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      }
    );
  }

  // 再次检查状态
  const retryResult = runPnpm(
    ['--filter', 'backend', 'prisma', 'migrate', 'status'],
    {
      captureOutput: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  if (!retryResult) {
    log('yellow', '⚠️  自动修复后仍有异常，但继续尝试部署');
    return true; // 不阻塞部署流程
  }

  log('green', '[✓] 迁移状态已修复');
  return true;
}

/**
 * 迁移前预检
 * 检查是否有破坏性变更、数据库大小等
 */
async function preflightMigrationCheck() {
  log('cyan', '执行迁移前检查...');
  console.log('');

  // 1. 检查数据库大小
  try {
    const { config: envConfig } = getDbEnv();
    const dbHost = envConfig.DB_HOST || 'localhost';
    const dbPort = envConfig.DB_PORT || '5432';
    const dbUser = envConfig.DB_USERNAME || 'postgres';
    const dbName = envConfig.DB_DATABASE || 'cloudcad';

    const dbSize = await getDatabaseSize(dbHost, dbPort, dbUser, dbName);
    const dbSizeGB = (dbSize / (1024 * 1024 * 1024)).toFixed(2);

    log('cyan', `  数据库大小: ${dbSizeGB} GB`);

    if (dbSize > 10 * 1024 * 1024 * 1024) {
      // 10GB
      log('yellow', '  ⚠️  数据库较大，索引创建可能需要几分钟');
      log('yellow', '  提示：使用 CONCURRENTLY 模式，不会阻塞读写操作');
      console.log('');
    }
  } catch (err) {
    log('yellow', '  ⚠️  无法获取数据库大小，继续执行');
    console.log('');
  }

  // 2. 检查是否有 CONCURRENTLY 索引创建
  try {
    const migrationsDir = path.join(
      PROJECT_ROOT,
      'packages',
      'backend',
      'prisma',
      'migrations'
    );

    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs
        .readdirSync(migrationsDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      let hasConcurrentIndex = false;
      for (const migration of migrationFiles) {
        const sqlFile = path.join(migrationsDir, migration, 'migration.sql');
        if (fs.existsSync(sqlFile)) {
          const sqlContent = fs.readFileSync(sqlFile, 'utf8');
          if (sqlContent.includes('CREATE INDEX CONCURRENTLY')) {
            hasConcurrentIndex = true;
            break;
          }
        }
      }

      if (hasConcurrentIndex) {
        log('green', '  ✓ 检测到 CONCURRENTLY 索引创建（零停机）');
        console.log('');
      }
    }
  } catch (err) {
    // 忽略检查错误
  }

  return true;
}

/**
 * 获取数据库大小（字节）
 */
async function getDatabaseSize(host, port, user, dbName) {
  const { execSync } = require('child_process');

  try {
    // 使用 psql 查询数据库大小
    const cmd = `psql -h ${host} -p ${port} -U ${user} -d ${dbName} -t -c "SELECT pg_database_size('${dbName}');"`;

    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' },
    });

    const size = parseInt(result.trim(), 10);
    return isNaN(size) ? 0 : size;
  } catch (err) {
    return 0;
  }
}

async function runDatabaseMigration() {
  log('blue', '[2/3] 执行数据库迁移...');

  // 检查 .env 文件是否存在
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    log('red', '[错误] apps/backend/.env 文件不存在');
    log('cyan', '请先配置数据库连接信息');
    return false;
  }

  // 检查 Prisma Client 是否已存在（部署包预生成）
  const prismaReady = checkPrismaClientExists();

  if (prismaReady) {
    log('cyan', '[跳过] Prisma Client 已就绪（来自部署包）');
  } else {
    // 生成 Prisma Client（离线模式，使用预下载的引擎）
    log('cyan', '生成 Prisma Client...');
    if (!runPnpm(['--filter', 'backend', 'db:generate'])) {
      log('red', '[错误] Prisma Client 生成失败');
      return false;
    }
  }

  // 检查数据库是否存在
  const { config: envConfig } = getDbEnv();
  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';

  let dbExists = await checkDatabaseExists(dbHost, dbPort, dbUser, dbName);

  if (!dbExists) {
    log('yellow', '⚠️  数据库不存在，正在创建数据库...');
    if (!(await createDatabase(dbHost, dbPort, dbUser, dbName))) {
      log('red', '[错误] 数据库创建失败，请手动创建数据库');
      return false;
    }
    log('green', '[✓] 数据库创建成功');
    dbExists = true;
  }

  // 检查是否有待应用的迁移，只有存在时才备份
  const hasPending = await hasPendingMigrations();
  if (hasPending && dbExists) {
    log('blue', '📦 检测到待应用迁移，正在备份数据库...');
    
    // 执行迁移前预检
    await preflightMigrationCheck();
    
    const backupSuccess = await backupDatabase();

    if (!backupSuccess) {
      log('yellow', '⚠️  数据库备份失败！');
      log('yellow', '如果继续部署，迁移失败时将无法恢复数据。');
      console.log('');

      const confirmed = await promptConfirm('是否继续部署？(yes/no): ');
      if (!confirmed) {
        log('yellow', '已取消部署');
        return false;
      }
    }
  } else {
    log('cyan', '[跳过] 无待应用迁移，无需备份数据库');
  }

  // === 始终使用 migrate deploy（推荐方式）===
  // migrate deploy 会自动处理空数据库和已有数据库的情况
  log('cyan', '正在应用数据库迁移 (migrate deploy)...');
  log('cyan', `数据库: ${dbName}`);
  console.log('');
  
  // 显示迁移开始时间
  const startTime = Date.now();
  log('blue', '┌─ 迁移进度 ──────────────────────────────────┐');
  log('blue', '│  开始执行数据库迁移...                      │');
  log('blue', '└─────────────────────────────────────────────┘');
  console.log('');

  // 使用 -F (filter) + exec 来正确执行 prisma 命令
  const migrationResult = await runCommandWithProgress(
    PNPM_JS && fs.existsSync(PNPM_JS) ? NODE_EXE : 'pnpm',
    PNPM_JS && fs.existsSync(PNPM_JS)
      ? [PNPM_JS, '-F', 'backend', 'exec', 'prisma', 'migrate', 'deploy']
      : ['-F', 'backend', 'exec', 'prisma', 'migrate', 'deploy'],
    { silent: false }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!migrationResult.success) {
    log('blue', '┌─ 迁移结果 ──────────────────────────────────┐');
    log('red', `│  ❌ 迁移失败 (耗时: ${elapsed}s)                   │`);
    log('blue', '└─────────────────────────────────────────────┘');
    console.log('');
    log('red', '[错误] 数据库迁移失败，请检查上方日志');
    console.log('');

    // 解析失败迁移名称并自动标记为 rolled-back
    const errorOutput = migrationResult.stderr || migrationResult.stdout || '';
    
    // 匹配 "Migration name: 20260414100000_sync_enum_changes" 格式
    const migrationMatch = errorOutput.match(/Migration name:\s*([^\s\n]+)/);
    // 或者匹配 "The `20260414100000_sync_enum_changes` migration started at" 格式
    const altMigrationMatch = errorOutput.match(/The `([^`]+)` migration started at/);
    
    const failedMigrationName = migrationMatch?.[1] || altMigrationMatch?.[1];

    if (failedMigrationName) {
      log('yellow', `检测到失败迁移: ${failedMigrationName}`);
      log('cyan', '正在自动标记为 rolled-back...');
      
      const resolveResult = spawnSync(
        PNPM_JS && fs.existsSync(PNPM_JS) ? NODE_EXE : 'pnpm',
        PNPM_JS && fs.existsSync(PNPM_JS)
          ? [PNPM_JS, '-F', 'backend', 'exec', 'prisma', 'migrate', 'resolve', '--rolled-back', failedMigrationName]
          : ['-F', 'backend', 'exec', 'prisma', 'migrate', 'resolve', '--rolled-back', failedMigrationName],
        {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
          shell: IS_WINDOWS,
          encoding: 'utf-8',
        }
      );

      if (resolveResult.status === 0) {
        log('green', '[✓] 失败迁移已标记为 rolled-back');
        log('cyan', '提示：请检查迁移脚本后重新运行部署');
      } else {
        log('red', `[错误] 标记失败: ${resolveResult.stderr || '未知错误'}`);
      }
    } else {
      log('yellow', '提示：无法解析失败迁移名称，请手动执行:');
      log('cyan', '  npx prisma migrate resolve --rolled-back <migration_name>');
    }
    
    return false;
  }

  log('blue', '┌─ 迁移结果 ──────────────────────────────────┐');
  log('green', `│  ✅ 迁移成功 (耗时: ${elapsed}s)                   │`);
  log('blue', '└─────────────────────────────────────────────┘');
  console.log('');
  log('green', '[✓] 数据库迁移完成');
  return true;
}

async function runDatabaseSeed() {
  log('blue', '执行种子数据...');

  if (!runPnpm(['--filter', 'backend', 'db:seed'])) {
    log('red', '[错误] 种子数据执行失败');
    return false;
  }

  log('green', '[✓] 种子数据完成');
  return true;
}

async function devMode() {
  clearScreen();
  printHeader();
  log('bright', '>>> 开发模式');
  console.log('');

  // 1. 启动基础服务（前台模式）
  if (!(await startInfrastructure(false))) {
    return;
  }

  // 等待基础服务就绪
  log('cyan', '等待服务就绪...');
  try {
    await waitForPort(PORTS.postgresql, 'PostgreSQL', 30000);
    await waitForPort(PORTS.redis, 'Redis', 30000);
  } catch (err) {
    log('red', `[错误] ${err.message}`);
    return;
  }

  // 2. 数据库迁移
  if (!(await runDatabaseMigration())) {
    return;
  }

  // 3. 启动开发服务器（新窗口）
  log('blue', '[3/3] 启动开发服务器...');

  runInNewWindow('CloudCAD Backend', 'pnpm', ['--filter', 'backend', 'dev']);
  runInNewWindow('CloudCAD Frontend', 'pnpm', ['--filter', 'frontend', 'dev']);

  console.log('');
  log('green', '╔════════════════════════════════════════╗');
  log('green', '║        开发环境已就绪                   ║');
  log('green', '╠════════════════════════════════════════╣');
  log('green', '║  后端:  http://localhost:' + PORTS.backend + '           ║');
  log('green', '║  前端:  http://localhost:' + PORTS.frontend + '           ║');
  log('green', '║  API:   http://localhost:' + PORTS.backend + '/api       ║');
  log('green', '║  API文档: http://localhost:' + PORTS.backend + '/api/docs ║');
  log(
    'green',
    '║  配置:  http://localhost:' + PORTS.configService + '           ║'
  );
  log('green', '╠════════════════════════════════════════╣');
  log('green', '║  停止:  选择菜单 [停止服务]             ║');
  log('green', '╚════════════════════════════════════════╝');

  await waitAndOpenBrowsers();
}

// 递归删除目录
function rimdir(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const curPath = path.join(dir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        rimdir(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dir);
  }
}

// 检查服务是否运行
function isServiceRunning(serviceName) {
  const result = spawnSync(NODE_EXE, [PM2_JS, 'show', serviceName], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PM2_HOME },
    shell: IS_WINDOWS,
  });
  return result.status === 0 && !result.stdout.includes('not found');
}

async function deployMode(skipBuild = false) {
  clearScreen();
  printHeader();
  log('bright', '>>> 部署模式');
  console.log('');

  // 0. 询问启动模式（一开始就确定）
  console.log(`${colors.cyan}请选择启动模式：${colors.reset}`);
  console.log('');
  console.log(
    `  ${colors.cyan}[1]${colors.reset} PM2 后台运行（生产模式，推荐）`
  );
  console.log(
    `  ${colors.cyan}[2]${colors.reset} 前台运行（终端关闭则服务退出）`
  );
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const modeChoice = await new Promise((resolve) => {
    rl.question(`${colors.bright}请输入选项 [1]: ${colors.reset}`, (ans) => {
      rl.close();
      resolve(ans.trim() || '1');
    });
  });

  const usePm2 = modeChoice !== '2';

  console.log('');

  // 1. 启动基础服务
  if (!(await startInfrastructure(usePm2))) {
    return;
  }

  // 等待基础服务就绪
  log('cyan', '等待服务就绪...');
  try {
    await waitForPort(PORTS.postgresql, 'PostgreSQL', 30000);
    await waitForPort(PORTS.redis, 'Redis', 30000);
  } catch (err) {
    log('red', `[错误] ${err.message}`);
    return;
  }

  // 2. 数据库迁移（依赖已在 setupOffline 中安装）
  if (!(await runDatabaseMigration())) {
    return;
  }

  // 3. 检测是否已有构建产物
  const backendDist = path.join(PROJECT_ROOT, 'packages', 'backend', 'dist');
  const frontendDist = path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist');

  const hasBackendDist =
    fs.existsSync(backendDist) && fs.readdirSync(backendDist).length > 0;
  const hasFrontendDist =
    fs.existsSync(frontendDist) && fs.readdirSync(frontendDist).length > 0;
  const hasDist = hasBackendDist && hasFrontendDist;

  let shouldBuild = true;

  if (skipBuild) {
    if (!hasBackendDist) {
      log('red', '[错误] 指定了 --skip-build 但构建产物不存在');
      return;
    }
    log('green', '[3/5] 跳过构建，使用现有 dist');
    shouldBuild = false;
  } else if (hasDist) {
    log('yellow', '[3/5] 检测到已有构建产物');
    console.log('');
    log('cyan', '  后端 dist: ' + (hasBackendDist ? '✓ 存在' : '✗ 不存在'));
    log('cyan', '  前端 dist: ' + (hasFrontendDist ? '✓ 存在' : '✗ 不存在'));
    console.log('');

    // 询问用户是否重新构建
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      rl2.question(
        `${colors.yellow}是否重新构建？(y/N): ${colors.reset}`,
        (ans) => {
          rl2.close();
          resolve(ans.trim().toLowerCase());
        }
      );
    });

    shouldBuild = answer === 'y' || answer === 'yes';

    if (!shouldBuild) {
      log('green', '[✓] 跳过构建，使用现有 dist');
    }
  }

  // 4. 构建前后端（如果需要）
  if (shouldBuild) {
    log('blue', '[3/5] 清理旧构建文件...');
    rimdir(backendDist);
    rimdir(frontendDist);
    log('green', '[✓] 清理完成');

    log('blue', '[4/5] 构建前后端...');

    if (!runPnpm(['build'])) {
      log('red', '[错误] 构建失败');
      return;
    }

    log('green', '[✓] 构建完成');
  }

  // 5. 启动服务（使用统一的函数）
  await startAppServices(usePm2 ? 'pm2' : 'foreground');
}

/**
 * 统一的应用服务启动函数
 * @param {'pm2' | 'foreground'} mode - 启动模式
 */
async function startAppServices(mode) {
  const backendDist = path.join(
    PROJECT_ROOT,
    'packages',
    'backend',
    'dist',
    'main.js'
  );
  const frontendScript = path.join(RUNTIME_DIR, 'scripts', 'serve-static.js');

  if (!fs.existsSync(backendDist)) {
    log('red', '[错误] 后端 dist 不存在');
    return;
  }
  if (!fs.existsSync(frontendScript)) {
    log('red', '[错误] 前端服务脚本不存在');
    return;
  }

  const modeLabel = mode === 'pm2' ? 'PM2 后台模式' : '前台模式';
  log('blue', `[5/5] 启动生产服务 (${modeLabel})...`);

  if (mode === 'pm2') {
    // PM2 后台模式
    const backendRunning = isServiceRunning('backend');
    const frontendRunning = isServiceRunning('frontend');

    // 后端服务环境变量
    const backendEnv = {
      NODE_ENV: 'production',
      PORT: String(PORTS.backend),
      FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
    };
    


    const backendConfig = {
      name: 'backend',
      script: backendDist,
      cwd: path.join(PROJECT_ROOT, 'packages', 'backend'),
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: backendEnv,
    };

    const frontendConfig = {
      name: 'frontend',
      script: frontendScript,
      cwd: PROJECT_ROOT,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        FRONTEND_PORT: String(PORTS.frontend),
        BACKEND_URL: `http://localhost:${PORTS.backend}`,
      },
    };

    const tempConfigPath = path.join(DATA_DIR, 'pm2-deploy.config.js');
    fs.writeFileSync(
      tempConfigPath,
      `module.exports = { apps: [${JSON.stringify(backendConfig)}, ${JSON.stringify(frontendConfig)}] };`
    );

    if (backendRunning || frontendRunning) {
      log('yellow', '检测到服务已在运行，正在重启更新...');
      runPm2(['restart', tempConfigPath]);
    } else {
      runPm2(['start', tempConfigPath]);
    }
  } else {
    // 前台模式
    log('cyan', '启动后端服务...');
    
    // 构建后端环境变量
    const backendEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORTS.backend),
      FRONTEND_URL: `http://localhost:${PORTS.frontend}`,
    };
        
    const backendProcess = spawn(NODE_EXE, [backendDist], {
      cwd: path.join(PROJECT_ROOT, 'packages', 'backend'),
      stdio: 'inherit',
      shell: IS_WINDOWS,
      detached: false,
      env: backendEnv,
    });
    childProcesses.add(backendProcess);

    log('cyan', '启动前端服务...');
    const frontendProcess = spawn(NODE_EXE, [frontendScript], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: IS_WINDOWS,
      detached: false,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        FRONTEND_PORT: String(PORTS.frontend),
        BACKEND_URL: `http://localhost:${PORTS.backend}`,
      },
    });
    childProcesses.add(frontendProcess);

    setupSignalHandlers();
  }

  console.log('');
  log('green', '╔════════════════════════════════════════╗');
  log(
    'green',
    `║        服务已启动 (${modeLabel})${' '.repeat(Math.max(0, 20 - modeLabel.length))}║`
  );
  log('green', '╠════════════════════════════════════════╣');
  log('green', '║  后端:  http://localhost:' + PORTS.backend + '           ║');
  log('green', '║  前端:  http://localhost:' + PORTS.frontend + '           ║');
  log('green', '║  API:   http://localhost:' + PORTS.backend + '/api       ║');
  log('green', '║  API文档: http://localhost:' + PORTS.backend + '/api/docs ║');
  log(
    'green',
    '║  配置:  http://localhost:' + PORTS.configService + '           ║'
  );
  log('green', '╠════════════════════════════════════════╣');
  log('green', '║  停止:  选择菜单 [停止服务]             ║');
  log('green', '╚════════════════════════════════════════╝');

  await waitAndOpenBrowsers();

  if (mode === 'foreground') {
    // 前台模式：等待所有进程退出
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        let allExited = true;
        for (const proc of childProcesses) {
          if (!proc.killed && !proc.exitCode) {
            allExited = false;
            break;
          }
        }
        if (allExited) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }
}

async function startOnly() {
  clearScreen();
  printHeader();
  log('bright', '>>> 启动基础服务');
  console.log('');

  if (!(await startInfrastructure())) {
    return;
  }

  console.log('');
  log('green', '[✓] 基础服务已启动');
  log('cyan', '  PostgreSQL: localhost:' + PORTS.postgresql);
  log('cyan', '  Redis:      localhost:' + PORTS.redis);
  log('cyan', '  协同服务:   localhost:' + PORTS.cooperate);
  log('cyan', '  配置中心:   localhost:' + PORTS.configService);
}

// ==================== 启动模式（PM2 / 前台） ====================

const childProcesses = new Set();

async function testConnection() {
  const envPath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    return false;
  }

  const envConfig = parseEnvFile(envPath);
  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = parseInt(envConfig.DB_PORT || '5432');
  const redisHost = envConfig.REDIS_HOST || 'localhost';
  const redisPort = parseInt(envConfig.REDIS_PORT || '6379');

  let dbOk = false;
  let redisOk = false;

  // 测试数据库
  try {
    await waitForPort(dbPort, 'PostgreSQL', 5000);
    dbOk = true;
  } catch (e) {
    log('yellow', `[警告] 数据库连接失败: ${e.message}`);
  }

  // 测试 Redis
  try {
    await waitForPort(redisPort, 'Redis', 5000);
    redisOk = true;
  } catch (e) {
    log('yellow', `[警告] Redis 连接失败: ${e.message}`);
  }

  return dbOk && redisOk;
}

async function startMode() {
  // 检查构建产物是否存在
  const backendDist = path.join(
    PROJECT_ROOT,
    'packages',
    'backend',
    'dist',
    'src',
    'main.js'
  );
  const frontendDist = path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist');

  if (!fs.existsSync(backendDist)) {
    clearScreen();
    printHeader();
    log('red', '>>> 错误：后端构建产物不存在');
    console.log('');
    log('yellow', '请先构建项目：');
    console.log(`  ${colors.cyan}pnpm build${colors.reset}`);
    console.log('');
    log('cyan', '或使用部署模式（包含构建）：');
    console.log(`  ${colors.cyan}./cloudcad.sh deploy${colors.reset}`);
    console.log('');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => {
      rl.question(`${colors.bright}按回车键退出...${colors.reset}`, () => {
        rl.close();
        resolve();
      });
    });
    process.exit(1);
  }

  if (!fs.existsSync(frontendDist)) {
    log('yellow', '[警告] 前端构建产物不存在，前端服务将不可用');
  }

  // 询问启动模式
  console.log('');
  console.log(`${colors.cyan}请选择启动模式：${colors.reset}`);
  console.log('');
  console.log(`  ${colors.cyan}[1]${colors.reset} PM2 后台运行（生产模式）`);
  console.log(
    `  ${colors.cyan}[2]${colors.reset} 前台运行（终端关闭则服务退出）`
  );
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const choice = await new Promise((resolve) => {
    rl.question(`${colors.bright}请输入选项 [1]: ${colors.reset}`, (ans) => {
      rl.close();
      resolve(ans.trim() || '1');
    });
  });

  console.log('');

  const usePm2 = choice !== '2';

  // 启动基础服务
  log('cyan', '正在停止现有服务...');
  await stopInfrastructure();

  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (usePm2) {
    // PM2 模式
    if (!PM2_JS || !fs.existsSync(PM2_JS) || !USE_RUNTIME) {
      log('yellow', '[提示] PM2 不可用，将使用前台模式启动');
      await startAppServicesWithInfra('foreground');
    } else {
      await startAppServicesWithInfra('pm2');
    }
  } else {
    // 前台模式
    await startAppServicesWithInfra('foreground');
  }
}

/**
 * 启动基础服务 + 应用服务（用于 startMode）
 */
async function startAppServicesWithInfra(mode) {
  log('blue', '[1/2] 启动基础服务...');

  if (mode === 'pm2') {
    // PM2 模式
    const ecosystemPath = path.join(RUNTIME_DIR, 'ecosystem.config.js');

    if (
      !runPm2([
        'start',
        ecosystemPath,
        '--only',
        'postgresql,redis,cooperate,config-service',
      ])
    ) {
      log('red', '[错误] 基础服务启动失败');
      return;
    }
  } else {
    // 前台模式
    const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
    const redisManagerScript = path.join(
      RUNTIME_DIR,
      'scripts',
      'redis-manager.js'
    );
    const cooperateScript = path.join(
      RUNTIME_DIR,
      'scripts',
      'cooperate-manager.js'
    );
    const configServiceScript = path.join(
      PROJECT_ROOT,
      'packages',
      'config-service',
      'server.js'
    );

    const pgProcess = spawn(NODE_EXE, [pgManagerScript, 'start'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: IS_WINDOWS,
      detached: false,
    });
    childProcesses.add(pgProcess);
    log('cyan', '  PostgreSQL 已启动');

    const redisProcess = spawn(NODE_EXE, [redisManagerScript, 'start'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: IS_WINDOWS,
      detached: false,
    });
    childProcesses.add(redisProcess);
    log('cyan', '  Redis 已启动');

    if (fs.existsSync(cooperateScript)) {
      const cooperateProcess = spawn(NODE_EXE, [cooperateScript], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: IS_WINDOWS,
        detached: false,
      });
      childProcesses.add(cooperateProcess);
      log('cyan', '  协同服务已启动');
    }

    if (fs.existsSync(configServiceScript)) {
      const configProcess = spawn(NODE_EXE, [configServiceScript], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: IS_WINDOWS,
        detached: false,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          CONFIG_SERVICE_PORT: String(PORTS.configService),
        },
      });
      childProcesses.add(configProcess);
      log('cyan', '  配置中心已启动');
    }
  }

  // 等待基础服务就绪
  log('cyan', '等待服务就绪...');
  let connected = false;

  while (!connected) {
    try {
      await waitForPort(PORTS.postgresql, 'PostgreSQL', 30000);
      await waitForPort(PORTS.redis, 'Redis', 30000);
      connected = true;
    } catch (err) {
      log('red', `[错误] ${err.message}`);
      console.log('');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise((resolve) => {
        rl.question(
          `${colors.yellow}是否重新配置？(Y/n): ${colors.reset}`,
          (ans) => {
            rl.close();
            resolve(ans.trim().toLowerCase());
          }
        );
      });

      if (answer !== 'n' && answer !== 'no') {
        await runSetupWizard();
        connected = true;
      } else {
        log('yellow', '跳过配置，启动可能失败');
        connected = true;
      }
    }
  }

  log('green', '[✓] 基础服务已启动');

  // 启动应用服务
  log('blue', '[2/2] 启动应用服务...');
  await startAppServices(mode);
}

function setupSignalHandlers() {
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGHUP');

  const cleanup = async () => {
    console.log('\n');
    log('yellow', '[信号] 正在停止所有服务...');
    cleanupForeground();
    await stopInfrastructure();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  if (IS_WINDOWS) {
    process.on('SIGHUP', cleanup);
  }
}

function cleanupForeground() {
  for (const proc of childProcesses) {
    if (!proc.killed) {
      try {
        proc.kill('SIGTERM');
      } catch (e) {}
    }
  }
  childProcesses.clear();
}

async function viewStatus() {
  clearScreen();
  printHeader();
  log('bright', '>>> 服务状态');
  console.log('');

  if (PM2_JS && fs.existsSync(PM2_JS)) {
    runPm2(['status']);
  } else {
    log('yellow', 'PM2 不可用，无法查看状态');
  }
}

async function viewLogs() {
  clearScreen();
  printHeader();
  log('bright', '>>> 服务日志');
  console.log('');

  if (PM2_JS && fs.existsSync(PM2_JS)) {
    runPm2(['logs']);
  } else {
    log('yellow', 'PM2 不可用，无法查看日志');
  }
}

async function linuxInit() {
  clearScreen();
  printHeader();
  log('bright', '>>> Linux 环境初始化');
  console.log('');

  if (!IS_LINUX) {
    log('yellow', '此功能仅适用于 Linux 系统');
    log('cyan', '当前系统: ' + PLATFORM);
    return;
  }

  const mxcadDir = path.join(RUNTIME_DIR, '..', 'linux', 'mxcad');

  if (!fs.existsSync(mxcadDir)) {
    log('yellow', `mxcad 目录不存在: ${mxcadDir}`);
    log('yellow', 'MxCAD 转换功能将不可用，请手动配置');
    return;
  }

  let hasError = false;

  // 1. 设置 mxcadassembly 可执行权限
  const mxcadAssemblyPath = path.join(mxcadDir, 'mxcadassembly');
  if (fs.existsSync(mxcadAssemblyPath)) {
    const result = spawnSync('chmod', ['+x', mxcadAssemblyPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status === 0) {
      log('green', '[✓] 已设置 mxcadassembly 可执行权限');
    } else {
      log(
        'yellow',
        '[!] 设置权限失败，请手动执行: sudo chmod +x runtime/linux/mxcad/mxcadassembly'
      );
      hasError = true;
    }
  } else {
    log('yellow', '[!] mxcadassembly 程序不存在，转换功能将不可用');
    hasError = true;
  }

  // 2. 设置 mx/so 目录权限
  const mxSoPath = path.join(mxcadDir, 'mx', 'so');
  if (fs.existsSync(mxSoPath)) {
    const result = spawnSync('chmod', ['-R', '755', mxSoPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status === 0) {
      log('green', '[✓] 已设置 mx/so 目录权限');
    } else {
      log(
        'yellow',
        '[!] 设置权限失败，请手动执行: sudo chmod -R 755 runtime/linux/mxcad/mx/so'
      );
      hasError = true;
    }
  }

  // 3. 复制 locale 文件到系统目录（需要 sudo）
  const localeSourcePath = path.join(mxcadDir, 'mx', 'locale');
  const localeTargetPath = '/usr/local/share/locale';
  if (fs.existsSync(localeSourcePath)) {
    spawnSync('mkdir', ['-p', localeTargetPath], { stdio: 'pipe' });

    const result = spawnSync(
      'cp',
      ['-r', '-f', localeSourcePath, localeTargetPath],
      {
        encoding: 'utf8',
        stdio: 'pipe',
      }
    );
    if (result.status === 0) {
      log('green', '[✓] 已复制 locale 文件到系统目录');
    } else {
      log(
        'yellow',
        '[!] 复制 locale 失败，请手动执行: sudo cp -r -f runtime/linux/mxcad/mx/locale /usr/local/share/locale'
      );
      hasError = true;
    }
  }

  console.log('');
  if (hasError) {
    log('yellow', '部分初始化失败，请按上述提示手动修复');
  } else {
    log('green', 'Linux 环境初始化完成！');
  }
}

// ==================== 部署引导配置 ====================

/**
 * 检查密码强度
 * @param {string} password 密码
 * @returns {boolean} true 表示密码简单，需要警告
 */
function isPasswordWeak(password) {
  if (!password || password.length < 8) return true;

  // 检查是否只有数字或只有字母
  const hasDigit = /\d/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  // 如果只有数字或只有字母，认为简单
  if (
    (hasDigit && !hasLetter && !hasSpecial) ||
    (hasLetter && !hasDigit && !hasSpecial)
  ) {
    return true;
  }

  return false;
}

/**
 * 生成随机密码
 * @param {number} length 密码长度，默认 12
 * @returns {string} 随机密码
 */
function generateRandomPassword(length = 12) {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * 生成随机 JWT 密钥
 * @param {number} length 密钥长度，默认 32
 * @returns {string} 随机密钥
 */
function generateJwtSecret(length = 32) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

/**
 * 解析 .env 文件
 * @param {string} filePath .env 文件路径
 * @returns {Object} 键值对
 */
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};

  content.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;

    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      // 移除引号
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

/**
 * 写入 .env 文件（保留注释和格式）
 * @param {string} filePath .env 文件路径
 * @param {Object} updates 要更新的键值对
 */
function updateEnvFile(filePath, updates) {
  let content = fs.readFileSync(filePath, 'utf8');

  Object.entries(updates).forEach(([key, value]) => {
    // 匹配 key=value 或 key="value" 或 key='value'
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      // 检查值是否需要引号包裹
      // 需要：包含 #（注释字符）、空格、或特殊 shell 字符
      const needsQuotes = /[#\s$`!&|;<>]/.test(value);
      const escapedValue = needsQuotes
        ? `"${value.replace(/"/g, '\\"')}"`
        : value;
      content = content.replace(regex, `${key}=${escapedValue}`);
    }
  });

  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * 隐藏输入密码
 * @param {readline.Interface} rl readline 接口
 * @param {string} prompt 提示信息
 * @returns {Promise<string>} 用户输入
 */
function promptPassword(rl, promptText) {
  return new Promise((resolve) => {
    const stdout = process.stdout;

    // 先输出提示文本（在隐藏输入之前）
    process.stdout.write(promptText);

    // 保存原始 write 方法
    const originalWrite = stdout.write.bind(stdout);

    // 替换 write 方法，隐藏输入
    stdout.write = (chunk, encoding, callback) => {
      if (typeof chunk === 'string' && chunk !== '\n' && chunk !== '\r\n') {
        // 不输出任何内容（隐藏输入）
        return true;
      }
      return originalWrite(chunk, encoding, callback);
    };

    // 使用空字符串作为 question 的提示，因为已经手动输出了
    rl.question('', (answer) => {
      // 恢复原始 write 方法
      stdout.write = originalWrite;
      // 输出换行
      originalWrite('\n');
      resolve(answer);
    });
  });
}

/**
 * 密码二次确认输入
 * 用户输入密码两次，两次一致才返回，否则重新输入
 * @param {readline.Interface} rl readline 接口
 * @param {string} promptText 提示信息（如"数据库密码"）
 * @param {string} defaultAction 默认行为说明（如"[自动生成]"）
 * @returns {Promise<string|null>} 用户输入的密码，或 null 表示使用默认行为
 */
async function promptPasswordWithConfirm(rl, promptText, defaultAction = '') {
  const fullPrompt = `${promptText} ${defaultAction}: `;

  while (true) {
    // 第一次输入
    const first = await promptPassword(rl, fullPrompt);

    // 如果用户直接回车，表示使用默认行为
    if (!first.trim()) {
      return null;
    }

    // 第二次确认
    const second = await promptPassword(rl, `再次输入确认: `);

    if (first === second) {
      console.log(`  ✓ 两次输入一致`);
      return first.trim();
    }

    console.log(`  ✗ 两次输入不一致，请重新输入`);
    console.log('');
  }
}

/**
 * 运行部署引导配置
 */
async function runSetupWizard() {
  console.log('');
  console.log(`${colors.cyan}╔════════════════════════════════════════╗`);
  console.log(`║      CloudCAD 首次部署配置             ║`);
  console.log(`╚════════════════════════════════════════╝${colors.reset}`);
  console.log('');

  // 读取当前 .env 配置
  const envConfig = parseEnvFile(BACKEND_ENV_PATH);

  // 获取默认值
  const defaultDbPassword = envConfig.DB_PASSWORD || 'password';
  const defaultAdminPassword = envConfig.INITIAL_ADMIN_PASSWORD || 'Admin123!';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 需要更新的配置
  const updates = {};

  // JWT 密钥自动生成
  const jwtSecret = generateJwtSecret(32);
  updates.JWT_SECRET = jwtSecret;

  try {
    // 1. 数据库密码 - 不填写时自动生成
    console.log(`${colors.cyan}[核心配置]${colors.reset}`);
    console.log(`${colors.yellow}提示: 直接回车将自动生成密码${colors.reset}`);
    const dbPassword = await promptPasswordWithConfirm(
      rl,
      '数据库密码',
      '[回车自动生成]'
    );

    if (dbPassword) {
      updates.DB_PASSWORD = dbPassword;
    } else {
      // 自动生成数据库密码
      const generatedDbPassword = generateRandomPassword();
      updates.DB_PASSWORD = generatedDbPassword;
      console.log(`  → 已自动生成数据库密码`);
    }

    // 2. Redis 密码 - 不填写时无密码（合理）
    const redisPassword = await promptPasswordWithConfirm(
      rl,
      'Redis 密码',
      '[回车无密码]'
    );

    if (redisPassword) {
      updates.REDIS_PASSWORD = redisPassword;
    } else {
      console.log(`  → 无密码`);
    }

    // 3. 管理员密码 - 不填写时自动生成
    console.log('');
    console.log(`${colors.cyan}[安全配置]${colors.reset}`);
    console.log(`${colors.yellow}提示: 直接回车将自动生成密码${colors.reset}`);
    const adminPassword = await promptPasswordWithConfirm(
      rl,
      '管理员密码',
      '[回车自动生成]'
    );

    let finalAdminPassword;
    if (adminPassword) {
      finalAdminPassword = adminPassword;
      updates.INITIAL_ADMIN_PASSWORD = adminPassword;
    } else {
      // 自动生成
      finalAdminPassword = generateRandomPassword();
      updates.INITIAL_ADMIN_PASSWORD = finalAdminPassword;
      console.log(`  → 已自动生成管理员密码`);
    }

    // 显示所有密码
    console.log('');
    console.log(
      `${colors.yellow}╔════════════════════════════════════════╗${colors.reset}`
    );
    console.log(
      `${colors.yellow}║     以下密码请务必记录保存！         ║${colors.reset}`
    );
    console.log(
      `${colors.yellow}╚════════════════════════════════════════╝${colors.reset}`
    );
    console.log(
      `  ${colors.bright}数据库密码:${colors.reset} ${updates.DB_PASSWORD}`
    );
    console.log(
      `  ${colors.bright}Redis密码:${colors.reset} ${updates.REDIS_PASSWORD || '无密码'}`
    );
    console.log(
      `  ${colors.bright}管理员密码:${colors.reset} ${finalAdminPassword}`
    );
    console.log('');

    // 4. 配置摘要
    console.log('');
    console.log(
      `${colors.cyan}════════════════════════════════════════${colors.reset}`
    );
    console.log(`${colors.bright}配置摘要${colors.reset}`);
    console.log(
      `${colors.cyan}════════════════════════════════════════${colors.reset}`
    );
    console.log(
      `数据库: localhost:${PORTS.postgresql}/cloudcad (用户: postgres)`
    );
    console.log(
      `Redis:  localhost:${PORTS.redis} (密码: ${updates.REDIS_PASSWORD ? '******' : '无密码'})`
    );
    console.log(
      `管理员密码: ${updates.INITIAL_ADMIN_PASSWORD || '******'} (已在上方显示)`
    );
    console.log(`JWT密钥: 已自动生成`);
    console.log('');

    // 5. 确认配置
    const confirm = await new Promise((resolve) => {
      rl.question(`确认配置? [Y/n]: `, (ans) => {
        resolve(ans.trim().toLowerCase());
      });
    });

    if (confirm === 'n' || confirm === 'no') {
      rl.close();
      // 删除 .env 文件，以便下次运行时重新进入引导配置
      if (fs.existsSync(BACKEND_ENV_PATH)) {
        fs.unlinkSync(BACKEND_ENV_PATH);
      }
      console.log('');
      log('yellow', '已取消配置，请重新运行');
      process.exit(0);
    }

    // 6. 写入配置
    console.log('');
    log('cyan', '正在写入配置文件...');

    // 如果任一数据库配置变更，同步更新 DATABASE_URL
    const dbConfigKeys = [
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_DATABASE',
    ];
    const hasDbConfigChange = dbConfigKeys.some((key) => updates[key]);

    if (hasDbConfigChange) {
      const dbHost = updates.DB_HOST || envConfig.DB_HOST || 'localhost';
      const dbPort = updates.DB_PORT || envConfig.DB_PORT || '5432';
      const dbName = updates.DB_DATABASE || envConfig.DB_DATABASE || 'cloudcad';
      const dbUser = updates.DB_USERNAME || envConfig.DB_USERNAME || 'postgres';
      const dbPassword =
        updates.DB_PASSWORD || envConfig.DB_PASSWORD || 'password';
      const encodedPassword = encodeURIComponent(dbPassword);
      updates.DATABASE_URL = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
    }

    updateEnvFile(BACKEND_ENV_PATH, updates);
    log('green', '[✓] 配置完成！');
  } finally {
    rl.close();
  }
}

// ==================== 数据库备份与恢复子菜单 ====================

async function databaseBackupMenu() {
  while (true) {
    clearScreen();
    printHeader();
    log('bright', '>>> 数据库备份与恢复');
    console.log('');

    console.log(`${colors.cyan}请选择操作：${colors.reset}`);
    console.log('');
    console.log(`  ${colors.cyan}[1]${colors.reset} 手动备份数据库`);
    console.log(`  ${colors.cyan}[2]${colors.reset} 恢复数据库`);
    console.log(`  ${colors.cyan}[3]${colors.reset} 查看备份列表`);
    console.log(`  ${colors.cyan}[4]${colors.reset} 清理旧备份`);
    console.log(`  ${colors.cyan}[q]${colors.reset} 返回主菜单`);
    console.log('');

    const choice = await prompt();

    switch (choice) {
      case '1':
        await backupDatabase();
        break;
      case '2':
        await restoreDatabase();
        break;
      case '3':
        await listBackups();
        break;
      case '4':
        await cleanupOldBackups();
        break;
      case 'q':
        return;
      default:
        log('red', '无效选项');
    }

    if (choice !== 'q') {
      console.log('');
      await new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question(`${colors.bright}按回车键继续...${colors.reset}`, () => {
          rl.close();
          resolve();
        });
      });
    }
  }
}

// ==================== 交互式菜单 ====================

const menuItems = [
  { key: '1', label: '开发模式', action: devMode },
  { key: '2', label: '部署模式', action: deployMode },
  { key: '3', label: '启动基础服务', action: startOnly },
  { key: '4', label: '启动服务（含前后端）', action: startMode },
  { key: '5', label: '数据库迁移', action: runDatabaseMigration },
  { key: '6', label: '数据库种子', action: runDatabaseSeed },
  { key: '7', label: 'Linux 初始化（首次部署）', action: linuxInit },
  { key: '8', label: '查看状态', action: viewStatus },
  { key: '9', label: '查看日志', action: viewLogs },
  { key: '10', label: '数据库备份与恢复', action: databaseBackupMenu },
  { key: '0', label: '停止服务', action: stopInfrastructure },
  { key: 'q', label: '退出', action: () => process.exit(0) },
];

async function showMenu() {
  clearScreen();
  printHeader();

  console.log(`${colors.bright}请选择操作：${colors.reset}`);
  console.log('');

  for (const item of menuItems) {
    console.log(`  ${colors.cyan}[${item.key}]${colors.reset} ${item.label}`);
  }

  console.log('');
}

async function prompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${colors.bright}请输入选项: ${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  while (true) {
    await showMenu();
    const choice = await prompt();

    const item = menuItems.find((m) => m.key === choice);

    if (item) {
      await item.action();
      console.log('');
      await new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question(`${colors.bright}按回车键继续...${colors.reset}`, () => {
          rl.close();
          resolve();
        });
      });
    } else {
      log('red', '无效选项，请重新选择');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// ==================== 程序入口 ====================

/**
 * 异步入口函数
 * 先完成离线环境设置，再执行后续逻辑
 */
async function bootstrap() {
  // 检测 .env 是否存在（用于判断是否首次部署）
  const envExistedBefore = fs.existsSync(BACKEND_ENV_PATH);

  // 首先设置离线环境（必须在其他操作前完成）
  // 这会复制 .env.example → .env（如果 .env 不存在）
  const success = await setupOffline({
    silent: true,
    deployBackendOnly: isDeployMode, // 部署模式只装后端依赖
  });

  if (!success) {
    process.exit(1);
  }

  // 如果 .env 之前不存在，说明是首次部署，运行引导配置
  if (!envExistedBefore) {
    await runSetupWizard();
  }

  // 命令行参数支持
  // args 已在文件开头定义
  if (args.length > 0) {
    // 处理 --help
    if (args[0] === '--help' || args[0] === '-h') {
      showHelp();
      process.exit(0);
    }

    const commandMap = {
      dev: devMode,
      deploy: deployMode,
      start: startMode,
      stop: stopInfrastructure,
      migrate: runDatabaseMigration,
      seed: runDatabaseSeed,
      'db:backup': backupDatabase,
      'db:restore': restoreDatabase,
      'db:list': listBackups,
      'db:cleanup': cleanupOldBackups,
      init: linuxInit,
      status: viewStatus,
      logs: viewLogs,
    };

    const cmd = commandMap[args[0]];
    if (cmd) {
      // 支持 --skip-build 参数
      if (args[0] === 'deploy' && args.includes('--skip-build')) {
        await deployMode(true);
      }
      // 支持 db:cleanup --keep N
      else if (args[0] === 'db:cleanup') {
        const keepIndex = args.indexOf('--keep');
        const maxBackups =
          keepIndex !== -1 && args[keepIndex + 1]
            ? parseInt(args[keepIndex + 1], 10)
            : 10;
        await cleanupOldBackups(maxBackups);
      }
      // 支持 db:restore <文件>
      else if (args[0] === 'db:restore' && args[1]) {
        await restoreDatabase(args[1]);
      } else {
        await cmd();
      }
    } else {
      log('red', `未知命令: ${args[0]}`);
      log(
        'cyan',
        '可用命令: dev, deploy, start, stop, migrate, seed, db:backup, db:restore, db:list, db:cleanup, init, status, logs'
      );
      log('cyan', '  deploy             : 交互式部署，询问是否构建');
      log(
        'cyan',
        '  deploy --skip-build: 跳过构建，使用现有 dist 并安装生产依赖'
      );
      log('cyan', '  db:backup          : 手动备份数据库');
      log('cyan', '  db:restore [文件]  : 恢复数据库（可选指定备份文件）');
      log('cyan', '  db:list            : 查看备份列表');
      log('cyan', '  db:cleanup --keep N: 清理旧备份，保留 N 个（默认 10）');
      log('cyan', '');
      log('cyan', '查看帮助: ./cloudcad.sh --help');
      process.exit(1);
    }
  } else {
    await main();
  }
}

function showHelp() {
  clearScreen();
  printHeader();
  log('bright', '>>> 帮助信息');
  console.log('');
  console.log(`${colors.cyan}用法：${colors.reset}`);
  console.log(`  ${colors.green}./cloudcad.sh <命令> [选项]${colors.reset}`);
  console.log('');
  console.log(`${colors.cyan}命令：${colors.reset}`);
  console.log(
    `  ${colors.green}dev${colors.reset}               开发模式（启动基础服务 + 开发服务器）`
  );
  console.log(
    `  ${colors.green}deploy${colors.reset}            部署模式（构建 + 启动生产服务）`
  );
  console.log(
    `  ${colors.green}deploy --skip-build${colors.reset}  部署模式（使用现有构建产物）`
  );
  console.log(
    `  ${colors.green}start${colors.reset}              启动服务（选择 PM2/前台模式）`
  );
  console.log(`  ${colors.green}stop${colors.reset}              停止所有服务`);
  console.log(
    `  ${colors.green}migrate${colors.reset}            执行数据库迁移`
  );
  console.log(`  ${colors.green}seed${colors.reset}              执行种子数据`);
  console.log(
    `  ${colors.green}init${colors.reset}              Linux 环境初始化`
  );
  console.log(
    `  ${colors.green}status${colors.reset}             查看服务状态`
  );
  console.log(`  ${colors.green}logs${colors.reset}              查看服务日志`);
  console.log('');
  console.log(`${colors.cyan}数据库备份与恢复：${colors.reset}`);
  console.log(
    `  ${colors.green}db:backup${colors.reset}            手动备份数据库`
  );
  console.log(
    `  ${colors.green}db:restore [文件]${colors.reset}  恢复数据库（可选指定备份文件）`
  );
  console.log(
    `  ${colors.green}db:list${colors.reset}              查看备份列表`
  );
  console.log(
    `  ${colors.green}db:cleanup --keep N${colors.reset} 清理旧备份，保留 N 个（默认 10）`
  );
  console.log('');
  console.log(`${colors.cyan}启动模式说明：${colors.reset}`);
  console.log(
    `  ${colors.green}PM2 后台模式${colors.reset}  服务在后台运行，关闭终端不影响`
  );
  console.log(
    `  ${colors.green}前台模式${colors.reset}     服务在前台运行，关闭终端则服务停止`
  );
  console.log('');
  console.log(`${colors.cyan}示例：${colors.reset}`);
  console.log(
    `  ${colors.yellow}./cloudcad.sh start${colors.reset}           # 启动服务`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh deploy${colors.reset}         # 部署模式`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh stop${colors.reset}          # 停止服务`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh logs${colors.reset}          # 查看日志`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh db:backup${colors.reset}     # 手动备份数据库`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh db:list${colors.reset}       # 查看备份列表`
  );
  console.log(
    `  ${colors.yellow}./cloudcad.sh db:restore${colors.reset}    # 恢复数据库`
  );
}

// 启动程序
bootstrap().catch((err) => {
  console.error('程序启动失败:', err);
  process.exit(1);
});
