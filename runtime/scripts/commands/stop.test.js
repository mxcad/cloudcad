/**
 * stop.js 归属判据回归测试（node:test，0 外部依赖）
 *
 * "stop 停掉后部署包能否直接删除"完全取决于 listOurResidualProcesses 的目录归属
 * 判据：判漏 = 残留进程持有文件、目录删不掉；判多 = 误杀同机其他部署目录或
 * 系统自带的 PG/Redis。本文件用注入的进程表快照锁定两个方向的边界。
 *
 * 运行：node --test runtime/scripts/commands/stop.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { PROJECT_ROOT, DATA_DIR, PM2_JS } = require('../lib/context');

/**
 * 以给定的进程表快照重新加载 stop.js。
 *
 * stop.js 顶层用解构从 lib/proc 取 getProcessCmdlines（加载时即固定函数引用），
 * 因此必须在 require stop.js 之前替换导出、并清掉 stop.js 的模块缓存。
 */
function loadStopWithRows(rows) {
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const prev = proc.getProcessCmdlines;
  proc.getProcessCmdlines = () => rows;
  const stopPath = require.resolve('./stop');
  delete require.cache[stopPath];
  const loaded = require('./stop');
  proc.getProcessCmdlines = prev;
  return loaded;
}

/**
 * 以给定的 PM2 注册表快照重新加载 stop.js（pm2OwnedApps 用）。
 * 第二参可传一个会抛错的函数，用于覆盖"jlist 失败不得升级为 stop all"的分支。
 */
function loadStopWithPm2(apps) {
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const prev = proc.getPm2StatusList;
  proc.getPm2StatusList = apps;
  const stopPath = require.resolve('./stop');
  delete require.cache[stopPath];
  const loaded = require('./stop');
  proc.getPm2StatusList = prev;
  return loaded;
}

const OUR_RUNTIME = `${PROJECT_ROOT}/runtime/windows`;
// 另一部署目录用真实绝对路径（不带 ../ 前缀——Win32_Process 的 ExecutablePath
// 恒为解析后的绝对路径，不出现 ..）。用 E 盘实例避免与仓库根构成字符串前缀关系。
const OTHER_ROOT = 'E:/qq/Downloads/cloudcad-deploy-1.0.0-20260929-windows';
const OTHER_RUNTIME = `${OTHER_ROOT}/runtime/windows`;
const OTHER_DATA = `${OTHER_ROOT}/data/redis`;

test('exe 在本目录 runtime/ 下 → 判定为本目录残留', () => {
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 101,
      name: 'postgres.exe',
      cmdline: `"{OUR_RUNTIME}/postgres/postgresql/pgsql/bin/postgres.exe" -D "${DATA_DIR}/postgres"`,
      exe: `${OUR_RUNTIME}/postgres/postgresql/pgsql/bin/postgres.exe`,
    },
  ]);
  assert.equal(listOurResidualProcesses().length, 1);
});

test('exe 在同机另一部署目录 runtime/ 下 → 不误判', () => {
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 202,
      name: 'postgres.exe',
      cmdline: `"${OTHER_RUNTIME}\\postgres\\pgsql\\bin\\postgres.exe" -D "${OTHER_DATA}"`,
      exe: `${OTHER_RUNTIME}\\postgres\\pgsql\\bin\\postgres.exe`,
    },
  ]);
  assert.deepEqual(listOurResidualProcesses(), []);
});

test('exe 是系统安装路径、命令行引用本目录 data/ → 仍判为本目录残留', () => {
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 303,
      name: 'redis-server.exe',
      cmdline: `C:/Program Files/redis/redis-server.exe --port 6379 --dir "${DATA_DIR}/redis"`,
      exe: 'C:/Program Files/redis/redis-server.exe',
    },
  ]);
  assert.equal(listOurResidualProcesses().length, 1);
});

test('exe 是本目录 node、命令行是其他包脚本 → 不误杀', () => {
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 404,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}/node/node.exe" C:/some/other/app/server.js`,
      exe: `${OUR_RUNTIME}/node/node.exe`,
    },
  ]);
  // exe 在本目录 runtime 下，仍属本目录进程（node 包装 backend/frontend 时即此形态）
  assert.equal(listOurResidualProcesses().length, 1);
});

