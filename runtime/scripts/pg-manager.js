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
// Windows: runtime/windows/postgresql/pgsql/bin/
// Linux:   runtime/linux/postgres/bin/ (extract-linux-runtime.js 创建的目录)
const PG_DIR_NAME = IS_WINDOWS ? 'postgresql' : 'postgres';
const PG_BIN_SUBDIR = IS_WINDOWS ? 'pgsql/bin' : 'bin';

const pg_ctl = USE_RUNTIME
  ? path.join(PLATFORM_DIR, PG_DIR_NAME, PG_BIN_SUBDIR, IS_WINDOWS ? 'pg_ctl.exe' : 'pg_ctl')
  : 'pg_ctl';

const initdb = USE_RUNTIME
  ? path.join(PLATFORM_DIR, PG_DIR_NAME, PG_BIN_SUBDIR, IS_WINDOWS ? 'initdb.exe' : 'initdb')
  : 'initdb';

const pg_isready = USE_RUNTIME
  ? path.join(PLATFORM_DIR, PG_DIR_NAME, PG_BIN_SUBDIR, IS_WINDOWS ? 'pg_isready.exe' : 'pg_isready')
  : 'pg_isready';

// Linux 下需要设置 LD_LIBRARY_PATH
const PG_LIB_DIR = USE_RUNTIME && IS_LINUX
  ? path.join(PLATFORM_DIR, PG_DIR_NAME, 'lib')
  : null;

// PostgreSQL share 目录（包含版本号）
// initdb 查找 share/postgresql/15/postgres.bki
const PG_SHARE_DIR = USE_RUNTIME
  ? path.join(PLATFORM_DIR, PG_DIR_NAME, 'share', 'postgresql', '15')
  : null;

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

// Linux 系统初始化（创建必要的目录和符号链接）
function initLinuxSystem() {
  if (!IS_LINUX) return true;
  
  // 1. 创建 PostgreSQL Unix socket 目录
  const pgSocketDir = '/var/run/postgresql';
  if (!fs.existsSync(pgSocketDir)) {
    try {
      fs.mkdirSync(pgSocketDir, { recursive: true });
      log('info', `创建 PostgreSQL socket 目录: ${pgSocketDir}`);
    } catch (e) {
      // 可能需要 root 权限，尝试使用 offline-data 目录
      log('warn', `无法创建 ${pgSocketDir}，使用替代路径`);
    }
  }
  
  // 2. 创建 PostgreSQL share 目录符号链接（PostgreSQL 硬编码路径）
  // share 目录结构: share/postgresql/15/postgres.bki
  const pgShareTarget = path.join(PLATFORM_DIR, PG_DIR_NAME, 'share', 'postgresql', '15');
  const pgShareLink = '/usr/share/postgresql/15';
  
  if (fs.existsSync(pgShareTarget) && !fs.existsSync(pgShareLink)) {
    try {
      // 确保父目录存在
      ensureDir('/usr/share/postgresql');
      fs.symlinkSync(pgShareTarget, pgShareLink, 'dir');
      log('info', `创建 PostgreSQL share 符号链接: ${pgShareLink} -> ${pgShareTarget}`);
    } catch (e) {
      // 可能需要 root 权限
      log('warn', `无法创建符号链接 ${pgShareLink}: ${e.message}`);
      // 尝试复制文件（备用方案）
      try {
        ensureDir(pgShareLink);
        spawnSync('cp', ['-r', `${pgShareTarget}/.`, pgShareLink], { stdio: 'pipe' });
        log('info', `已复制 PostgreSQL share 文件到 ${pgShareLink}`);
      } catch (copyErr) {
        log('warn', `复制 share 文件失败: ${copyErr.message}`);
      }
    }
  }
  
  // 3. 创建 postgres 用户（如果以 root 运行且用户不存在）
  if (process.getuid() === 0) {
    try {
      // 检查用户是否存在
      const result = spawnSync('id', ['postgres'], { stdio: 'pipe' });
      if (result.status !== 0) {
        spawnSync('useradd', ['-m', '-s', '/bin/bash', 'postgres'], { stdio: 'pipe' });
        log('info', '创建 postgres 用户');
      }
    } catch (e) {
      log('warn', `创建 postgres 用户失败: ${e.message}`);
    }
    
    // 设置 socket 目录权限
    if (fs.existsSync(pgSocketDir)) {
      try {
        spawnSync('chown', ['postgres:postgres', pgSocketDir], { stdio: 'pipe' });
      } catch (e) { /* ignore */ }
    }
  }
  
  return true;
}

// 获取带 LD_LIBRARY_PATH 的环境变量（Linux 下需要）
function getEnv(extra = {}) {
  const base = PG_LIB_DIR
    ? { ...process.env, LD_LIBRARY_PATH: `${PG_LIB_DIR}:${process.env.LD_LIBRARY_PATH || ''}` }
    : process.env;
  return { ...base, ...extra };
}

