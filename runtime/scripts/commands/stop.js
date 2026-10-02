/**
 * @fileoverview 停止服务命令
 *
 * Step A-1 机械拆分自 runtime/scripts/cli.js:stopInfrastructure。
 * 依赖方向：commands → lib。被 commands/start、foreground/registry 引用。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  RUNTIME_DIR,
  NODE_EXE,
  PM2_JS,
  PORTS,
  DATA_DIR,
  PROJECT_ROOT,
  PLATFORM_DIR,
  IS_WINDOWS,
} = require('../lib/context');
const { log } = require('../lib/logger');
const {
  runCommand,
  runPm2,
  getProcessCmdlines,
  getPm2StatusList,
  getPm2AppStatus,
  killTree,
} = require('../lib/proc');
const state = require('../lib/state');
const { loadRedisPassword } = require('../lib/redis-takeover');

/**
 * 只停止"应用层"（后端/前端），保留基础服务（PG/Redis/协同/配置中心）。
 * 用于切换启动模式（前台↔PM2、重复启动）以及**前台模式 Ctrl+C 退出**（Q0）时，
 * 避免误停 PM2 托管、常驻的基础服务。
 * - PM2 应用层：pm2 stop backend frontend（保留服务定义，便于后续 restart 复用）
 * - 前台应用层：kill state.appProcesses 中 spawn 的后端/前端进程
 */
async function stopAppServices() {
  // 1. 停 PM2 应用层（只停本目录归属的 backend/frontend，保留定义、不碰基础服务 app）。
  //    PM2 在 Windows 上机器全局寻址，按名字 stop 会停到其他部署目录/仓库的同名
  //    app（见 pm2OwnedApps），故先按目录归属过滤。
  const appApps = pm2OwnedApps().filter((n) => /^(backend|frontend)$/.test(n));
  if (appApps.length) {
    runPm2(['stop', ...appApps], { silent: true });
  }

  // 2. 停前台应用层（state.appProcesses）
  const procs = Array.from(state.appProcesses).filter((p) => p && !p.killed);
  for (const proc of procs) {
    try {
      proc.kill('SIGTERM');
    } catch {
      /* 忽略 */
    }
  }
  state.appProcesses.clear();

  log('cyan', '[✓] 已停止应用层服务（后端/前端），基础服务保留');
}

/**
 * 归一化路径（Windows 反斜杠转正斜杠 + 全小写，去掉结尾分隔符）。
 */
function normPath(p) {
  return String(p || '')
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
}

/**
 * 列出归属本部署目录的 PM2 app 名（按 pm_cwd / pm_exec_path 判归属）。
 *
 * Windows 上 PM2 靠**机器全局命名管道**寻址（pm2 启动横幅可见
 * `RPC socket file : \\.\pipe\rpc.sock`），PM2_HOME 只决定文件位置、不换寻址
 * 范围——`pm2 stop all` / `pm2 stop backend` 停的是全机那个 daemon 里的同名 app。
 * 同机并存多个部署目录（或开发机上仓库自身）时就会误停别人的服务：本仓库
 * data/pm2/pm2.log 出现过 `Stopping app:postgresql/redis/cooperate/config-service`
 * 全部 SIGINT 退出（2026-09-30 15:06:47），就是部署包 stop 打过去的。
 *
 * 归属只认 pm_cwd / pm_exec_path 等于本目录、或位于其下（带分隔符边界——
 * `cloudcad` 不得命中 `cloudcad-2`）。判不出归属（无 daemon / jlist 失败 /
 * 字段缺失 / 定义属于另一目录）一律返回空数组，**不升级为 stop all**：那类
 * 进程若真属本目录，由 stopResidualServices 的进程表归属清理兜底。
 * @returns {string[]} 本目录归属的 PM2 app 名
 */
function pm2OwnedApps() {
  const root = normPath(PROJECT_ROOT);
  if (!root || !PM2_JS || !fs.existsSync(PM2_JS)) return [];
  const belongs = (p) => {
    const n = normPath(p);
    return n === root || n.startsWith(root + '/');
  };
  let apps = [];
  try {
    apps = getPm2StatusList();
  } catch {
    return [];
  }
  const owned = [];
  for (const app of apps) {
    const env = app.pm2_env || {};
    if ([env.pm_cwd, env.pm_exec_path].some(belongs)) owned.push(app.name);
  }
  return owned;
}