test('排除调用者自身：cli.js 的 exe 在本目录 runtime 下，否则残留校验恒失败', () => {
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: process.pid,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}/node/node.exe" "${PROJECT_ROOT}/runtime/scripts/cli.js" stop`,
      exe: `${OUR_RUNTIME}/node/node.exe`,
    },
    {
      pid: 606,
      name: 'postgres.exe',
      cmdline: `"{OUR_RUNTIME}/postgres/postgresql/pgsql/bin/postgres.exe" -D "${DATA_DIR}/postgres"`,
      exe: `${OUR_RUNTIME}/postgres/postgresql/pgsql/bin/postgres.exe`,
    },
  ]);
  // 只认真正的残留进程，不把正在执行 stop 的自身算进去
  assert.deepEqual(listOurResidualProcesses().map((p) => p.pid), [606]);
});

test('进程表中只有调用者自身 → 判为无残留（stop 得以报告成功）', () => {
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: process.pid,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}/node/node.exe" "${PROJECT_ROOT}/runtime/scripts/cli.js" stop`,
      exe: `${OUR_RUNTIME}/node/node.exe`,
    },
  ]);
  assert.deepEqual(listOurResidualProcesses(), []);
});

test('PM2 守护进程由本目录 node 拉起 → 计入本目录残留（它锁住本目录 node.exe，不杀目录删不掉）', () => {
  // 目标机首次启动时 daemon 就是 runPm2 用本目录 node 拉起的：exe 落在本目录
  // runtime/windows/node/ 下，命令行又带 --pm_home 指向本目录 data/pm2。
  // daemon 的 exe 锁住本目录 node.exe——不计入残留则「stop 后可删包」不成立
  // （实测：stop 成功后目录仍删不掉，须手动 pm2 kill）。杀它安全：daemon 死亡
  // 不终止其托管进程（stop 走到这里时已全部停止），他目录后续 pm2 命令会自动
  // 重拉 daemon（客户端自举）。
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 607,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${OUR_RUNTIME}\\node\\node_modules\\pm2\\lib\\Daemon.js" --pm_home="${DATA_DIR}/pm2"`,
    },
  ]);
  assert.deepEqual(listOurResidualProcesses().map((p) => p.pid), [607]);
});

test('PM2 daemon 由系统 node 拉起但运行本目录 pm2 代码（cmdline 引用本目录）→ 计入本目录残留', () => {
  // 真机 E2E 发现：daemon 的 exe 可能是系统 node（D:/nodejs/node.exe，cmdline 为
  // 裸 `node`），但它运行的是本目录的 pm2/lib/Daemon.js、cwd 在本目录——同样锁住
  // 本目录的重命名/删除。只按 exe 判归属会漏掉它，stop 后目录仍删不掉。
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 610,
      name: 'node.exe',
      exe: 'D:/nodejs/node.exe',
      cmdline: `node "${OUR_RUNTIME}\\node\\node_modules\\pm2\\lib\\Daemon.js"`,
    },
  ]);
  assert.deepEqual(listOurResidualProcesses().map((p) => p.pid), [610]);
});

test('他目录名是本目录名前缀（如 .../cloud 与 .../cloudcad）→ 其 daemon 不误判为本目录', () => {
  // cmdline 判据用 `<root>/`（带尾斜杠）做子串匹配：他目录路径虽以本目录路径为
  // 字符串前缀，但后续字符是 `-`/字母而非 `/`，不会误命中。
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 611,
      name: 'node.exe',
      exe: 'D:/nodejs/node.exe',
      cmdline: `node "D:/web/MxCADOnline/cloud\\runtime\\windows\\node\\node_modules\\pm2\\lib\\Daemon.js"`,
    },
  ]);
  assert.deepEqual(listOurResidualProcesses(), []);
});

