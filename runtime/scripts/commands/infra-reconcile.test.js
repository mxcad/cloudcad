/**
 * reconcileInfrastructureWithPm2 对"别家 PM2 定义"的处置回归测试（node:test，0 外部依赖）
 *
 * 回归背景：Windows 上 PM2 daemon 全机唯一（命名管道寻址，PM2_HOME 只决定文件位置），
 * 多个部署目录共写同一份 app 注册表。先注册者恒赢——后 start 的目录对同名 app 发
 * `pm2 restart` 跑的还是别家脚本（别家 .env 密钥 / 别家数据目录）。
 * 修复前 reconcile 只对 redis 拦这个坑（foreignRedis），其余服务只打一行提示就
 * 静默沿用别家的定义与数据——等于拿别人的库当自己的库，本目录 .env 密钥与之
 * 错位，而输出上看不出任何差别。
 *
 * 锁定的行为：
 *  1. 端口开 + PM2 online + 别家定义 + 非 redis → 中止（返回 false），不删除、
 *     不接管、不碰对方运行中的实例；
 *  2. 端口空闲 + 别家定义 → 删除别家条目并用本目录配置重新注册（不 restart）；
 *  3. 端口开 + PM2 online + 本目录定义 → 健康复用，不删除也不中止。
 *
 * mock 手法：infra.js 在模块加载期从 lib/proc 解构导出，故必须在 require('./infra')
 * 之前打补丁并删除其缓存条目；补丁在 require 之后立即还原（解构已捕获 mock，
 * 还原不影响本次调用）。
 *
 * 运行：node --test runtime/scripts/commands/infra-reconcile.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

const { PROJECT_ROOT, PORTS, INFRA_APP_TO_PORT_KEY } = require('../lib/context');

// 另一部署目录（真实部署包路径形态）：在仓库外，必然判为别家定义。
const OTHER_DEPLOY_DIR = path.join(
  os.tmpdir(),
  'cloudcad-deploy-other-dir',
).replace(/\\/g, '/');

const ALL_APPS = ['config-service', 'cooperate', 'postgresql', 'redis'];

function loadReconcile({ pm2Entries, pm2AppStatus, portOpenMap }) {
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const prevStatusList = proc.getPm2StatusList;
  const prevAppStatus = proc.getPm2AppStatus;
  const prevRunPm2 = proc.runPm2;
  const prevPidByPort = proc.getPidByPort;

  const pm2Calls = [];
  proc.getPm2StatusList = () => pm2Entries;
  proc.getPm2AppStatus = (name) => pm2AppStatus[name] || 'unknown';
  proc.runPm2 = (args) => {
    pm2Calls.push(args.slice());
    return true;
  };
  // 不会走到 getPidByPort（别家定义分支在取 PID 之前就已返回），给个安全空实现。
  proc.getPidByPort = () => null;

  const healthPath = require.resolve('../lib/health');
  const health = require(healthPath);
  const prevIsPortOpen = health.isPortOpen;
  const openByPort = {};
  for (const name of ALL_APPS) {
    openByPort[PORTS[INFRA_APP_TO_PORT_KEY[name]]] = !!portOpenMap[name];
  }
  health.isPortOpen = async (port) => !!openByPort[port];

  const infraPath = require.resolve('./infra');
  delete require.cache[infraPath];
  const infra = require('./infra');

  proc.getPm2StatusList = prevStatusList;
  proc.getPm2AppStatus = prevAppStatus;
  proc.runPm2 = prevRunPm2;
  proc.getPidByPort = prevPidByPort;
  health.isPortOpen = prevIsPortOpen;

  return { reconcile: infra.reconcileInfrastructureWithPm2, pm2Calls };
}

function entriesFor(appName, pmCwd, status) {
  return [{ name: appName, pm2_env: { pm_cwd: pmCwd, status } }];
}

test('端口开 + PM2 online + 别家定义（postgresql）→ 中止，不删除不接管', async () => {
  const { reconcile, pm2Calls } = loadReconcile({
    pm2Entries: entriesFor('postgresql', OTHER_DEPLOY_DIR, 'online'),
    pm2AppStatus: { postgresql: 'online' },
    portOpenMap: { postgresql: true },
  });

  assert.equal(await reconcile({ postgresql: true }, { postgresql: 'online' }), false);
  // reconcile 在循环内即 return false，不应发出任何 PM2 指令（删除或启动都没有）
  assert.equal(pm2Calls.length, 0, '不应删除别家定义，也不应启动任何服务');
});

test('端口空闲 + 别家定义 → 删除并重新注册，不 restart 别家脚本', async () => {
  const { reconcile, pm2Calls } = loadReconcile({
    pm2Entries: entriesFor('postgresql', OTHER_DEPLOY_DIR, 'stopped'),
    pm2AppStatus: { postgresql: 'stopped' },
    portOpenMap: {},
  });

  assert.equal(await reconcile({}, {}), true);

  assert.deepEqual(pm2Calls[0], ['delete', 'postgresql'], '先删除别家注册条目');
  const startCall = pm2Calls.find((c) => c[0] === 'start');
  assert.ok(startCall, '删除后必须重新注册本目录定义');
  assert.ok(
    String(startCall).includes('postgresql'),
    '重新注册的清单里必须含 postgresql'
  );
  assert.equal(
    pm2Calls.some((c) => c[0] === 'restart'),
    false,
    '别家定义不得走 restart（restart 跑的是先注册的别家脚本）'
  );
});

test('端口开 + PM2 online + 本目录定义 → 健康复用，不删除也不中止', async () => {
  const { reconcile, pm2Calls } = loadReconcile({
    pm2Entries: entriesFor('postgresql', PROJECT_ROOT, 'online'),
    pm2AppStatus: { postgresql: 'online' },
    portOpenMap: { postgresql: true },
  });

  assert.equal(await reconcile({ postgresql: true }, { postgresql: 'online' }), true);
  assert.equal(pm2Calls.some((c) => c[0] === 'delete'), false, '本目录定义不得被删除');
  assert.ok(
    !pm2Calls.some((c) => c[0] === 'start' && String(c).includes('postgresql')),
    '已在运行的本目录实例不应被重新注册'
  );
});