/**
 * 判断是否 PM2 守护进程。
 *
 * daemon 由 runPm2 用**本目录** node 拉起（exe 在本目录 runtime/ 下），命令行又
 * 带 `--pm_home="<本目录>/data/pm2"`——归属判据的两条分支都会命中它。但 daemon
 * 是**机器全局唯一**进程：PM2_HOME 只决定它的文件位置、不隔离 app 注册表，所以
 * 它不"属于"本目录，本目录三个 stop 函数也没有任何一个会停它。若把它计入残留，
 * 终检恒非零 → stop 恒返回 false → 恒提示"不能删除部署包"，而实际上没有任何产品
 * 进程占用文件（实测：daemon 存活时 data/pm2/pm2.log 仍可重命名，PM2 按写关闭）。
 * 故排除而非强杀——杀机器全局 daemon 会打断同机其他部署目录的 `pm2 restart`。
 *
 * 识别只认 pm2 的 Daemon.js 入口：manager 脚本进程的命令行不含 Daemon.js，
 * 不会误伤（它们由 stopNodeWrappersForDataDir 按脚本名单独处理）。
 */
function isPm2Daemon(p) {
  if (!/node/i.test(p.name)) return false;
  return /pm2\/lib\/daemon\.js/.test(normPath(p.cmdline));
}

/**
 * 列出残留的、属于**本部署目录**的服务进程。
 *
 * 归属判据只看两点：可执行文件路径在本目录内（postgres.exe / redis-server.exe /
 * mxcadassembly.exe 都在 runtime/<platform>/ 下），或命令行引用了本目录 data/。
 * 因此不会误伤同机其他部署目录的服务，也不会碰系统自带的 PG/Redis——
 * 这是"stop 之后部署包可以直接删除"的前提。
 *
 * 必须排除两类不属于本目录的进程：
 * - **自身**：本函数由 cli.js 进程调用，而 cli.js 的 exe 就在本目录
 *   runtime/windows/node/node.exe 下，归属判据必然命中自己。不排除时
 *   `stop` 的残留校验恒为"仍有进程占用"→ 恒返回 false → 恒退出码 1，
 *   用户按提示删包前每次都被告知失败（且这条校验从此失去鉴别力：
 *   进程表扫描修好之前返回空表、恒"无残留"，修好之后若无此排除恒"有残留"）。
 * - **PM2 daemon**：见 isPm2Daemon，目标机首次启动时由本目录 node 拉起，
 *   两条归属判据都命中，却是机器全局进程且不在本目录 stop 职责内。
 * @returns {Array<{pid:number,name:string,cmdline:string,exe:string}>}
 */
function listOurResidualProcesses() {
  const root = normPath(PROJECT_ROOT);
  const dataDir = normPath(DATA_DIR);
  if (!root) return [];
  return getProcessCmdlines().filter((p) => {
    if (p.pid === process.pid) return false;
    if (isPm2Daemon(p)) return false;
    const exe = normPath(p.exe);
    if (exe && (exe === root || exe.startsWith(`${root}/`))) return true;
    return dataDir !== '' && normPath(p.cmdline).includes(dataDir);
  });
}

function killResidualPid(pid) {
  if (IS_WINDOWS) return killTree(pid, { silent: true });
  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

function pgCtlExe() {
  return IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'postgresql', 'pgsql', 'bin', 'pg_ctl.exe')
    : path.join(PLATFORM_DIR, 'postgres', 'bin', 'pg_ctl');
}

function listPgProcesses() {
  return listOurResidualProcesses().filter((p) =>
    /postgres(?:\.exe)?$/i.test(p.name)
  );
}

function listRedisProcesses() {
  return listOurResidualProcesses().filter((p) =>
    /redis-server(?:\.exe)?$/i.test(p.name)
  );
}

/**
 * 按本目录数据目录停止 PostgreSQL。
 *
 * `-m fast` 是崩溃安全停机：中断活动会话、完成 WAL 落盘后干净退出，
 * 不做任何数据目录改写，重新打开后无需人工恢复。只有 pg_ctl 拒绝
 * （例如 postmaster.pid 已丢）或停机后仍有残留时才升级为强制结束，
 * 那种情况下 PostgreSQL 的崩溃恢复（WAL replay）保证数据一致性。
 * @returns {'already-stopped'|'stopped'|'failed'}
 */
