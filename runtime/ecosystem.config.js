/**
 * PM2 进程管理配置
 * 
 * 使用方式：
 *   pm2 start ecosystem.config.js    # 启动所有服务
 *   pm2 stop all                      # 停止所有服务
 *   pm2 restart all                   # 重启所有服务
 *   pm2 status                        # 查看状态
 *   pm2 logs                          # 查看日志
 *   pm2 monit                         # 监控面板
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = __dirname;
const PLATFORM_DIR = IS_WINDOWS
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

// 检测是否使用内嵌 runtime
const USE_RUNTIME = fs.existsSync(PLATFORM_DIR);

// 数据目录
const DATA_DIR = path.join(PROJECT_ROOT, 'offline-data');
const PG_DATA_DIR = path.join(DATA_DIR, 'postgres');
const REDIS_DATA_DIR = path.join(DATA_DIR, 'redis');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 可执行文件路径
const EXE = {
  node: USE_RUNTIME
    ? (IS_WINDOWS
        ? path.join(PLATFORM_DIR, 'node', 'node.exe')
        : path.join(PLATFORM_DIR, 'node', 'bin', 'node'))
    : 'node',
  postgres: USE_RUNTIME
    ? (IS_WINDOWS
        ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'postgres.exe')
        : path.join(PLATFORM_DIR, 'postgresql', 'bin', 'postgres'))
    : 'postgres',
  pg_ctl: USE_RUNTIME
    ? (IS_WINDOWS
        ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'pg_ctl.exe')
        : path.join(PLATFORM_DIR, 'postgresql', 'bin', 'pg_ctl'))
    : 'pg_ctl',
  redisServer: USE_RUNTIME
    ? (IS_WINDOWS
        ? path.join(PLATFORM_DIR, 'redis', 'redis-server.exe')
        : path.join(PLATFORM_DIR, 'redis', 'redis-server'))
    : 'redis-server',
  mxcadAssembly: USE_RUNTIME
    ? (IS_WINDOWS
        ? path.join(PLATFORM_DIR, 'mxcad', 'mxcadassembly.exe')
        : path.join(PLATFORM_DIR, 'mxcad', 'mxcadassembly'))
    : null,
};

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(DATA_DIR);
ensureDir(LOGS_DIR);
ensureDir(REDIS_DATA_DIR);

// PM2 应用配置
const apps = [];

// PostgreSQL（仅内嵌 runtime 模式）
if (USE_RUNTIME) {
  // PostgreSQL 初始化检查（启动前执行）
  const initdb = USE_RUNTIME
    ? (IS_WINDOWS
        ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'initdb.exe')
        : path.join(PLATFORM_DIR, 'postgresql', 'bin', 'initdb'))
    : 'initdb';
  
  // 检查数据目录是否已初始化
  if (!fs.existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) {
    ensureDir(PG_DATA_DIR);
    const { spawnSync } = require('child_process');
    console.log('[PM2] 初始化 PostgreSQL 数据目录...');
    spawnSync(initdb, [
      '-D', PG_DATA_DIR,
      '-U', 'postgres',
      '-A', 'trust',
      '-E', 'utf8',
      '--locale=C'
    ], { stdio: 'inherit', shell: IS_WINDOWS });
  }

  // PostgreSQL - 使用包装脚本管理（解决 Windows 下 postgres.exe 窗口问题）
  const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
  
  apps.push({
    name: 'postgresql',
    script: pgManagerScript,
    args: 'daemon',
    interpreter: EXE.node || 'node',
    cwd: PROJECT_ROOT,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    stop_exit_codes: [0],
    kill_timeout: 10000,
    wait_ready: true,
    env: {
      PGDATA: PG_DATA_DIR,
    },
  });

  // Redis - 使用包装脚本管理
  const redisManagerScript = path.join(RUNTIME_DIR, 'scripts', 'redis-manager.js');
  
  apps.push({
    name: 'redis',
    script: redisManagerScript,
    interpreter: EXE.node || 'node',
    cwd: PROJECT_ROOT,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '5s',
    kill_timeout: 10000,
  });

  // 协同服务 - 使用包装脚本管理
  if (EXE.mxcadAssembly && fs.existsSync(EXE.mxcadAssembly)) {
    const cooperateManagerScript = path.join(RUNTIME_DIR, 'scripts', 'cooperate-manager.js');
    
    apps.push({
      name: 'cooperate',
      script: cooperateManagerScript,
      interpreter: EXE.node || 'node',
      cwd: PROJECT_ROOT,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '5s',
      kill_timeout: 10000,
    });
  }
}

module.exports = {
  apps,
};
