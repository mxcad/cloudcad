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
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const PG_DATA_DIR = path.join(DATA_DIR, 'postgres');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 可执行文件路径
// Windows: runtime/windows/postgresql/pgsql/bin/
// Linux:   runtime/linux/postgres/bin/ (extract-linux-runtime.js 创建的目录)
const PG_DIR_NAME = IS_WINDOWS ? 'postgresql' : 'postgres';
const PG_BIN_SUBDIR = IS_WINDOWS ? 'pgsql/bin' : 'bin';

const pg_ctl = USE_RUNTIME
  ? path.join(
      PLATFORM_DIR,
      PG_DIR_NAME,
      PG_BIN_SUBDIR,
      IS_WINDOWS ? 'pg_ctl.exe' : 'pg_ctl'
    )
  : 'pg_ctl';

const initdb = USE_RUNTIME
  ? path.join(
      PLATFORM_DIR,
      PG_DIR_NAME,
      PG_BIN_SUBDIR,
      IS_WINDOWS ? 'initdb.exe' : 'initdb'
    )
  : 'initdb';

const pg_isready = USE_RUNTIME
  ? path.join(
      PLATFORM_DIR,
      PG_DIR_NAME,
      PG_BIN_SUBDIR,
      IS_WINDOWS ? 'pg_isready.exe' : 'pg_isready'
    )
  : 'pg_isready';

// PostgreSQL 端口（从环境变量读取）
const PG_PORT = parseInt(process.env.DB_PORT || '5432', 10);

// Linux 下需要设置 LD_LIBRARY_PATH
const PG_LIB_DIR =
  USE_RUNTIME && IS_LINUX ? path.join(PLATFORM_DIR, PG_DIR_NAME, 'lib') : null;

// PostgreSQL share 目录
// Linux: runtime/linux/postgres/share/postgresql/15
// Windows: runtime/windows/postgresql/pgsql/share (让 initdb 自动查找)
const PG_SHARE_DIR = USE_RUNTIME
  ? IS_WINDOWS
    ? null // Windows: 让 initdb 自动查找
    : path.join(PLATFORM_DIR, 'postgres', 'share', 'postgresql', '15')
  : null;

// 日志
function log(level, message) {
  const colors = {
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m',
  };
  console.log(
    `${colors[level] || ''}[PG-${level.toUpperCase()}]${colors.reset} ${message}`
  );
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

  // 0. 检查并修复路径权限，确保 postgres 用户可以访问
  if (process.getuid() === 0) {
    const checkPathPermissions = (targetPath) => {
      const parts = targetPath.split('/').filter(Boolean);
      let currentPath = '';
      for (const part of parts) {
        currentPath += '/' + part;
        try {
          const stat = fs.statSync(currentPath);
          const mode = stat.mode & 0o777;
          // 如果目录权限不足（其他用户无法进入），修复为 755
          if ((mode & 0o005) === 0) {
            log('info', `修复目录权限: ${currentPath} (${mode.toString(8)} -> 755)`);
            fs.chmodSync(currentPath, 0o755);
          }
        } catch (e) {
          // 目录不存在，忽略
        }
      }
    };
    checkPathPermissions(initdb);
    checkPathPermissions(PG_DATA_DIR);
  }

  // 1. 创建 PostgreSQL Unix socket 目录
  const pgSocketDir = '/var/run/postgresql';
  if (!fs.existsSync(pgSocketDir)) {
    try {
      fs.mkdirSync(pgSocketDir, { recursive: true });
      log('info', `创建 PostgreSQL socket 目录: ${pgSocketDir}`);
    } catch (e) {
      // 可能需要 root 权限，使用 data 目录下的替代路径
      const altSocketDir = path.join(DATA_DIR, 'postgres', 'sockets');
      ensureDir(altSocketDir);
      log('warn', `无法创建 ${pgSocketDir}，使用替代路径: ${altSocketDir}`);
      // 设置环境变量让后续 pg_ctl 使用替代 socket 目录
      process.env.PG_SOCKET_DIR = altSocketDir;
    }
  }

  // 2. 验证 PostgreSQL share 目录可访问
  // postgres 运行时 get_share_path() 返回 bin/../share/
  // 需要确保 share/timezonesets 等路径可访问
  // 方案1（构建时，推荐）：extract-linux-runtime.js 在 share/ 下创建了
  //   指向 share/postgresql/15/* 的符号链接（rootless，无需 sudo）
  // 方案2（运行时）：/usr/share/postgresql/15 如果存在则直接使用（系统 PG）
  const pgShareCheckPath = path.join(
    PLATFORM_DIR,
    PG_DIR_NAME,
    'share',
    'timezonesets'
  );
  const pgSystemShare = '/usr/share/postgresql/15';

  // 优先检查构建时创建的 share/ 级别兼容 symlink
  let shareAccessible = fs.existsSync(pgShareCheckPath);

  // 如果构建时 symlink 不存在，检查系统 PG
  if (!shareAccessible) {
    if (fs.existsSync(pgSystemShare)) {
      log('info', `${pgSystemShare} 已存在（系统 PostgreSQL），直接使用`);
      shareAccessible = true;
    } else {
      log('warn', '未检测到 PostgreSQL share 目录的可访问符号链接');
      log('warn', '请重新构建部署包（extract-linux-runtime.js 已添加兼容性修复）');
    }
  }

  // 3. 创建 postgres 用户（如果以 root 运行且用户不存在）
  if (process.getuid() === 0) {
    try {
      // 检查用户是否存在
      const result = spawnSync('id', ['postgres'], { stdio: 'pipe' });
      if (result.status !== 0) {
        spawnSync('useradd', ['-m', '-s', '/bin/bash', 'postgres'], {
          stdio: 'pipe',
        });
        log('info', '创建 postgres 用户');
      }
    } catch (e) {
      log('warn', `创建 postgres 用户失败: ${e.message}`);
    }

    // 设置 socket 目录权限
    if (fs.existsSync(pgSocketDir)) {
      try {
        spawnSync('chown', ['postgres:postgres', pgSocketDir], {
          stdio: 'pipe',
        });
      } catch (e) {
        /* ignore */
      }
    }
  }

  return true;
}