test('listOurDriverProcesses：只认前台驱动（cli.js deploy / cli.js start）', () => {
  // 关窗哨兵用它判「是否有另一前台实例」：只认驱动进程。
  const { listOurDriverProcesses } = loadStopWithRows([
    {
      pid: 701,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}/runtime/scripts/cli.js" deploy --skip-build`,
    },
    {
      pid: 702,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}/runtime/scripts/cli.js" start`,
    },
  ]);
  assert.deepEqual(listOurDriverProcesses().map((p) => p.pid), [701, 702]);
});

test('listOurDriverProcesses：应用层残留（config-service 等）不算驱动', () => {
  // 真机 E2E 回归：旧实例驱动死后，config-service 等残留仍在进程表——若按
  // 应用层判据（listOurAppProcesses）判「另一实例」，哨兵会静默退出、服务全留活。
  const { listOurDriverProcesses } = loadStopWithRows([
    {
      pid: 703,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}/packages/config-service/server.js"`,
    },
    {
      pid: 704,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}/packages/backend/dist/main.js"`,
    },
  ]);
  assert.deepEqual(listOurDriverProcesses(), []);
});

test('listOurDriverProcesses：其他 cli.js 子命令（status/stop）不算驱动', () => {
  const { listOurDriverProcesses } = loadStopWithRows([
    {
      pid: 705,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}/runtime/scripts/cli.js" status`,
    },
    {
      pid: 706,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}/runtime/scripts/cli.js" stop`,
    },
  ]);
  assert.deepEqual(listOurDriverProcesses(), []);
});

test('PM2 守护进程归属他目录 → 排除（机器全局共享，强杀会打断他目录 pm2 restart）', () => {
  // daemon 是机器全局唯一进程：若它由同机另一部署目录的 node 拉起（exe 在别处、
  // --pm_home 指向别处），不锁本目录任何文件，强杀它只会打断那个目录的 pm2 命令。
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 609,
      name: 'node.exe',
      exe: `${OTHER_RUNTIME}/node/node.exe`,
      cmdline: `"${OTHER_RUNTIME}\\node\\node.exe" "${OTHER_RUNTIME}\\node\\node_modules\\pm2\\lib\\Daemon.js" --pm_home="${OTHER_ROOT}/data/pm2"`,
    },
  ]);
  assert.deepEqual(listOurResidualProcesses(), []);
});

test('本目录 manager 脚本进程不会被当 daemon 排除', () => {
  // 排除条件只认 Daemon.js 入口；manager 脚本进程命令行不含 Daemon.js，必须仍
  // 判为本目录残留（由 stopNodeWrappersForDataDir 按脚本名单独负责停）。
  const scriptsDir = `${PROJECT_ROOT}/runtime/scripts`;
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 608,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${scriptsDir}\\pg-manager.js" daemon`,
    },
  ]);
  assert.deepEqual(listOurResidualProcesses().map((p) => p.pid), [608]);
});

test('listOurWrapperProcesses：只认本目录三个 manager 脚本', () => {
  const scriptsDir = `${PROJECT_ROOT}/runtime/scripts`;
  const { listOurWrapperProcesses } = loadStopWithRows([
    {
      pid: 501,
      name: 'node.exe',
      cmdline: `"${scriptsDir}\\pg-manager.js" daemon`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      pid: 502,
      name: 'node.exe',
      cmdline: `C:/other/runtime/scripts/redis-manager.js daemon`,
      exe: 'C:/other/runtime/scripts/node.exe',
    },
    // PM2 守护进程：PM2_HOME 指向本目录 data/pm2，但不在命令行里、也不是 manager 脚本
    {
      pid: 503,
      name: 'node.exe',
      cmdline: `C:/pm2/lib/Daemon.js --pm_home="${DATA_DIR}/pm2"`,
      exe: 'C:/pm2/node.exe',
    },
    {
      pid: process.pid,
      name: 'node.exe',
      cmdline: `"${scriptsDir}/cli.js" stop`,
      exe: `${OUR_RUNTIME}/node/node.exe`,
    },
  ]);
  const found = listOurWrapperProcesses().map((p) => p.pid);
  assert.deepEqual(found, [501], '只应命中本目录 pg-manager.js');
});

