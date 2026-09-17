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

// Unix socket 目录解析
// Linux 下 AF_UNIX 的 sun_path 上限 108 字节（含结尾 \0），即
// "<socket 目录>/.s.PGSQL.<port>" 必须不超过 107 字节，否则 postmaster 直接
// FATAL "could not create any Unix-domain sockets"（TCP 即使已 bind 也一起死）。
// 部署目录一旦很深（常见于 /home/<用户>/Documents/<长包名>），把 socket 目录
// 放在 data 目录下就会超限，因此按候选顺序探测，优先标准系统路径，退到 /tmp。
const UNIX_SOCKET_MAX_LEN = 107;

function resolveSocketDir() {
  const candidates = [
    '/var/run/postgresql',
    '/run/postgresql',
    '/tmp/cadpg-sock',
    '/dev/shm/cadpg',
    '/tmp/cadpg',
    '/tmp/pg',
    '/tmp',
  ];

  for (const dir of candidates) {
    const socketPath = `${dir}/${'.s.PGSQL.'}${PG_PORT}`;
    if (socketPath.length > UNIX_SOCKET_MAX_LEN) {
      continue;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = `${dir}/.cloudcad-probe`;
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
      return dir;
    } catch (e) {
      // 无写权限（非 root 常见）或只读文件系统，尝试下一个候选
    }
  }

  log(
    'error',
    `找不到可用的 Unix socket 目录（socket 路径须 ≤ ${UNIX_SOCKET_MAX_LEN} 字节），已尝试: ${candidates.join(', ')}`
  );
  return null;
}

