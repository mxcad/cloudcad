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

const { PROJECT_ROOT, DATA_DIR } = require('../lib/context');

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

test('PM2 守护进程由本目录 node 拉起 → 不算本目录残留（否则 stop 恒失败）', () => {
  // 目标机首次启动时 daemon 就是 runPm2 用本目录 node 拉起的：exe 落在本目录
  // runtime/windows/node/ 下，命令行又带 --pm_home 指向本目录 data/pm2 ——
  // 归属判据的两条分支都会命中它。而 daemon 是机器全局进程、本目录三个 stop
  // 函数都不管它，计入残留会让终检恒非零 → stop 恒返回 false → 恒提示"不能删包"。
  const { listOurResidualProcesses } = loadStopWithRows([
    {
      pid: 607,
      name: 'node.exe',
      exe: `${OUR_RUNTIME}/node/node.exe`,
      cmdline: `"${OUR_RUNTIME}\\node\\node.exe" "${OUR_RUNTIME}\\node\\node_modules\\pm2\\lib\\Daemon.js" --pm_home="${DATA_DIR}/pm2"`,
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