test('进程表返回空表 → 不抛错、判为无残留', () => {
  // 注意与"查询失败"区分：查询失败现在会抛错（见 proc.test.js），空表是
  // 查询成功但一行都没匹配到的正常结果，判为无残留。
  const { listOurResidualProcesses, listOurWrapperProcesses } =
    loadStopWithRows([]);
  assert.deepEqual(listOurResidualProcesses(), []);
  assert.deepEqual(listOurWrapperProcesses(), []);
});

test('listOurAppProcesses：命中后端/前端/配置中心三个入口 + 前台 cli.js start', () => {
  const scriptsDir = `${PROJECT_ROOT}\\runtime\\scripts`;
  const { listOurAppProcesses } = loadStopWithRows([
    {
      pid: 701,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}/packages/backend/dist/main.js"`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      pid: 702,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}\\runtime\\scripts\\serve-static.js"`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      pid: 703,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${PROJECT_ROOT}/packages/config-service/server.js"`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      // 前台模式的常驻驱动：不杀掉它，"stop 后可删包"就不成立
      pid: 704,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${scriptsDir}/cli.js" start`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      pid: 705,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${scriptsDir}/cli.js" start --port 3001`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
  ]);
  assert.deepEqual(listOurAppProcesses().map((p) => p.pid), [701, 702, 703, 704, 705]);
});

test('listOurAppProcesses：不碰其他 cli.js 子命令、manager 脚本与 PM2 守护进程', () => {
  const scriptsDir = `${PROJECT_ROOT}\\runtime\\scripts`;
  const { listOurAppProcesses } = loadStopWithRows([
    {
      pid: 802,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}/node/node.exe" "${scriptsDir}/cli.js" status`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      // 无子命令的交互菜单会话
      pid: 806,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}/node/node.exe" "${scriptsDir}/cli.js"`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      pid: 807,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}/node/node.exe" "${scriptsDir}/cli.js" restart-apps`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      pid: 803,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}/node/node.exe" "${scriptsDir}/pg-manager.js"`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      pid: 804,
      name: 'node.exe',
      cmdline: `C:/pm2/lib/Daemon.js --pm_home="${DATA_DIR}/pm2"`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
    {
      pid: process.pid,
      name: 'node.exe',
      cmdline: `"${OUR_RUNTIME}/node/node.exe" "${scriptsDir}/cli.js" stop`,
      exe: `${OUR_RUNTIME}\\node\\node.exe`,
    },
  ]);
  assert.deepEqual(listOurAppProcesses(), []);
});

test('listOurAppProcesses：同机另一部署目录的应用层不碰', () => {
  const { listOurAppProcesses } = loadStopWithRows([
    {
      pid: 901,
      name: 'node.exe',
      cmdline: `"${OTHER_RUNTIME}/node/node.exe" "${OTHER_ROOT}/packages/backend/dist/main.js"`,
      exe: `${OTHER_RUNTIME}\\node\\node.exe`,
    },
  ]);
  assert.deepEqual(listOurAppProcesses(), []);
});

