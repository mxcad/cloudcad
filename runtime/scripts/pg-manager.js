/**
 * PostgreSQL 进程管理包装脚本
 * 
 * 用于 PM2 管理 PostgreSQL：
 * - 启动时执行 pg_ctl start
 * - 保持进程运行
 * - 退出时执行 pg_ctl stop
 */

const { spawnSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

// 配置
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..');
const PLATFORM_DIR = IS_WINDOWS 
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);
const DATA_DIR = path.join(PROJECT_ROOT, 'offline-data');
const PG_DATA_DIR = path.join(DATA_DIR, 'postgres');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 可执行文件路径
const pg_ctl = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'pg_ctl.exe')
      : path.join(PLATFORM_DIR, 'postgresql', 'bin', 'pg_ctl'))
  : 'pg_ctl';

const initdb = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'initdb.exe')
      : path.join(PLATFORM_DIR, 'postgresql', 'bin', 'initdb'))
  : 'initdb';

const pg_isready = USE_RUNTIME
  ? (IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'pg_isready.exe')
      : path.join(PLATFORM_DIR, 'postgresql', 'bin', 'pg_isready'))
  : 'pg_isready';

// 日志
function log(level, message) {
  const colors = {
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[level] || ''}[PG-${level.toUpperCase()}]${colors.reset} ${message}`);
}

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 初始化数据目录
function initDatabase() {
  if (fs.existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) {
    return true;
  }
  
  log('info', '初始化 PostgreSQL 数据目录...');
  ensureDir(PG_DATA_DIR);
  
  const result = spawnSync(initdb, [
    '-D', PG_DATA_DIR,
    '-U', 'postgres',
    '-A', 'trust',
    '-E', 'utf8',
    '--locale=C'
  ], {
    stdio: 'inherit',
    shell: IS_WINDOWS,
    windowsHide: true
  });
  
  if (result.status === 0) {
    log('info', '数据目录初始化完成');
    return true;
  }
  
  log('error', '数据目录初始化失败');
  return false;
}

// 检查 PostgreSQL 是否运行
function isRunning() {
  try {
    const result = spawnSync(pg_isready, ['-h', 'localhost', '-p', '5432'], {
      encoding: 'utf8',
      shell: IS_WINDOWS,
      timeout: 5000,
      windowsHide: true
    });
    return result.status === 0;
  } catch (e) {
    return false;
  }
}

// 启动 PostgreSQL
function startPostgres() {
  if (isRunning()) {
    log('info', 'PostgreSQL 已在运行');
    return true;
  }
  
  // 初始化
  if (!initDatabase()) {
    return false;
  }
  
  ensureDir(LOGS_DIR);
  const logFile = path.join(LOGS_DIR, 'postgres.log');
  
  log('info', '启动 PostgreSQL...');
  
  const result = spawnSync(pg_ctl, [
    'start',
    '-D', PG_DATA_DIR,
    '-l', logFile,
    '-w',  // 等待启动完成
    '-t', '30'  // 超时 30 秒
  ], {
    stdio: 'inherit',
    shell: IS_WINDOWS,
    windowsHide: true,
    env: {
      ...process.env,
      PGDATA: PG_DATA_DIR,
    }
  });
  
  if (result.status === 0) {
    log('info', 'PostgreSQL 启动成功');
    return true;
  }
  
  log('error', 'PostgreSQL 启动失败');
  return false;
}

// 停止 PostgreSQL
function stopPostgres() {
  if (!isRunning()) {
    log('info', 'PostgreSQL 未运行');
    return true;
  }
  
  log('info', '停止 PostgreSQL...');
  
  const result = spawnSync(pg_ctl, [
    'stop',
    '-D', PG_DATA_DIR,
    '-m', 'fast',
    '-w',
    '-t', '30'
  ], {
    stdio: 'inherit',
    shell: IS_WINDOWS,
    windowsHide: true,
    env: {
      ...process.env,
      PGDATA: PG_DATA_DIR,
    }
  });
  
  if (result.status === 0) {
    log('info', 'PostgreSQL 已停止');
    return true;
  }
  
  log('warn', 'PostgreSQL 停止可能失败');
  return false;
}

// 主函数
function main() {
  // 处理信号
  let shuttingDown = false;
  
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    
    log('info', `收到 ${signal} 信号，正在停止...`);
    stopPostgres();
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  if (IS_WINDOWS) {
    process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  }
  
  // 启动
  if (!startPostgres()) {
    process.exit(1);
  }
  
  // 保持进程运行，定期检查状态
  const checkInterval = setInterval(() => {
    if (!isRunning()) {
      log('warn', 'PostgreSQL 进程已退出，尝试重启...');
      if (!startPostgres()) {
        log('error', 'PostgreSQL 重启失败');
        clearInterval(checkInterval);
        process.exit(1);
      }
    }
  }, 5000);
  
  // 防止进程退出
  process.stdin.resume();
}

// 命令行支持
const args = process.argv.slice(2);
const command = args[0];

if (command === 'start') {
  startPostgres();
} else if (command === 'stop') {
  stopPostgres();
} else if (command === 'status') {
  console.log(isRunning() ? 'running' : 'stopped');
} else if (!command || command === 'daemon') {
  main();
} else {
  console.log('用法: node pg-manager.js [start|stop|status|daemon]');
  process.exit(1);
}
