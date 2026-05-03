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

// 检测是否使用内嵌 runtime（需要 node 目录存在才算完整）
const NODE_RUNTIME_PATH = IS_WINDOWS
  ? path.join(RUNTIME_DIR, 'windows', 'node', 'node.exe')
  : path.join(RUNTIME_DIR, 'linux', 'node', 'bin', 'node');
const USE_RUNTIME = fs.existsSync(NODE_RUNTIME_PATH);

// 数据目录（统一在 data/ 目录下）
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const PG_DATA_DIR = path.join(DATA_DIR, 'postgres');
const REDIS_DATA_DIR = path.join(DATA_DIR, 'redis');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 可执行文件路径
// Windows: runtime/windows/postgresql/pgsql/bin/
// Linux:   runtime/linux/postgres/bin/ (extract-linux-runtime.js 创建的目录)
const PG_DIR_NAME = IS_WINDOWS ? 'postgresql' : 'postgres';
const PG_BIN_SUBDIR = IS_WINDOWS ? 'pgsql/bin' : 'bin';
const PG_LIB_DIR = IS_WINDOWS
  ? null
  : path.join(PLATFORM_DIR, 'postgres', 'lib');

const EXE = {
  node: USE_RUNTIME
    ? IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'node', 'node.exe')
      : path.join(PLATFORM_DIR, 'node', 'bin', 'node')
    : 'node',
  postgres: USE_RUNTIME
    ? path.join(
        PLATFORM_DIR,
        PG_DIR_NAME,
        PG_BIN_SUBDIR,
        IS_WINDOWS ? 'postgres.exe' : 'postgres'
      )
    : 'postgres',
  pg_ctl: USE_RUNTIME
    ? path.join(
        PLATFORM_DIR,
        PG_DIR_NAME,
        PG_BIN_SUBDIR,
        IS_WINDOWS ? 'pg_ctl.exe' : 'pg_ctl'
      )
    : 'pg_ctl',
  redisServer: USE_RUNTIME
    ? IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'redis', 'redis-server.exe')
      : path.join(PLATFORM_DIR, 'redis', 'redis-server')
    : 'redis-server',
  mxcadAssembly: USE_RUNTIME
    ? IS_WINDOWS
      ? path.join(PLATFORM_DIR, 'mxcad', 'mxcadassembly.exe')
      : path.join(PLATFORM_DIR, 'mxcad', 'mxcadassembly')
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

// 检测 PostgreSQL runtime 是否存在
const PG_RUNTIME_EXISTS = IS_WINDOWS
  ? fs.existsSync(
      path.join(
        RUNTIME_DIR,
        'windows',
        'postgresql',
        'pgsql',
        'bin',
        'postgres.exe'
      )
    )
  : fs.existsSync(
      path.join(RUNTIME_DIR, 'linux', 'postgres', 'bin', 'postgres')
    );