// Linux 下解析并缓存 socket 目录（进程内多次启动/重启复用同一目录）
let resolvedSocketDir = null;
function getSocketDir() {
  if (!IS_LINUX) return null;
  if (!resolvedSocketDir) {
    resolvedSocketDir = resolveSocketDir();
  }
  return resolvedSocketDir;
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

  // 1. 解析 PostgreSQL Unix socket 目录
  // 只解析，不在此创建：initDatabase() 会清空 data/postgres 下的全部条目，
  // 目录必须在那之后才创建（见 startPostgres）。
  const pgSocketDir = getSocketDir();
  if (!pgSocketDir) {
    return false;
  }
  process.env.PG_SOCKET_DIR = pgSocketDir;
  log('info', `PostgreSQL socket 目录: ${pgSocketDir}`);

  // 2. 验证 / 修复 PostgreSQL share 目录可访问
  // postgres 运行时 get_share_path() 返回 bin/../share/
  // 需要确保 share/timezonesets 等路径可访问
  //
  // 兼容路径（postgres 实际查找的）：
  //   runtime/linux/postgres/share/timezonesets
  // 真实资源路径（部署包内）：
  //   runtime/linux/postgres/share/postgresql/15/timezonesets
  //
  // 优先顺序：
  //   a) share/timezonesets 已存在（构建时或上次运行时创建） -> 直接用
  //   b) 系统 /usr/share/postgresql/15/timezonesets 存在 -> 用系统
  //   c) 运行时自动创建 symlink（rootless，无需 sudo）
  //   d) 以上都失败 -> 返回 false，阻止启动
  //
  // 注意：b) 不能只判断 /usr/share/postgresql/15 目录是否存在，
  // 系统可能只装了 client 或残留空目录，必须确认 timezonesets 真的在里面。
  const pgShareLinkDir = path.join(PLATFORM_DIR, PG_DIR_NAME, 'share');
  const pgShareCheckPath = path.join(pgShareLinkDir, 'timezonesets');
  const pgShareSrcDir = path.join(pgShareLinkDir, 'postgresql', '15');
  const pgSystemShare = '/usr/share/postgresql/15';
  const pgSystemTimezonesets = path.join(pgSystemShare, 'timezonesets');

  let shareAccessible = fs.existsSync(pgShareCheckPath);

  if (!shareAccessible) {
    if (fs.existsSync(pgSystemTimezonesets)) {
      log('info', `${pgSystemShare} 已存在且完整（系统 PostgreSQL），直接使用`);
      shareAccessible = true;
    } else if (fs.existsSync(pgSystemShare)) {
      log(
        'warn',
        `${pgSystemShare} 存在但不完整（缺 timezonesets），忽略系统路径`
      );
    }
  }

  if (!shareAccessible) {
    // 运行时自动创建兼容 symlink：share/<entry> -> share/postgresql/15/<entry>
    if (fs.existsSync(pgShareSrcDir)) {
      try {
        const entries = fs.readdirSync(pgShareSrcDir);
        let created = 0;
        for (const entry of entries) {
          const src = path.join(pgShareSrcDir, entry);
          const dst = path.join(pgShareLinkDir, entry);
          if (!fs.existsSync(dst)) {
            try {
              fs.symlinkSync(src, dst);
              created += 1;
            } catch (e) {
              log('warn', `创建符号链接失败: ${dst} -> ${src} (${e.message})`);
            }
          }
        }
        if (fs.existsSync(pgShareCheckPath)) {
          log(
            'info',
            `已自动创建 share 兼容符号链接（${created} 个）: ${pgShareLinkDir}`
          );
          shareAccessible = true;
        } else {
          log('warn', `自动创建 share 符号链接后仍找不到: ${pgShareCheckPath}`);
        }
      } catch (e) {
        log('warn', `读取 share 源目录失败: ${pgShareSrcDir} (${e.message})`);
      }
    } else {
      log('warn', `share 源目录不存在: ${pgShareSrcDir}`);
    }
  }

  if (!shareAccessible) {
    // 最后一道兜底：pg-path-redirect.so
    const redirectSo = PG_LIB_DIR
      ? path.join(PG_LIB_DIR, 'pg-path-redirect.so')
      : null;
    if (redirectSo && fs.existsSync(redirectSo) && PG_SHARE_DIR) {
      log('info', `使用 LD_PRELOAD 路径重定向: ${redirectSo}`);
      shareAccessible = true;
    }
  }

  if (!shareAccessible) {
    log('error', 'PostgreSQL share 目录不可访问，无法启动');
    log('error', `请检查以下路径之一是否存在:`);
    log('error', `  - ${pgShareCheckPath}`);
    log('error', `  - ${pgShareSrcDir}`);
    log('error', `  - ${pgSystemTimezonesets}`);
    log(
      'error',
      `  - ${
        PG_LIB_DIR
          ? path.join(PG_LIB_DIR, 'pg-path-redirect.so')
          : '(pg-path-redirect.so)'
      }`
    );
    return false;
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
// 连续失败阈值：pg_isready 在高负载/连接风暴下可能单次超时或假阴性，
// 若单次失败即触发重启，会造成"数据库反复重启"的恶性循环。
// 必须连续 CONSECUTIVE_FAIL_THRESHOLD 次检测失败才判定 PG 已退出。
const CONSECUTIVE_FAIL_THRESHOLD = 3;
let consecutiveFailCount = 0;

function isRunning() {
  try {
    const result = spawnSync(
      pg_isready,
      ['-h', 'localhost', '-p', String(PG_PORT)],
      {
        encoding: 'utf8',
        shell: IS_WINDOWS,
        timeout: 8000,
        windowsHide: true,
        env: getEnv({ PGUSER: 'postgres' }),
      }
    );
    const ok = result.status === 0;
    // 只有真正连续多次失败才判定退出；恢复成功即清零
    if (ok) {
      consecutiveFailCount = 0;
      return true;
    }
    consecutiveFailCount += 1;
    return consecutiveFailCount >= CONSECUTIVE_FAIL_THRESHOLD;
  } catch (e) {
    consecutiveFailCount += 1;
    return consecutiveFailCount >= CONSECUTIVE_FAIL_THRESHOLD;
  }
}

// 写入 postgresql.auto.conf
// 只更新 unix_socket_directories 和 port，保留其他已有配置
function writePgAutoConf() {
  const socketDir = process.env.PG_SOCKET_DIR;
  if (!fs.existsSync(PG_DATA_DIR)) {
    return;
  }

  const autoConf = path.join(PG_DATA_DIR, 'postgresql.auto.conf');
  const desired = {};
  if (socketDir) {
    desired['unix_socket_directories'] = `'${socketDir.replace(/'/g, "\\'")}'`;
  }
  desired['port'] = String(PG_PORT);

  let lines = [];
  if (fs.existsSync(autoConf)) {
    try {
      lines = fs.readFileSync(autoConf, 'utf8').split('\n');
    } catch (e) {
      lines = [];
    }
  }

  const updatedKeys = new Set();
  const newLines = lines.map((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && desired[m[1]] !== undefined) {
      updatedKeys.add(m[1]);
      return `${m[1]} = ${desired[m[1]]}`;
    }
    return line;
  });

  for (const key of Object.keys(desired)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key} = ${desired[key]}`);
    }
  }

  // 去掉末尾多余空行，保证文件以换行结尾
  while (newLines.length > 0 && newLines[newLines.length - 1].trim() === '') {
    newLines.pop();
  }
  const content = newLines.join('\n') + '\n';

  fs.writeFileSync(autoConf, content, 'utf8');
  log(
    'info',
    `已更新 postgresql.auto.conf（${Object.keys(desired)
      .map((k) => `${k}=${desired[k]}`)
      .join(', ')}）`
  );
}

// pg_ctl 失败时打印服务端日志尾部。postmaster 的真实错误（FATAL 原因）只写在
// -l 指定的日志文件里，只报"启动失败"会让部署侧无法定位问题。
function logTail(logFile) {
  let lines;
  try {
    lines = fs
      .readFileSync(logFile, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '');
  } catch (e) {
    log('warn', `无法读取 PostgreSQL 服务端日志: ${logFile} (${e.message})`);
    return;
  }

  if (lines.length === 0) {
    log('warn', `PostgreSQL 服务端日志为空: ${logFile}`);
    return;
  }

  log('error', `PostgreSQL 服务端日志尾部（${logFile}）:`);
  for (const line of lines.slice(-30)) {
    log('error', `  ${line}`);
  }
}

function startPostgres() {
  if (isRunning()) {
    log('info', 'PostgreSQL 已在运行');
    return true;
  }

  // Linux 系统初始化（socket 目录、share 目录验证等）
  // 必须在 writePgAutoConf 之前执行，因为后者需要 process.env.PG_SOCKET_DIR
  if (!initLinuxSystem()) {
    log('error', 'Linux 系统初始化失败，取消启动 PostgreSQL');
    return false;
  }

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

  // socket 目录必须在 initDatabase() 之后创建：该函数的前置清理循环会清空
  // data/postgres 下的全部条目（包括之前创建的 socket 目录）。每次启动都补一次，
  // 保证升级/残留场景下目录也存在。
  const socketDir = getSocketDir();
  if (socketDir) {
    try {
      ensureDir(socketDir);
    } catch (e) {
      log('error', `创建 socket 目录失败: ${socketDir} (${e.message})`);
      return false;
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
    logTail(logFile);
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
  logTail(logFile);
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