// 获取环境变量
// 设置 LD_LIBRARY_PATH 以确保 PostgreSQL 能找到打包的库文件
// Rocky Linux 8/9 等新系统使用 OpenSSL 3.x，没有 libssl.so.10
// 必须使用打包的 CentOS 7 版本库
function getEnv(extra = {}) {
  const env = { ...process.env, ...extra };

  // Linux 下设置 LD_LIBRARY_PATH
  if (PG_LIB_DIR && fs.existsSync(PG_LIB_DIR)) {
    const existingLdPath = env.LD_LIBRARY_PATH || '';
    env.LD_LIBRARY_PATH = existingLdPath
      ? `${PG_LIB_DIR}:${existingLdPath}`
      : PG_LIB_DIR;
  }

  // Linux 下设置 LD_PRELOAD 路径重定向（rootless 运行）
  // 拦截 postgres 对 /usr/share/postgresql/15 硬编码路径的访问
  if (IS_LINUX && PG_LIB_DIR && PG_SHARE_DIR) {
    const redirectSo = path.join(PG_LIB_DIR, 'pg-path-redirect.so');
    if (fs.existsSync(redirectSo)) {
      const existingPreload = env.LD_PRELOAD || '';
      const preloadEntry = redirectSo;
      env.LD_PRELOAD = existingPreload
        ? `${preloadEntry}:${existingPreload}`
        : preloadEntry;
      env.PG_REDIRECT_SHARE_DIR = PG_SHARE_DIR;
    }
  }

  return env;
}