async function stopPgForDataDir() {
  const dataDir = path.join(DATA_DIR, 'postgres');
  const lockFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(lockFile) && listPgProcesses().length === 0) {
    return 'already-stopped';
  }

  const pgCtl = pgCtlExe();
  if (fs.existsSync(pgCtl) && fs.existsSync(dataDir)) {
    const res = spawnSync(
      pgCtl,
      ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'],
      { encoding: 'utf8', shell: IS_WINDOWS, windowsHide: true, timeout: 45000 }
    );
    if (res.status === 0) {
      // pg_ctl 报成功也复核进程表：与 pg-manager 同口径。不复核的话
      // "报成功但没停"会静默通过，成为 stop 谎报成功的另一条通道。
      if (listPgProcesses().length === 0) return 'stopped';
      log('yellow', '  [警告] pg_ctl 报成功但 PostgreSQL 仍在运行，继续按进程清理');
    } else if (res.error && res.error.code === 'ETIMEDOUT') {
      // spawnSync 超时 ≠ pg_ctl 失败：postgres 可能正在收尾。给一点余量再复查，
      // 确认还在跑才升级强杀——SIGKILL 打断优雅停机会让下次启动走 crash
      // recovery（数据靠 WAL 保证一致，但破坏了"干净关闭"这条要求）。
      log('yellow', '  [警告] pg_ctl stop 超时（45s），复查 postmaster 后再决定...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      log(
        'yellow',
        `  [警告] pg_ctl stop 未成功（退出码 ${res.status}）: ${(res.stderr || res.stdout || '').toString().trim()}`
      );
    }
  } else if (fs.existsSync(dataDir)) {
    log(
      'yellow',
      `  [警告] 未找到 pg_ctl（${pgCtl}），改为按进程停止 PostgreSQL`
    );
  }

  const left = listPgProcesses();
  if (left.length > 0) {
    log(
      'yellow',
      `  PostgreSQL 仍在运行（PID ${left.map((p) => p.pid).join(', ')}），强制停止...`
    );
    for (const p of left) {
      killResidualPid(p.pid);
    }
  }
  return listPgProcesses().length === 0 ? 'stopped' : 'failed';
}

/**
 * 按本目录数据目录停止 Redis：先用 redis-cli SHUTDOWN SAVE 优雅停机
 * （落盘 AOF/RDB 再退出），失败才按 PID 强制结束。
 * @returns {Promise<'already-stopped'|'stopped'|'failed'>}
 */