// PostgreSQL（仅内嵌 runtime 模式）
if (PG_RUNTIME_EXISTS) {
  // PostgreSQL 初始化检查（启动前执行）
  const initdb = IS_WINDOWS
    ? path.join(
        RUNTIME_DIR,
        'windows',
        'postgresql',
        'pgsql',
        'bin',
        'initdb.exe'
      )
    : path.join(RUNTIME_DIR, 'linux', 'postgres', 'bin', 'initdb');

  // 检查数据目录是否已初始化
  if (!fs.existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) {
    ensureDir(PG_DATA_DIR);
    const { spawnSync } = require('child_process');
    console.log('[PM2] 初始化 PostgreSQL 数据目录...');

    // Linux 下 PostgreSQL 不允许以 root 运行，需要切换用户或使用 --allow-group-access
    if (IS_LINUX && process.getuid() === 0) {
      // 检查并修复路径权限，确保 postgres 用户可以访问
      const checkPathPermissions = (targetPath) => {
        const parts = targetPath.split('/').filter(Boolean);
        let currentPath = '';
        for (const part of parts) {
          currentPath += '/' + part;
          try {
            const stat = fs.statSync(currentPath);
            // 如果目录权限不是 755 或更宽松，修复为 755
            const mode = stat.mode & 0o777;
            if (mode < 0o755) {
              console.log(`[PM2] 修复目录权限: ${currentPath} (${mode.toString(8)} -> 755)`);
              fs.chmodSync(currentPath, 0o755);
            }
          } catch (e) {
            // 目录不存在，忽略
          }
        }
      };
      checkPathPermissions(initdb);
      
      // 尝试创建 postgres 用户（如果不存在）
      try {
        spawnSync('useradd', ['-m', 'postgres'], { stdio: 'pipe' });
      } catch (e) {
        // 用户可能已存在，忽略错误
      }
      // 更改数据目录所有者
      spawnSync('chown', ['-R', 'postgres:postgres', PG_DATA_DIR], {
        stdio: 'inherit',
      });
      
      // 获取 PostgreSQL lib 目录和 share 目录
      const pgLibDir = path.join(PLATFORM_DIR, 'postgres', 'lib');
      const pgShareDir = path.join(PLATFORM_DIR, 'postgres', 'share', 'postgresql', '15');
      
      // 以 postgres 用户身份初始化（设置 LD_LIBRARY_PATH 和 -L 指定 share 目录）
      const result = spawnSync(
        'su',
        [
          '-',
          'postgres',
          '-c',
          `LD_LIBRARY_PATH=${pgLibDir} ${initdb} -D ${PG_DATA_DIR} -U postgres -A trust -E utf8 --locale=C -L ${pgShareDir}`,
        ],
        { stdio: 'inherit' }
      );
      if (result.status !== 0) {
        console.log('[PM2] PostgreSQL 数据目录初始化失败');
      }
    } else {
      // 非 root 用户：设置 LD_LIBRARY_PATH 和 -L 参数
      const pgLibDir = IS_LINUX ? path.join(PLATFORM_DIR, 'postgres', 'lib') : null;
      const pgShareDir = IS_LINUX 
        ? path.join(PLATFORM_DIR, 'postgres', 'share', 'postgresql', '15')
        : null;
      
      const args = [
        '-D', PG_DATA_DIR,
        '-U', 'postgres',
        '-A', 'trust',
        '-E', 'utf8',
        '--locale=C',
      ];
      
      if (pgShareDir) {
        args.push('-L', pgShareDir);
      }
      
      spawnSync(initdb, args, {
        stdio: 'inherit',
        shell: IS_WINDOWS,
        env: pgLibDir ? { ...process.env, LD_LIBRARY_PATH: pgLibDir } : process.env,
      });
    }
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
  const redisManagerScript = path.join(
    RUNTIME_DIR,
    'scripts',
    'redis-manager.js'
  );

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
    const cooperateManagerScript = path.join(
      RUNTIME_DIR,
      'scripts',
      'cooperate-manager.js'
    );

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

// 部署配置中心 - 独立服务，端口 3002
// 用于管理 .env 配置文件，使用 INITIAL_ADMIN_PASSWORD 认证
const configServiceScript = path.join(
  PROJECT_ROOT,
  'packages',
  'config-service',
  'server.js'
);
if (fs.existsSync(configServiceScript)) {
  // 读取端口配置
  let configServicePort = 3002;
  const backendEnvPath = path.join(PROJECT_ROOT, 'apps', 'backend', '.env');
  if (fs.existsSync(backendEnvPath)) {
    const envContent = fs.readFileSync(backendEnvPath, 'utf8');
    const match = envContent.match(/CONFIG_SERVICE_PORT\s*=\s*(\d+)/);
    if (match) {
      configServicePort = parseInt(match[1], 10);
    }
  }

  apps.push({
    name: 'config-service',
    script: configServiceScript,
    interpreter: EXE.node || 'node',
    cwd: PROJECT_ROOT,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '5s',
    kill_timeout: 5000,
    env: {
      NODE_ENV: 'production',
      CONFIG_SERVICE_PORT: configServicePort,
    },
  });
}

module.exports = {
  apps,
};