// 初始化数据目录
function initDatabase() {
  if (fs.existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) {
    return true;
  }

  log('info', '初始化 PostgreSQL 数据目录...');
  ensureDir(PG_DATA_DIR);

  // 如果目录已存在但 PG_VERSION 不存在，说明之前初始化失败有残留文件
  // 需要清空，否则 initdb 因 "directory exists but is not empty" 而拒绝执行
  if (!fs.existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) {
    const entries = fs.readdirSync(PG_DATA_DIR);
    for (const entry of entries) {
      const fullPath = path.join(PG_DATA_DIR, entry);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }

  // Linux 下 PostgreSQL 不允许以 root 运行
  if (IS_LINUX && process.getuid() === 0) {
    // 尝试创建 postgres 用户（如果不存在）
    try {
      const checkUser = spawnSync('id', ['postgres'], { stdio: 'pipe' });
      if (checkUser.status !== 0) {
        spawnSync('useradd', ['-m', '-s', '/bin/bash', 'postgres'], {
          stdio: 'pipe',
        });
        log('info', '创建 postgres 用户');
      }
    } catch (e) {
      // 用户可能已存在，忽略
    }
    // 更改数据目录所有者
    spawnSync('chown', ['-R', 'postgres:postgres', PG_DATA_DIR], {
      stdio: 'pipe',
    });

    // 构建 initdb 命令参数
    const initdbArgs = [
      '-D',
      PG_DATA_DIR,
      '-U',
      'postgres',
      '-A',
      'trust',
      '-E',
      'utf8',
      '--locale=C',
    ];
    if (PG_SHARE_DIR) {
      initdbArgs.push('-L', PG_SHARE_DIR);
    }

    // 获取默认 PATH（如果 process.env.PATH 为空）
    const defaultPath =
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    const currentPath = process.env.PATH || defaultPath;

    // 构建环境变量参数（用于 setpriv/env 命令）
    const envVars = [`PATH=${currentPath}`];
    if (PG_LIB_DIR) {
      envVars.unshift(`LD_LIBRARY_PATH=${PG_LIB_DIR}`);
    }

    // 尝试多种用户切换方式（优先 setpriv，不依赖 PAM）
    const commands = [
      // 方式1: setpriv（不依赖 PAM，推荐）
      [
        'setpriv',
        '--reuid=postgres',
        '--regid=postgres',
        '--init-groups',
        'env',
        ...envVars,
        initdb,
        ...initdbArgs,
      ],
      // 方式2: su（传统方式）
      [
        'su',
        '-',
        'postgres',
        '-c',
        `LD_LIBRARY_PATH=${PG_LIB_DIR || ''} ${initdb} ${initdbArgs.join(' ')}`,
      ],
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

  // Linux 非 root 或 Windows 分支 - 指定 -L 让 initdb 找到打包的 share 文件
  const initdbArgs = [
    '-D',
    PG_DATA_DIR,
    '-U',
    'postgres',
    '-A',
    'trust',
    '-E',
    'utf8',
    '--locale=C',
  ];
  if (PG_SHARE_DIR) {
    initdbArgs.push('-L', PG_SHARE_DIR);
  }

  log('info', `执行 initdb: ${initdb}`);
  log('info', `参数: ${initdbArgs.join(' ')}`);
  log('info', `PG_SHARE_DIR: ${PG_SHARE_DIR || 'auto'}`);

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

  // 输出详细错误信息
  const errorOutput = result.stderr || result.stdout || '';
  log('error', `数据目录初始化失败: ${errorOutput}`);
  return false;
}

// 检查 PostgreSQL 是否运行
function isRunning() {
  try {
    const result = spawnSync(
      pg_isready,
      ['-h', 'localhost', '-p', String(PG_PORT)],
      {
        encoding: 'utf8',
        shell: IS_WINDOWS,
        timeout: 5000,
        windowsHide: true,
        env: getEnv({ PGUSER: 'postgres' }),
      }
    );
    return result.status === 0;
  } catch (e) {
    return false;
  }
}

// 启动 PostgreSQL
function writePgAutoConf() {
  // 写入 postgresql.auto.conf（每次启动都执行，确保 socket/port 配置正确）
  // 升级场景下 data/postgres 已存在，initdb 不会重跑，但需确保 socket 配置
  const socketDir = process.env.PG_SOCKET_DIR;
  if (socketDir && fs.existsSync(PG_DATA_DIR)) {
    const autoConf = path.join(PG_DATA_DIR, 'postgresql.auto.conf');
    let content = '';
    content += `unix_socket_directories = '${socketDir.replace(/'/g, "\\'")}'\n`;
    content += `port = ${PG_PORT}\n`;
    fs.writeFileSync(autoConf, content, 'utf8');
    log('info', `已更新 postgresql.auto.conf（socket=${socketDir}, port=${PG_PORT}）`);
  }
}

function startPostgres() {
  if (isRunning()) {
    log('info', 'PostgreSQL 已在运行');
    return true;
  }

  // Linux 系统初始化（socket 目录、share 目录验证等）
  // 必须在 writePgAutoConf 之前执行，因为后者需要 process.env.PG_SOCKET_DIR
  initLinuxSystem();

  // 写入 socket/port 配置（每次启动都执行，确保即使升级场景也正确）
  writePgAutoConf();

  // 初始化
  if (!initDatabase()) {
    return false;
  }

  // Linux 下检查并修复数据目录权限
  // PostgreSQL 要求数据目录权限为 0700 或 0750
  if (IS_LINUX && fs.existsSync(PG_DATA_DIR)) {
    try {
      const stat = fs.statSync(PG_DATA_DIR);
      const mode = stat.mode & 0o777;
      
      // 检查权限是否符合 PostgreSQL 要求（0700 或 0750）
      if (mode !== 0o700 && mode !== 0o750) {
        log('info', `修复数据目录权限: ${mode.toString(8)} -> 700`);
        fs.chmodSync(PG_DATA_DIR, 0o700);
      }
      
      // 确保数据目录归属 postgres 用户
      if (process.getuid() === 0) {
        spawnSync('chown', ['-R', 'postgres:postgres', PG_DATA_DIR], {
          stdio: 'pipe',
        });
      }
    } catch (e) {
      log('warn', `检查数据目录权限失败: ${e.message}`);
    }
  }

  ensureDir(LOGS_DIR);
  const logFile = path.join(LOGS_DIR, 'postgres.log');

  log('info', '启动 PostgreSQL...');

  // Linux 下以 postgres 用户运行
  if (IS_LINUX && process.getuid() === 0) {
    // 确保日志目录权限
    spawnSync('chown', ['-R', 'postgres:postgres', LOGS_DIR], {
      stdio: 'pipe',
    });

    // 获取默认 PATH（如果 process.env.PATH 为空）
    const defaultPath =
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    const currentPath = process.env.PATH || defaultPath;

    // 构建环境变量参数（用于 setpriv/env 命令）
    const envVars = [`PATH=${currentPath}`];
    if (PG_LIB_DIR) {
      envVars.unshift(`LD_LIBRARY_PATH=${PG_LIB_DIR}`);
    }

    const pgCtlArgs = [
      'start',
      '-D',
      PG_DATA_DIR,
      '-l',
      logFile,
      '-w',
      '-t',
      '30',
    ];

    const commands = [
      [
        'setpriv',
        '--reuid=postgres',
        '--regid=postgres',
        '--init-groups',
        'env',
        ...envVars,
        pg_ctl,
        ...pgCtlArgs,
      ],
      [
        'su',
        '-',
        'postgres',
        '-c',
        `LD_LIBRARY_PATH=${PG_LIB_DIR || ''} ${pg_ctl} start -D ${PG_DATA_DIR} -l ${logFile} -w -t 30`,
      ],
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

  const result = spawnSync(
    pg_ctl,
    [
      'start',
      '-D',
      PG_DATA_DIR,
      '-l',
      logFile,
      '-w', // 等待启动完成
      '-t',
      '30', // 超时 30 秒
    ],
    {
      stdio: 'inherit',
      shell: IS_WINDOWS,
      windowsHide: true,
      env: getEnv({ PGDATA: PG_DATA_DIR, PGUSER: 'postgres' }),
    }
  );

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
    // 获取默认 PATH（如果 process.env.PATH 为空）
    const defaultPath =
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    const currentPath = process.env.PATH || defaultPath;

    // 构建环境变量参数（用于 setpriv/env 命令）
    const envVars = [`PATH=${currentPath}`];
    if (PG_LIB_DIR) {
      envVars.unshift(`LD_LIBRARY_PATH=${PG_LIB_DIR}`);
    }

    const pgCtlArgs = [
      'stop',
      '-D',
      PG_DATA_DIR,
      '-m',
      'fast',
      '-w',
      '-t',
      '30',
    ];

    const commands = [
      [
        'setpriv',
        '--reuid=postgres',
        '--regid=postgres',
        '--init-groups',
        'env',
        ...envVars,
        pg_ctl,
        ...pgCtlArgs,
      ],
      [
        'su',
        '-',
        'postgres',
        '-c',
        `LD_LIBRARY_PATH=${PG_LIB_DIR || ''} ${pg_ctl} stop -D ${PG_DATA_DIR} -m fast -w -t 30`,
      ],
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

  const result = spawnSync(
    pg_ctl,
    ['stop', '-D', PG_DATA_DIR, '-m', 'fast', '-w', '-t', '30'],
    {
      stdio: 'inherit',
      shell: IS_WINDOWS,
      windowsHide: true,
      env: getEnv(),
    }
  );

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

  // 通知 PM2 进程已就绪
  if (process.send) {
    process.send('ready');
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
