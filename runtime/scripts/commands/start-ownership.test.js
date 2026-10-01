/**
 * start.js 应用层 PM2 归属防护回归测试（node:test，0 外部依赖）
 *
 * 回归背景：Windows 上 PM2 daemon 全机唯一（命名管道寻址，PM2_HOME 只决定文件位置），
 * 多个部署目录共写同一份 app 注册表。基础服务层（infra.js）早有 foreignApp 防护，
 * 但应用层（start.js）一直只看"是否已注册"来决定 start/restart——`pm2 restart <config>`
 * 对同名已注册 app 复用注册表里的**旧定义**，config 里的新定义被完全忽略。
 * 于是两个部署包混用时：基础服务被换成新包（新 .env 密钥/新数据目录），
 * backend/frontend 却仍是旧包定义（旧 .env 密钥），本目录后端用旧 REDIS_PASSWORD
 * 连新 redis → AUTH 恒失败（ERR invalid password），而输出上看不出任何差别。
 *
 * 锁定的行为：
 *  1. 门禁：别家定义 online（对方项目仍在服务）→ 中止，且不发任何 pm2 指令
 *     （否则基础服务先被接管、应用层才中止，留下无法回退的半接管态）；
 *  2. 门禁：别家定义已停止 → 放行（删除只影响注册表条目，不碰对方运行实例与其库）；
 *  3. 清理：别家定义 → `pm2 delete`；本目录定义保留不删（回归保护：不破坏
 *     "多次 start 走 restart"的既有语义）；
 *  4. shouldRestartAppServices 语义不变。
 *
 * mock 手法：start.js 在模块加载期从 lib/proc 解构导出，故必须在 require('./start')
 * 之前打补丁并删除其缓存条目；补丁在 require 之后立即还原（解构已捕获 mock）。
 * isPm2AppFromThisProject 保持真实（纯路径判定，不依赖 proc）。
 *
 * 运行：node --test runtime/scripts/commands/start-ownership.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

const { PROJECT_ROOT } = require('../lib/context');

// 另一部署目录（真实部署包路径形态）：在仓库外，必然判为别家定义。
const OTHER_DEPLOY_DIR = path.join(
  os.tmpdir(),
  'cloudcad-deploy-other-dir',
).replace(/\\/g, '/');

/** 构造 PM2 注册表条目。specs: [[name, pmCwd, status], ...] */
function entriesFor(specs) {
  return specs.map(([name, pmCwd, status]) => ({
    name,
    pm2_env: { pm_cwd: pmCwd, status },
  }));
}

function loadStart({ pm2Entries, appStatus }) {
  const procPath = require.resolve('../lib/proc');
  const proc = require(procPath);
  const prevStatusList = proc.getPm2StatusList;
  const prevAppStatus = proc.getPm2AppStatus;
  const prevRunPm2 = proc.runPm2;
  const loggerPath = require.resolve('../lib/logger');
  const logger = require(loggerPath);
  const prevLog = logger.log;

  const pm2Calls = [];
  proc.getPm2StatusList = () => pm2Entries;
  proc.getPm2AppStatus = (name) => appStatus[name] || 'unknown';
  proc.runPm2 = (args) => {
    pm2Calls.push(args.slice());
    return true;
  };
  logger.log = () => {};

  delete require.cache[require.resolve('./start')];
  const start = require('./start');

  proc.getPm2StatusList = prevStatusList;
  proc.getPm2AppStatus = prevAppStatus;
  proc.runPm2 = prevRunPm2;
  logger.log = prevLog;

  return { start, pm2Calls };
}

// ─────────────────────────────────────────────────────────────────────────
// 前置归属审计门禁
// ─────────────────────────────────────────────────────────────────────────

test('门禁：别家定义 online（对方仍在服务）→ 中止，不发任何 pm2 指令', async () => {
  const { start, pm2Calls } = loadStart({
    pm2Entries: entriesFor([
      ['backend', OTHER_DEPLOY_DIR, 'online'],
      ['frontend', OTHER_DEPLOY_DIR, 'online'],
    ]),
    appStatus: {},
  });
  assert.equal(await start.assertNoForeignAppConflict(), false);
  // 关键：中止必须发生在任何 pm2 指令之前——基础服务尚未被接管，故可干净回退。
  assert.equal(pm2Calls.length, 0);
});

test('门禁：别家定义已停止（stopped/errored）→ 放行，交后续清理删除', async () => {
  const { start } = loadStart({
    pm2Entries: entriesFor([
      ['backend', OTHER_DEPLOY_DIR, 'stopped'],
      ['frontend', OTHER_DEPLOY_DIR, 'errored'],
      ['postgresql', OTHER_DEPLOY_DIR, 'stopped'],
    ]),
    appStatus: {},
  });
  assert.equal(await start.assertNoForeignAppConflict(), true);
});

test('门禁：本目录定义 online → 放行（回归保护：不误拦正常重复启动）', async () => {
  const { start } = loadStart({
    pm2Entries: entriesFor([
      ['backend', PROJECT_ROOT, 'online'],
      ['frontend', `${PROJECT_ROOT}/packages/backend`, 'online'],
    ]),
    appStatus: {},
  });
  assert.equal(await start.assertNoForeignAppConflict(), true);
});

test('门禁：只拦 online 的别家条目，同批中的 stopped 条目不放大结论', async () => {
  const { start } = loadStart({
    pm2Entries: entriesFor([
      ['postgresql', PROJECT_ROOT, 'online'],
      ['backend', OTHER_DEPLOY_DIR, 'stopped'],
      ['redis', OTHER_DEPLOY_DIR, 'online'],
    ]),
    appStatus: {},
  });
  // redis（基础层）online 且属别家 → 仍判冲突；backend stopped 不额外计入。
  assert.equal(await start.assertNoForeignAppConflict(), false);
});

test('门禁：空注册表 / PM2 无托管条目 → 放行', async () => {
  const { start } = loadStart({ pm2Entries: [], appStatus: {} });
  assert.equal(await start.assertNoForeignAppConflict(), true);
});

// ─────────────────────────────────────────────────────────────────────────
// 别家定义清理
// ─────────────────────────────────────────────────────────────────────────

test('清理：别家定义 → pm2 delete；本目录定义与未注册名字保留', () => {
  const { start, pm2Calls } = loadStart({
    pm2Entries: entriesFor([
      ['backend', OTHER_DEPLOY_DIR, 'stopped'],
      ['frontend', PROJECT_ROOT, 'stopped'],
    ]),
    appStatus: {},
  });
  start.deleteForeignAppDefinitions(['backend', 'frontend', 'conversion']);
  assert.deepEqual(pm2Calls, [['delete', 'backend']]);
});

test('清理：全部本目录 → 不发 delete（回归保护：restart 路径不被破坏）', () => {
  const { start, pm2Calls } = loadStart({
    pm2Entries: entriesFor([
      ['backend', PROJECT_ROOT, 'stopped'],
      ['frontend', PROJECT_ROOT, 'online'],
    ]),
    appStatus: { backend: 'stopped', frontend: 'online' },
  });
  start.deleteForeignAppDefinitions(['backend', 'frontend']);
  assert.equal(pm2Calls.length, 0);
});

test('回归：shouldRestartAppServices 语义不变（已注册→restart，全未注册→start）', () => {
  const { start } = loadStart({ pm2Entries: [], appStatus: {} });
  assert.equal(start.shouldRestartAppServices('stopped', 'unknown'), true);
  assert.equal(start.shouldRestartAppServices('unknown', 'online'), true);
  assert.equal(start.shouldRestartAppServices('unknown', 'unknown'), false);
});