// 初始化数据目录
function initDatabase() {
  // 先执行 Linux 系统初始化
  initLinuxSystem();
  
  if (fs.existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) {
    return true;
  }
  
  log('info', '初始化 PostgreSQL 数据目录...');
  ensureDir(PG_DATA_DIR);
  
  // Linux 下 PostgreSQL 不允许以 root 运行
  if (IS_LINUX && process.getuid() === 0) {
    // 尝试创建 postgres 用户（如果不存在）
    try {
      const checkUser = spawnSync('id', ['postgres'], { stdio: 'pipe' });
      if (checkUser.status !== 0) {
        spawnSync('useradd', ['-m', '-s', '/bin/bash', 'postgres'], { stdio: 'pipe' });
        log('info', '创建 postgres 用户');
      }
    } catch (e) {
      // 用户可能已存在，忽略
    }
    // 更改数据目录所有者
    spawnSync('chown', ['-R', 'postgres:postgres', PG_DATA_DIR], { stdio: 'pipe' });
    
    // 构建 initdb 命令参数
    const initdbArgs = ['-D', PG_DATA_DIR, '-U', 'postgres', '-A', 'trust', '-E', 'utf8', '--locale=C'];
    if (PG_SHARE_DIR) {
      initdbArgs.push('-L', PG_SHARE_DIR);
    }
    
    // 尝试多种用户切换方式（优先 setpriv，不依赖 PAM）
    const envStr = PG_LIB_DIR ? `LD_LIBRARY_PATH=${PG_LIB_DIR} ` : '';
    const commands = [
      // 方式1: setpriv（不依赖 PAM，推荐）
      ['setpriv', '--reuid=postgres', '--regid=postgres', '--init-groups', 'env', `${envStr}PATH=${process.env.PATH}`, initdb, ...initdbArgs],
      // 方式2: su（传统方式）
      ['su', '-', 'postgres', '-c', `${envStr}${initdb} ${initdbArgs.join(' ')}`],
    ];
    
    for (const cmd of commands) {
      const result = spawnSync(cmd[0], cmd.slice(1), { 
        stdio: 'inherit',
        env: getEnv(),
      });
      if (result.status === 0) {
        log('info', '数据目录初始化完成');
        return true;
      }
      log('warn', `${cmd[0]} 切换用户失败，尝试下一种方式...`);
    }
    
    log('error', '数据目录初始化失败');
    return false;
  }
  
  // 构建 initdb 参数
  const initdbArgs = [
    '-D', PG_DATA_DIR,
    '-U', 'postgres',
    '-A', 'trust',
    '-E', 'utf8',
    '--locale=C'
  ];
  if (PG_SHARE_DIR) {
    initdbArgs.push('-L', PG_SHARE_DIR);
  }
  
  const result = spawnSync(initdb, initdbArgs, {
    stdio: 'inherit',
    shell: IS_WINDOWS,
    windowsHide: true,
    env: getEnv(),
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
      windowsHide: true,
      env: getEnv(),
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
  
  // Linux 下以 postgres 用户运行
  if (IS_LINUX && process.getuid() === 0) {
    // 确保日志目录权限
    spawnSync('chown', ['-R', 'postgres:postgres', LOGS_DIR], { stdio: 'pipe' });
    
    // 尝试多种用户切换方式
    const envStr = PG_LIB_DIR ? `LD_LIBRARY_PATH=${PG_LIB_DIR} ` : '';
    const pgCtlArgs = ['start', '-D', PG_DATA_DIR, '-l', logFile, '-w', '-t', '30'];
    
    const commands = [
      ['setpriv', '--reuid=postgres', '--regid=postgres', '--init-groups', 'env', `${envStr}PATH=${process.env.PATH}`, pg_ctl, ...pgCtlArgs],
      ['su', '-', 'postgres', '-c', `${envStr}${pg_ctl} start -D ${PG_DATA_DIR} -l ${logFile} -w -t 30`],
    ];
    
    for (const cmd of commands) {
      const result = spawnSync(cmd[0], cmd.slice(1), { 
        stdio: 'inherit',
        env: getEnv(),
      });
      if (result.status === 0) {
        log('info', 'PostgreSQL 启动成功');
        return true;
      }
      log('warn', `${cmd[0]} 切换用户失败，尝试下一种方式...`);
    }
    
    log('error', 'PostgreSQL 启动失败');
    return false;
  }
  
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
    env: getEnv({ PGDATA: PG_DATA_DIR }),
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
  
  // Linux 下以 postgres 用户运行
  if (IS_LINUX && process.getuid() === 0) {
    const envStr = PG_LIB_DIR ? `LD_LIBRARY_PATH=${PG_LIB_DIR} ` : '';
    const pgCtlArgs = ['stop', '-D', PG_DATA_DIR, '-m', 'fast', '-w', '-t', '30'];
    
    const commands = [
      ['setpriv', '--reuid=postgres', '--regid=postgres', '--init-groups', 'env', `${envStr}PATH=${process.env.PATH}`, pg_ctl, ...pgCtlArgs],
      ['su', '-', 'postgres', '-c', `${envStr}${pg_ctl} stop -D ${PG_DATA_DIR} -m fast -w -t 30`],
    ];
    
    for (const cmd of commands) {
      const result = spawnSync(cmd[0], cmd.slice(1), { 
        stdio: 'inherit',
        env: getEnv(),
      });
      if (result.status === 0) {
        log('info', 'PostgreSQL 已停止');
        return true;
      }
    }
    
    log('warn', 'PostgreSQL 停止可能失败');
    return false;
  }
  
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
    env: getEnv(),
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