async function stopRedisForDataDir() {
  if (listRedisProcesses().length === 0) return 'already-stopped';

  const cli = IS_WINDOWS
    ? path.join(PLATFORM_DIR, 'redis', 'redis-cli.exe')
    : path.join(PLATFORM_DIR, 'redis', 'redis-cli');
  // 实例开了 requirepass 时必须带密码，否则 shutdown 被 NOAUTH 拒绝、退化成强杀。
  // 用 REDISCLI_AUTH 而非 --pass 参数（避免出现在命令行与进程列表里）。
  const cliEnv = { ...process.env };
  try {
    const password = loadRedisPassword();
    if (password) cliEnv.REDISCLI_AUTH = password;
  } catch {
    /* 取不到密码时按无密码尝试 */
  }
  if (fs.existsSync(cli)) {
    spawnSync(cli, ['-p', String(PORTS.redis), 'shutdown', 'save'], {
      encoding: 'utf8',
      shell: IS_WINDOWS,
      windowsHide: true,
      timeout: 15000,
      env: cliEnv,
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (listRedisProcesses().length === 0) return 'stopped';

  for (const p of listRedisProcesses()) {
    log('yellow', `  Redis 仍在运行（PID ${p.pid}），强制停止...`);
    killResidualPid(p.pid);
  }
  return listRedisProcesses().length === 0 ? 'stopped' : 'failed';
}

/**
 * 停止协同服务残留进程（mxcadAssembly 为计算进程，无独立持久化状态）。
 * @returns {'already-stopped'|'stopped'}
 */
function stopCooperateForDataDir() {
  const pids = listOurResidualProcesses().filter((p) =>
    /mxcadassembly/i.test(p.name)
  );
  if (pids.length === 0) return 'already-stopped';
  for (const p of pids) {
    killResidualPid(p.pid);
  }
  return 'stopped';
}

/**
 * 列出本目录 node 包装脚本（pg/redis/cooperate-manager）的残留进程。
 *
 * 正常由 `pm2 stop all` 停掉；但 PM2 守护进程不可用、或 PM2_HOME 里装的是
 * 另一部署目录的服务定义时，它停的是别人的进程，本目录的包装脚本会残留并占用
 * runtime/scripts 下的文件。匹配只认本目录 runtime/scripts 下的三个 manager 脚本名，
 * 不扩大到其他 node 进程——PM2 守护进程的 PM2_HOME 同样指向本目录 data/pm2，
 * 按数据目录匹配会误杀机器全局的 PM2 daemon。
 * @returns {Array<{pid:number,name:string,cmdline:string,exe:string}>}
 */
function listOurWrapperProcesses() {
  const scriptsDir = normPath(path.join(PROJECT_ROOT, 'runtime', 'scripts'));
  if (!scriptsDir) return [];
  return getProcessCmdlines().filter((p) => {
    if (p.pid === process.pid) return false;
    if (!/node/i.test(p.name)) return false;
    const cmd = normPath(p.cmdline);
    return cmd.includes(scriptsDir) && /(pg|redis|cooperate)-manager\.js/.test(cmd);
  });
}

/**
 * 强制停止上一步列出的 node 包装脚本残留进程。
 * @returns {'already-stopped'|'stopped'|'failed'}
 */
function stopNodeWrappersForDataDir() {
  const pids = listOurWrapperProcesses();
  if (pids.length === 0) return 'already-stopped';
  for (const p of pids) {
    log(
      'yellow',
      `  本目录 node 包装进程残留（${p.name} PID ${p.pid}），强制停止...`
    );
    killResidualPid(p.pid);
  }
  return listOurWrapperProcesses().length === 0 ? 'stopped' : 'failed';
}

// 本部署的应用层入口（后端 / 前端静态服务 / 配置中心 / 前台模式的 CLI 驱动）。
//
// 必须含 `cli.js start`：前台模式下 `cli.js start` 拉起服务后会 `await
// new Promise(...)` 常驻不退（start.js 的前台监督），它就是「终端 A 跑 start、
// 终端 B 跑 stop」那个永远在跑的驱动进程，cwd 与脚本都在本目录——不杀掉它
// 「stop 之后部署包可以直接删除」就不成立（实测：stop 报"仍有服务进程占用"、
// 退出码 1）。只认 `start` 子命令，`status`/交互菜单等不在此列。
const APP_ENTRY_RE =
  /(packages[/]backend[/]dist[/]main\.js|runtime[/]scripts[/]serve-static\.js|packages[/]config-service[/]server\.js|runtime[/]scripts[/]cli\.js["']?\s+start\b)/;

/**
 * 列出本目录的"应用层"node 进程。
 *
 * 前台模式（`cli.js start` 选 2）下这些进程是 `cli.js start` 的子进程，而
 * `cleanupForeground` 只清 state.appProcesses——那是**同一个进程**的内存状态。
 * 另开一个终端跑 `cli.js stop` 时它恒为空，应用层会残留在 3001/3000/3002 上
 * 占用文件，部署包删不掉（实测：stop 报"仍有服务进程占用"、退出码 1）。
 * 连 `cli.js start` 这个驱动进程本身也要停：它同样常驻、同样占着本目录。
 *
 * 只认上面几个应用入口。刻意不匹配：
 * - 当前进程自己（process.pid）——就是正在执行的 `cli.js stop`；
 * - 其他 cli.js 子命令（status/logs/stop、交互菜单）——短命或用户交互会话，
 *   杀掉会打断他，也不持有本目录文件；
 * - manager 脚本——由 stopNodeWrappersForDataDir 处理；
 * - PM2 守护进程——其 PM2_HOME 同样指向本目录 data/pm2、exe 也在本目录 node 下。
 * @returns {Array<{pid:number,name:string,cmdline:string,exe:string}>}
 */
function listOurAppProcesses() {
  const root = normPath(PROJECT_ROOT);
  if (!root) return [];
  return getProcessCmdlines().filter((p) => {
    if (p.pid === process.pid) return false;
    if (!/node/i.test(p.name)) return false;
    const cmd = normPath(p.cmdline);
    return cmd.includes(root) && APP_ENTRY_RE.test(cmd);
  });
}

/**
 * 停止上一步列出的应用层残留进程。
 * @returns {'already-stopped'|'stopped'|'failed'}
 */
function stopAppLayerProcesses() {
  const pids = listOurAppProcesses();
  if (pids.length === 0) return 'already-stopped';
  for (const p of pids) {
    log(
      'yellow',
      `  本目录应用层进程残留（${p.name} PID ${p.pid}），停止...`
    );
    killResidualPid(p.pid);
  }
  return listOurAppProcesses().length === 0 ? 'stopped' : 'failed';
}

/**
 * 兜底清理 PM2 停止后遗留的本目录服务进程。
 *
 * 必须存在的原因：Windows 上 PM2 停止 node 包装进程时不会执行其信号处理器，
 * pg-manager 的 `process.on('SIGINT')` 里的 pg_ctl stop 永不执行；而 postgres
 * 由 pg_ctl 直接 spawn、不是包装进程的子进程，于是 postgres.exe 残留并锁定
 * data/postgres（redis-server.exe 同理）。残留期间数据目录文件被占用，
 * 部署包无法删除，下次 start 也会提示数据库未停止。
 * 这里只按目录归属处理，不动同机其他部署目录与系统服务。
 * @returns {Promise<boolean>} true=本目录服务进程已全部停止
 */
async function stopResidualServices() {
  const before = listOurResidualProcesses();
  log(
    'cyan',
    before.length > 0
      ? `  发现 PM2 遗留的本目录服务进程（${before.length} 个），按目录归属清理...`
      : '  本目录未发现残留服务进程，仍按目录归属复查应用层...'
  );

  // 先停应用层：后端/前端仍在跑时会持续连库，先停它们再动 PG/Redis。
  // 无条件执行——不被 before 是否为空门控。本目录应用层的 PM2 fork 包装进程 cmdline
  // 只含 ProcessContainerFork.js（业务脚本路径在 env 里、不在 cmdline），exe 又可能是
  // 全局 node 而非本目录 node，listOurResidualProcesses 的两条归属判据都可能漏掉它，
  // 于是 before 为空而应用层仍在跑。该函数自带归属判定，无匹配时返回 'already-stopped'，
  // 多调用一次无副作用。
  const appLayer = stopAppLayerProcesses();
  if (appLayer === 'failed') {
    log('red', '  [错误] 应用层进程未能停止');
  } else if (appLayer !== 'already-stopped') {
    log('cyan', '  应用层服务（后端/前端/配置中心）已停止');
  }

  const pg = await stopPgForDataDir();
  if (pg === 'failed') {
    log('red', '  [错误] PostgreSQL 未能停止，数据目录可能仍被占用');
  } else {
    log(
      'cyan',
      `  PostgreSQL ${pg === 'already-stopped' ? '已停止' : '已停止（pg_ctl -m fast，崩溃安全停机）'}`
    );
  }

  const redis = await stopRedisForDataDir();
  if (redis === 'failed') {
    log('red', '  [错误] Redis 未能停止');
  } else if (redis === 'stopped') {
    log('cyan', '  Redis 已停止（SHUTDOWN SAVE，已落盘）');
  }

  const cooperate = stopCooperateForDataDir();
  if (cooperate !== 'already-stopped') {
    log('cyan', '  协同服务残留进程已停止');
  }

  const wrappers = stopNodeWrappersForDataDir();
  if (wrappers === 'failed') {
    log('red', '  [错误] node 包装进程未能停止');
  } else if (wrappers !== 'already-stopped') {
    log('cyan', '  node 包装进程残留已停止');
  }

  // 稍等进程表刷新：killTree 用 taskkill（同步）发出信号，但 Win32_Process
  // 快照有滞后，立即复查可能读到已退出的进程而误报"未释放"。
  await new Promise((resolve) => setTimeout(resolve, 800));
  return listOurResidualProcesses().length === 0;
}

/**
 * 停止所有服务（基础服务 + 应用层）。
 *
 * 停止策略：
 * - 基础服务统一由 PM2 托管，因此 `stop` 用 `pm2 stop all` **停止所有进程，
 *   但保留服务定义**（不 delete、不 kill daemon），便于后续 `pm2 start/restart` 复用。
 * - 前台 spawn 的兜底进程（cleanupForeground）一并清理。
 * - PG/Redis 若存在独立 manager 进程也做幂等智能关停（兜底，已停则跳过）。
 * - **stopResidualServices** 是"真正停掉"的保证：按部署目录归属清理 PM2 遗留的
 *   postgres.exe / redis-server.exe 等原生进程，并校验文件已释放。
 *   校验不通过则明确报错、返回 false，不谎报成功。
 *
 * 极端残留场景请使用显式危险命令 `runtime/cloudcad.* kill-all`。
 */
async function stopInfrastructure() {
  log('blue', '停止所有服务...');

  // 0. 停止前台模式（spawn 启动）的兜底子进程（cleanupForeground 全清）
  //    延迟 require（历史循环依赖防护：registry 曾顶层 require 本模块；现 registry
  //    改走 detached 全量停止、不再 require 本模块，保留惰性加载以隔离加载顺序）。
  const { cleanupForeground } = require('../foreground/registry');
  cleanupForeground();

  // 1. PM2 停止**本目录归属**的服务（基础服务 + 应用层），保留服务定义（不 delete）
  //
  // 刻意不用 `pm2 stop all`：Windows 上 PM2 靠机器全局命名管道寻址（见
  // pm2OwnedApps 注释），`stop all` 会连同机其他部署目录/开发机仓库自身的
  // postgresql/redis/cooperate/config-service 一起 SIGINT 掉。判不出归属时跳过
  // PM2 这一步——本目录的进程由第 3 步的进程表归属清理兜底，宁可少停不可误停。
  const ownedApps = pm2OwnedApps();
  if (ownedApps.length) {
    log(
      'cyan',
      `  停止本目录 PM2 托管的服务（保留服务定义）: ${ownedApps.join(', ')}...`
    );
    const stopOk = runPm2(['stop', ...ownedApps], { silent: true });
    // `pm2 stop` 的返回值不可信，必须以注册表状态为准复核：PM2 内部即使 kill 失败
    // 也不向客户端报错（ActionMethods 先置 STOPPED 再检查 err，仅 timeout 才升级
    // ERRORED，两种情况都是 cb(null, ...)）。此处若不复核，"未全部转停"会被吞掉，
    // 第 3 步的进程表终检又可能漏检本目录应用层的 PM2 fork 包装进程（其 cmdline 只
    // 含 ProcessContainerFork.js、业务脚本路径在 env 里，见 listOurAppProcesses），
    // 于是 stop 谎报"文件已释放"而实际 backend 仍在跑——下一次 start 就会拿这份
    // 存活但已停止态的定义做 restart，跑出旧 .env 密钥。
    const stillRunning = stopOk
      ? ownedApps.filter((name) => {
          const status = getPm2AppStatus(name);
          return status === 'online' || status === 'launching';
        })
      : ownedApps;
    if (stillRunning.length) {
      log(
        'red',
        `  [错误] PM2 未能停止以下服务（仍处运行态）: ${stillRunning.join(', ')}`
      );
      log(
        'red',
        '  本次停止不完整，部署包文件可能仍被占用——请勿删除该目录。可用 kill-all 兜底或重启机器后再删。'
      );
      return false;
    }
  }

  // 2. 兜底：PG/Redis 各自的 manager 也执行一次自带停止（幂等，已停即跳过）。
  //    不阻塞其返回值：Windows 上 PM2 已终止包装进程，这两个调用常空跑或探测
  //    到错误端口，结果由第 3 步的目录级校验负责把关。
  const pgManagerScript = path.join(RUNTIME_DIR, 'scripts', 'pg-manager.js');
  if (fs.existsSync(pgManagerScript)) {
    log('cyan', '停止 PostgreSQL...');
    runCommand(NODE_EXE, [pgManagerScript, 'stop'], { silent: true });
  }
  const redisManagerScript = path.join(
    RUNTIME_DIR,
    'scripts',
    'redis-manager.js'
  );
  if (fs.existsSync(redisManagerScript)) {
    log('cyan', '停止 Redis...');
    runCommand(NODE_EXE, [redisManagerScript, 'stop'], { silent: true });
  }

  // 3. 目录级残留清理 + 文件占用校验（"stop 真正停掉"的保证，见 stopResidualServices）
  //
  // 进程表查询失败会抛错（getProcessCmdlines 不再把失败伪装成空表）。这里必须
  // fail-closed：查询失败意味着"不知道还有没有残留"，不是"确认没有残留"。
  // 若当成成功上报，卸载脚本会接着删一个仍被占用的部署包——用户看到的原始故障
  // 就是这个形态（stop 报成功、再 start 却说数据库没停）。
  let residualClean;
  try {
    residualClean = await stopResidualServices();
  } catch (err) {
    log(
      'red',
      `  [错误] 进程表查询失败，无法确认本目录进程是否已停止：${err.message || err}`
    );
    residualClean = false;
  }
  if (!residualClean) {
    log(
      'red',
      '  [错误] 仍有服务进程占用本目录文件，数据目录未能释放，部署包不可删除。可用 kill-all 兜底或重启机器后再删。'
    );
    return false;
  }

  log('green', '[✓] 所有服务已停止（PM2 服务定义已保留，可随时重新启动）');
  log('cyan', '  本目录文件已释放，可直接删除该部署包');
  return true;
}

/**
 * 显式危险命令：按进程名全杀（P8 兜底替代品）。
 * 只在 `runtime/cloudcad.* kill-all` 显式调用，日常 stop 不再触发，
 * 避免误杀同机其他 node 进程或 CLI 自身（P2.3）。
 */
async function killAllInfrastructure() {
  log('yellow', '>>> 危险操作：按进程名强制结束所有相关进程');
  log('yellow', '    该操作会结束同机上匹配的 node/postgres/redis/mxcadassembly 进程');
  log('yellow', '    请确认没有其他服务依赖这些进程。');

  const { IS_WINDOWS } = require('../lib/context');
  const { spawnSync } = require('child_process');

  const processNames = IS_WINDOWS
    ? [
        { exe: 'postgres.exe', name: 'PostgreSQL' },
        { exe: 'redis-server.exe', name: 'Redis' },
        { exe: 'mxcadassembly.exe', name: 'Cooperate' },
        { exe: 'node.exe', name: 'Node.js' },
      ]
    : [
        { name: 'PostgreSQL', match: 'postgres' },
        { name: 'Redis', match: 'redis-server' },
        { name: 'Cooperate', match: 'mxcadassembly' },
        { name: 'Node.js', match: 'node' },
      ];

  for (const proc of processNames) {
    if (IS_WINDOWS) {
      const result = spawnSync(
        'tasklist',
        ['/FI', `IMAGENAME eq ${proc.exe}`, '/FO', 'CSV', '/NH'],
        { encoding: 'utf8', shell: true }
      );
      for (const line of result.stdout.split('\n').filter((l) => l.includes(proc.exe))) {
        const match = line.match(/"([^"]+)"/g);
        if (match && match.length >= 2) {
          const pid = match[1].replace(/"/g, '');
          if (pid && pid !== 'PID') {
            log('cyan', `结束 ${proc.name} (PID: ${pid})...`);
            spawnSync('taskkill', ['/F', '/PID', pid], {
              shell: true,
              stdio: 'pipe',
            });
          }
        }
      }
    } else {
      log('cyan', `结束 ${proc.name} 进程...`);
      spawnSync('pkill', ['-f', proc.match], { stdio: 'pipe' });
    }
  }

  log('green', '[✓] 已执行 kill-all');
}

module.exports = {
  stopInfrastructure,
  stopAppServices,
  stopResidualServices,
  stopAppLayerProcesses,
  killAllInfrastructure,
  // 导出归属判据供单元测试与部署侧排查（"停掉了但为什么不能删包"）
  listOurResidualProcesses,
  listOurWrapperProcesses,
  listOurAppProcesses,
  pm2OwnedApps,
};