test('进程表查询失败 → stopInfrastructure 返回 false，不谎报成功', async () => {
  // fail-closed 契约：查询失败语义是"不知道还有没有残留"，不是"确认没有残留"。
  // 若当成成功上报，卸载脚本会接着删一个仍被占用的部署包——用户报的原始故障
  // （stop 说停了、再 start 却说数据库没停）就是这个形态。锁住它不被回退成
  // "查询失败按无残留处理"。
  const fs = require('fs');
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const fgPath = require.resolve('../foreground/registry');
  const origExists = fs.existsSync;
  const origGetCmdlines = proc.getProcessCmdlines;
  const origFg = require.cache[fgPath];

  proc.getProcessCmdlines = () => {
    throw new Error('进程表查询失败（boom）');
  };
  // 关掉所有磁盘分支：PM2_JS / manager 脚本 / pg_ctl / 数据目录都不存在，
  // 让 stopInfrastructure 直奔第 3 步的残留校验（那里会抛错）。
  fs.existsSync = () => false;
  // 替换 foreground/registry，避免真实 cleanupForeground 的副作用
  require.cache[fgPath] = {
    id: fgPath,
    filename: fgPath,
    loaded: true,
    exports: { cleanupForeground: () => {} },
  };
  delete require.cache[require.resolve('./stop')];
  try {
    const { stopInfrastructure } = require('./stop');
    const result = await stopInfrastructure();
    assert.equal(result, false);
  } finally {
    fs.existsSync = origExists;
    proc.getProcessCmdlines = origGetCmdlines;
    if (origFg) require.cache[fgPath] = origFg;
    else delete require.cache[fgPath];
    delete require.cache[require.resolve('./stop')];
    require('./stop');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// pm2OwnedApps：PM2 在 Windows 上靠机器全局命名管道寻址（\\.\pipe\rpc.sock），
// PM2_HOME 只决定文件位置。原先 `pm2 stop all` 会把同机其他部署目录、以及开发
// 机上仓库自身的 postgresql/redis/cooperate/config-service 一起 SIGINT 掉
// （仓库 data/pm2/pm2.log 留有 15:06:47 的实锤）。这里锁定"只认本目录"的边界。
// ─────────────────────────────────────────────────────────────────────────

test('pm2OwnedApps：pm_cwd 在本目录（含其下 packages/*）→ 归属', () => {
  const { pm2OwnedApps } = loadStopWithPm2(() => [
    { name: 'postgresql', pm2_env: { pm_cwd: PROJECT_ROOT, pm_exec_path: '' } },
    {
      name: 'backend',
      pm2_env: { pm_cwd: `${PROJECT_ROOT}/packages/backend` },
    },
    {
      name: 'frontend',
      pm2_env: {
        pm_exec_path: `${PROJECT_ROOT}\\runtime\\scripts\\serve-static.js`,
      },
    },
  ]);
  assert.deepEqual(pm2OwnedApps(), ['postgresql', 'backend', 'frontend']);
});

test('pm2OwnedApps：同机其他部署目录的 app 一律不碰', () => {
  const { pm2OwnedApps } = loadStopWithPm2(() => [
    { name: 'postgresql', pm2_env: { pm_cwd: PROJECT_ROOT } },
    { name: 'postgresql', pm2_env: { pm_cwd: OTHER_ROOT } },
    {
      name: 'backend',
      pm2_env: { pm_exec_path: `${OTHER_ROOT}/packages/backend/dist/main.js` },
    },
    // pm_cwd / pm_exec_path 都缺失 → 判不出归属，按"不是我们的"处理
    { name: 'redis', pm2_env: {} },
    { name: 'cooperate', pm2_env: { name: 'x' } },
  ]);
  assert.deepEqual(pm2OwnedApps(), ['postgresql']);
});

test('pm2OwnedApps：路径前缀陷阱 cloudcad 不得命中 cloudcad-2', () => {
  const { pm2OwnedApps } = loadStopWithPm2(() => [
    { name: 'self', pm2_env: { pm_cwd: PROJECT_ROOT } },
    // 兄弟目录：字符串上是本目录的前缀延长，但必须判为"不是我们的"
    { name: 'sibling', pm2_env: { pm_cwd: `${PROJECT_ROOT}-2` } },
    { name: 'sibling2', pm2_env: { pm_exec_path: `${PROJECT_ROOT}-private/x.js` } },
  ]);
  assert.deepEqual(pm2OwnedApps(), ['self']);
});

test('pm2OwnedApps：jlist 失败 / 空注册表 → 空数组（不得升级为 stop all）', () => {
  const throwing = () => {
    throw new Error('jlist 超时');
  };
  const { pm2OwnedApps: whenThrows } = loadStopWithPm2(throwing);
  assert.deepEqual(whenThrows(), []);

  const { pm2OwnedApps: whenEmpty } = loadStopWithPm2(() => []);
  assert.deepEqual(whenEmpty(), []);
});

// ─────────────────────────────────────────────────────────────────────────
// stop 不得谎报成功：PM2 报成功但进程仍在 / 残留探测漏检应用层
// ─────────────────────────────────────────────────────────────────────────

/**
 * 以"PM2 谎报成功"的注册表快照重新加载 stop.js。
 *
 * 只让 PM2_JS 这一个路径 existsSync 为 true（使 pm2OwnedApps 生效），其余磁盘分支
 * （manager 脚本 / pg_ctl / 数据目录）全关，让流程直奔被测分支。
 */
function loadStopWithPm2Lie({ pm2Entries, appStatus, rows }) {
  const fs = require('fs');
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const fgPath = require.resolve('../foreground/registry');
  const loggerPath = require.resolve('../lib/logger');
  const logger = require(loggerPath);
  const origExists = fs.existsSync;
  const origGetCmdlines = proc.getProcessCmdlines;
  const origStatusList = proc.getPm2StatusList;
  const origAppStatus = proc.getPm2AppStatus;
  const origRunPm2 = proc.runPm2;
  const origKillTree = proc.killTree;
  const origLog = logger.log;
  const origFg = require.cache[fgPath];

  const kills = [];
  fs.existsSync = (p) => String(p) === String(PM2_JS);
  proc.getProcessCmdlines = () => rows;
  proc.getPm2StatusList = () =>
    pm2Entries.map(([name, cwd]) => ({
      name,
      pm2_env: { pm_cwd: cwd, pm_exec_path: '' },
    }));
  proc.getPm2AppStatus = (name) => appStatus[name] || 'unknown';
  proc.runPm2 = () => true;
  proc.killTree = (pid) => {
    kills.push(pid);
    return true;
  };
  logger.log = () => {};
  require.cache[fgPath] = {
    id: fgPath,
    filename: fgPath,
    loaded: true,
    exports: { cleanupForeground: () => {} },
  };
  delete require.cache[require.resolve('./stop')];

  return {
    stop: require('./stop'),
    kills,
    restore() {
      fs.existsSync = origExists;
      proc.getProcessCmdlines = origGetCmdlines;
      proc.getPm2StatusList = origStatusList;
      proc.getPm2AppStatus = origAppStatus;
      proc.runPm2 = origRunPm2;
      proc.killTree = origKillTree;
      logger.log = origLog;
      if (origFg) require.cache[fgPath] = origFg;
      else delete require.cache[fgPath];
      delete require.cache[require.resolve('./stop')];
      require('./stop');
    },
  };
}

test('PM2 谎报成功但注册表仍 online → stopInfrastructure 返回 false', async () => {
  // 回归背景：PM2 内部即使 kill 失败也不向客户端报错（ActionMethods 先置 STOPPED
  // 再检查 err，仅 timeout 才升级 ERRORED，两种都是 cb(null, ...)）。原实现丢弃了
  // runPm2 的返回值，"未全部转停"被吞掉；第 3 步的进程表终检又可能漏检本目录应用层
  // 的 PM2 fork 包装进程（cmdline 只含 ProcessContainerFork.js、业务脚本路径在 env
  // 里，exe 还可能是全局 node），于是 stop 谎报"文件已释放"而实际 backend 仍在跑。
  // 下一次 start 就会拿这份存活定义做 restart，跑出旧 .env 密钥（ERR invalid password）。
  const h = loadStopWithPm2Lie({
    pm2Entries: [['backend', `${PROJECT_ROOT}/packages/backend`]],
    appStatus: { backend: 'online' },
    rows: [],
  });
  try {
    assert.equal(await h.stop.stopInfrastructure(), false);
  } finally {
    h.restore();
  }
});

test('stopResidualServices：残留探测为空但应用层可匹配 → 仍清理（不被短路跳过）', async () => {
  // 回归背景：原实现在 listOurResidualProcesses 为空时直接 return true，
  // stopAppLayerProcesses 被短路跳过。但"前台 spawn 的 backend"（exe=全局 node、
  // cmdline 含 packages/backend/dist/main.js）两条判据都不命中
  // listOurResidualProcesses（exe 不在本目录、cmdline 不含 data/），却能被
  // listOurAppProcesses 命中（cmdline 含本目录 + 应用入口正则）。短路会让这类应用层
  // 残留永久占用 3001，部署包删不掉。
  const root = PROJECT_ROOT.replace(/\\/g, '/');
  const h = loadStopWithPm2Lie({
    pm2Entries: [],
    appStatus: {},
    rows: [
      {
        pid: 777,
        name: 'node.exe',
        cmdline: `"D:/nodejs/node.exe" "${root}/packages/backend/dist/main.js"`,
        exe: 'D:/nodejs/node.exe',
      },
    ],
  });
  try {
    await h.stop.stopResidualServices();
    assert.deepEqual(h.kills, [777]);
  } finally {
    h.restore();
  }
});

test('stopResidualServices：收尾强杀本目录归属的 PM2 daemon（它锁住本目录 node.exe）', async () => {
  // 回归背景：daemon 由本目录 node 拉起、exe 锁住本目录 node.exe，旧实现刻意把它
  // 排除在残留之外——stop 报"文件已释放"后目录仍删不掉（须手动 pm2 kill）。
  // 现在本目录归属的 daemon 计入残留、收尾强杀；杀它安全（daemon 死亡不终止其
  // 托管进程，他目录 pm2 命令会自动重拉 daemon）。
  // 与 loadStopWithPm2Lie 不同：killTree 把被杀进程从进程表移除，模拟进程退出，
  // 终检才能通过。
  const fs = require('fs');
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const fgPath = require.resolve('../foreground/registry');
  const loggerPath = require.resolve('../lib/logger');
  const logger = require(loggerPath);
  const origExists = fs.existsSync;
  const origGetCmdlines = proc.getProcessCmdlines;
  const origKillTree = proc.killTree;
  const origLog = logger.log;
  const origFg = require.cache[fgPath];

  const rows = [
    {
      pid: 778,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${OUR_RUNTIME}\\node\\node_modules\\pm2\\lib\\Daemon.js" --pm_home="${DATA_DIR}/pm2"`,
    },
    // 系统 node 拉起、运行本目录 pm2 代码的 daemon（真机 E2E 形态）：
    // exe 不在本目录，但 cmdline 引用本目录 → 同样必须被强杀。
    {
      pid: 779,
      name: 'node.exe',
      exe: 'D:/nodejs/node.exe',
      cmdline: `node "${OUR_RUNTIME}\\node\\node_modules\\pm2\\lib\\Daemon.js"`,
    },
  ];
  const kills = [];
  fs.existsSync = () => false;
  proc.getProcessCmdlines = () => rows;
  proc.killTree = (pid) => {
    kills.push(pid);
    const i = rows.findIndex((r) => r.pid === pid);
    if (i >= 0) rows.splice(i, 1);
    return true;
  };
  logger.log = () => {};
  require.cache[fgPath] = {
    id: fgPath,
    filename: fgPath,
    loaded: true,
    exports: { cleanupForeground: () => {} },
  };
  delete require.cache[require.resolve('./stop')];
  try {
    const { stopResidualServices } = require('./stop');
    const ok = await stopResidualServices();
    assert.ok(kills.includes(778), '本目录 node 拉起的 daemon 必须被强杀');
    assert.ok(kills.includes(779), '系统 node 拉起但运行本目录 pm2 代码的 daemon 必须被强杀');
    assert.equal(ok, true, 'daemon 被杀后终检应通过');
  } finally {
    fs.existsSync = origExists;
    proc.getProcessCmdlines = origGetCmdlines;
    proc.killTree = origKillTree;
    logger.log = origLog;
    if (origFg) require.cache[fgPath] = origFg;
    else delete require.cache[fgPath];
    delete require.cache[require.resolve('./stop')];
    require('./stop');
  }
});

test('stopResidualServices：前台驱动（cli.js deploy）最先被杀，其监督的应用层残留一并清掉', async () => {
  // 回归背景：start.bat 前台驱动是 `cli.js deploy --skip-build`——旧 APP_ENTRY_RE 只认
  // `cli.js start`，驱动存活过 stop；且驱动是监督进程，其监督的应用层子进程
  // （conversion-service 等）同残留，终检报"仍占用"、退出码 1、目录删不掉。
  // 现在 stopResidualServices 最先强杀驱动（killTree 连子进程整树带走），应用层
  // 残留由 APP_ENTRY_RE（已含 conversion-service）或终检清扫兜底。
  const fs = require('fs');
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const fgPath = require.resolve('../foreground/registry');
  const loggerPath = require.resolve('../lib/logger');
  const logger = require(loggerPath);
  const origExists = fs.existsSync;
  const origGetCmdlines = proc.getProcessCmdlines;
  const origKillTree = proc.killTree;
  const origLog = logger.log;
  const origFg = require.cache[fgPath];

  const rows = [
    {
      pid: 780,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}/node/node.exe" runtime/scripts/cli.js deploy --skip-build`,
    },
    {
      pid: 781,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}/node/node.exe" "${PROJECT_ROOT}/packages/conversion-service/dist/server.js"`,
    },
  ];
  const kills = [];
  fs.existsSync = () => false;
  proc.getProcessCmdlines = () => rows;
  proc.killTree = (pid) => {
    kills.push(pid);
    const i = rows.findIndex((r) => r.pid === pid);
    if (i >= 0) rows.splice(i, 1);
    return true;
  };
  logger.log = () => {};
  require.cache[fgPath] = {
    id: fgPath,
    filename: fgPath,
    loaded: true,
    exports: { cleanupForeground: () => {} },
  };
  delete require.cache[require.resolve('./stop')];
  try {
    const { stopResidualServices } = require('./stop');
    const ok = await stopResidualServices();
    assert.ok(kills.includes(780), '前台驱动（cli.js deploy）必须被强杀');
    assert.ok(kills.includes(781), '应用层残留（conversion-service）必须被清掉');
    assert.equal(ok, true, '驱动与残留被杀后终检应通过');
  } finally {
    fs.existsSync = origExists;
    proc.getProcessCmdlines = origGetCmdlines;
    proc.killTree = origKillTree;
    logger.log = origLog;
    if (origFg) require.cache[fgPath] = origFg;
    else delete require.cache[fgPath];
    delete require.cache[require.resolve('./stop')];
    require('./stop');
  }
});

test('stopResidualServices：终检清扫强杀定向步骤漏掉的进程（终检不再只报不杀）', async () => {
  // 回归背景：旧终检只报不杀——定向步骤漏掉的进程（或被监督者重启的）会让 stop
  // 退出码 1、目录仍删不掉。现在终检发现残留先强杀再复查，复查仍不过才报失败。
  const fs = require('fs');
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const fgPath = require.resolve('../foreground/registry');
  const loggerPath = require.resolve('../lib/logger');
  const logger = require(loggerPath);
  const origExists = fs.existsSync;
  const origGetCmdlines = proc.getProcessCmdlines;
  const origKillTree = proc.killTree;
  const origLog = logger.log;
  const origFg = require.cache[fgPath];

  // exe 在本目录 node 下、命令行是其他脚本：归属判据判为本目录进程，但不在任何
  // 定向步骤（应用层/包装/daemon/PG/Redis/协同）的匹配范围内 → 只能靠终检清扫。
  const rows = [
    {
      pid: 782,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}/node/node.exe" C:/some/other/app/server.js`,
    },
  ];
  const kills = [];
  fs.existsSync = () => false;
  proc.getProcessCmdlines = () => rows;
  proc.killTree = (pid) => {
    kills.push(pid);
    const i = rows.findIndex((r) => r.pid === pid);
    if (i >= 0) rows.splice(i, 1);
    return true;
  };
  logger.log = () => {};
  require.cache[fgPath] = {
    id: fgPath,
    filename: fgPath,
    loaded: true,
    exports: { cleanupForeground: () => {} },
  };
  delete require.cache[require.resolve('./stop')];
  try {
    const { stopResidualServices } = require('./stop');
    const ok = await stopResidualServices();
    assert.ok(kills.includes(782), '定向步骤漏掉的进程必须由终检清扫强杀');
    assert.equal(ok, true, '清扫后复查应通过');
  } finally {
    fs.existsSync = origExists;
    proc.getProcessCmdlines = origGetCmdlines;
    proc.killTree = origKillTree;
    logger.log = origLog;
    if (origFg) require.cache[fgPath] = origFg;
    else delete require.cache[fgPath];
    delete require.cache[require.resolve('./stop')];
    require('./stop');
  }
});
