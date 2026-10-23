/**
 * 应用层端口门禁：转换服务端口冲突的归属感知处置（node:test，0 外部依赖）
 *
 * 回归背景（2026-10-21 实例）：旧实现 relocateConversionPort 只看「端口是否被占」，
 * 被占就 +1 顺延并回写 backend/.env，完全不看占用者是谁。两个后果：
 *   1. 本部署自己的上一轮实例占着 3100 时也顺延——反复 start 把端口推到 3103，
 *      而 conversion-service 自己那份 .env 没同步，后端连 3103、服务监听 3100，
 *      上传转换全部 ECONNREFUSED 且错误信息为空串；
 *   2. 同机另一部署目录的前台实例占着 3100 时同样静默绕开——两个部署并存对外
 *      服务，没有任何入口提示旧部署还在跑，新目录也停不掉它（stop 按目录归属
 *      过滤），用户因此误以为「旧部署关不掉」。
 *
 * 锁定行为（与 decidePostgresGateAction 同一套归属口径）：
 *   - ours-pm2       → 复用端口，不搬不杀（PM2 restart 会重新绑定）
 *   - ours-residual  → 清掉本部署残留后用原端口
 *   - foreign-deploy → 询问；拒绝则中止启动（绝不静默换端口）
 *   - unknown        → 询问（plain node 无法区分本仓库 dev 与别家前台实例）
 *   - external       → 不碰别人，自己换端口避让
 *
 * mock 手法同 start-auto-migrate.test.js：start.js 在模块加载期解构依赖，故须在
 * require('./start') 之前打补丁并删缓存；补丁在 require 之后还原（解构已捕获）。
 *
 * 运行：node --test runtime/scripts/commands/start-app-port-gate.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const stubs = new Map();

function stub(relPath, exports) {
  stubs.set(relPath, require.resolve(relPath));
  require.cache[require.resolve(relPath)] = {
    id: require.resolve(relPath),
    filename: require.resolve(relPath),
    loaded: true,
    exports,
  };
}

/**
 * @param {object} opts
 * @param {'ours-pm2'|'ours-residual'|'foreign-deploy'|'unknown'|'external'} opts.ownership
 * @param {boolean} [opts.stopConsent] 询问类分支里用户是否同意停止
 * @param {boolean} [opts.portReleased] 清理/停止后端口是否已释放
 */
function setup(opts) {
  const calls = [];
  const logLines = [];
  const updates = [];
  const rec = (fn, name) => (...a) => {
    calls.push(name);
    return fn(...a);
  };

  const provenance = opts.ownership;
  const pidMatchesOwnership = (fn) => {
    if (provenance === 'ours-residual') return fn === 'ours';
    if (provenance === 'foreign-deploy') return fn === 'foreign';
    if (provenance === 'external') return fn === 'neither-node';
    return fn === 'plain-node';
  };

  stub('../lib/context', {
    IS_LINUX: false,
    USE_RUNTIME: false,
    PROJECT_ROOT: 'D:/tmp/cloudcad-test',
    RUNTIME_DIR: 'D:/tmp/cloudcad-test/runtime',
    DATA_DIR: 'D:/tmp/cloudcad-test/data',
    PORTS: {
      backend: 3001,
      frontend: 8000,
      postgresql: 5432,
      redis: 6379,
      cooperate: 3091,
      configService: 3002,
      conversion: 3100,
    },
    NODE_EXE: 'node.exe',
    PM2_JS: null,
    getMobileAccessPath: () => '/mobile',
    OPS_ENTRY: 'runtime/cloudcad',
    INFRA_SERVICE_APPS: ['postgresql', 'redis', 'cooperate', 'config-service'],
  });
  stub('../lib/logger', {
    colors: new Proxy({}, { get: () => '' }),
    log: (level, msg) => logLines.push(msg),
    clearScreen: () => {},
    printHeader: () => {},
  });
  stub('../lib/prompt', {
    promptChoice: async () => '2',
    promptConfirm: rec(async () => opts.stopConsent === true, 'promptConfirm'),
  });
  stub('../lib/admin-login', { getAdminLoginPath: () => '/admin' });
  stub('../lib/proc', {
    // 保留真实的 classifyPortOwner：归属阶梯本体就是被测语义，只覆盖它的钩子
    ...require('../lib/proc'),
    runPm2: () => true,
    getPm2AppStatus: () => 'unknown',
    // ours-pm2 走 PM2 注册表判定，其余走 PID 判定
    getPm2StatusList: () =>
      provenance === 'ours-pm2'
        ? [
            {
              name: 'conversion',
              pm2_env: { status: 'online', pm_cwd: 'D:/tmp/cloudcad-test' },
            },
          ]
        : [],
    getPidByPort: () => (provenance === 'ours-pm2' ? null : 4242),
    isNodePid: () => pidMatchesOwnership('plain-node'),
    isOurRuntimeProcess: () => pidMatchesOwnership('ours'),
    isForeignCloudCadRuntimeProcess: () => pidMatchesOwnership('foreign'),
    getProcessExecutablePath: () =>
      pidMatchesOwnership('foreign')
        ? 'D:/other-deploy/runtime/windows/node/node.exe'
        : 'C:/Program Files/nodejs/node.exe',
    getProcessCmdlines: () => [
      { pid: 4242, cmdline: 'node dist/main', exe: 'node.exe' },
    ],
    killTree: rec(() => true, 'killTree'),
  });
  stub('../lib/health', {
    waitForPort: async () => {},
    waitForDatabase: async () => {},
    waitForRedis: async () => {},
    waitAndOpenBrowsers: async () => {},
    openBrowser: () => {},
    isPortOpen: async () => true,
    waitPortReleased: rec(
      async () => opts.portReleased !== false,
      'waitPortReleased'
    ),
  });
  stub('../lib/env', {
    parseEnvFile: () => ({}),
    updateEnvFile: rec((_file, u) => {
      updates.push(u);
      return true;
    }, 'updateEnvFile'),
  });
  // 真实 infra-gate 先取出来：start.js 需要真的决策表（红绿锚点才有意义），
  // 只需把「找空闲端口」换成可断言、不碰真实网络的桩。
  const realInfraGate = require('../lib/infra-gate');
  stub('../lib/infra-gate', {
    ...realInfraGate,
    findFreePortUpFrom: rec(async () => 3101, 'findFreePortUpFrom'),
  });
  stub('../lib/mxcad-path', { resolveMxcadAssemblyPath: () => null });
  stub('../config-updater', {
    alignConversionServiceUrl: rec(() => ({ changed: false }), 'align'),
    syncConversionServiceEnvPort: rec(
      () => 'ok',
      'syncConversionServiceEnvPort'
    ),
  });
  stub('../lib/state', { childProcesses: new Map(), appProcesses: new Set() });
  stub('./infra', {
    startInfrastructure: async () => true,
    isPm2AppFromThisProject: () => provenance === 'ours-pm2',
    askForeignServiceStop: rec(
      async () => opts.stopConsent === true,
      'askForeignServiceStop'
    ),
    stopForeignService: rec(() => true, 'stopForeignService'),
  });
  stub('./stop', { stopAppServices: async () => true });
  stub('./migrate', {
    runDatabaseMigration: async () => true,
    runPiiBackfill: async () => true,
  });
  stub('./setup-wizard', {
    runSetupWizard: async () => {},
    showCurrentPasswords: () => {},
  });
  stub('../foreground/registry', { setupSignalHandlers: () => {} });

  const start = require('./start');
  return { start, calls, logLines, updates };
}

function teardown() {
  for (const resolved of stubs.values()) delete require.cache[resolved];
  stubs.clear();
  delete require.cache[require.resolve('./start')];
}// ---------------------------------------------------------------------------
// 纯决策表（不经 start.js，最快的红绿锚点）
// ---------------------------------------------------------------------------

test('decideConversionPortAction: 归属 → 动作全表', () => {
  const { decideConversionPortAction } = require('../lib/infra-gate');
  assert.equal(decideConversionPortAction({ ownership: 'ours-pm2' }), 'reuse');
  assert.equal(decideConversionPortAction({ ownership: 'ours-residual' }), 'clean');
  assert.equal(
    decideConversionPortAction({ ownership: 'foreign-deploy' }),
    'ask-foreign'
  );
  assert.equal(decideConversionPortAction({ ownership: 'unknown' }), 'ask-unknown');
  assert.equal(decideConversionPortAction({ ownership: 'external' }), 'relocate');
});

test('decideConversionPortAction: 未知归属不得被当成"可静默换端口"', () => {
  // 旧实现的缺陷正是把一切占用都当 external → relocate。unknown 必须走询问。
  const { decideConversionPortAction } = require('../lib/infra-gate');
  assert.notEqual(decideConversionPortAction({ ownership: 'unknown' }), 'relocate');
  // 另一部署目录也必须询问，否则两个部署并存且无人知晓。
  assert.notEqual(
    decideConversionPortAction({ ownership: 'foreign-deploy' }),
    'relocate'
  );
});

// ---------------------------------------------------------------------------
// classifyAppPortOwner：占用者归属判定
// ---------------------------------------------------------------------------

test('classifyAppPortOwner: 本部署 PM2 online → ours-pm2', () => {
  const { start } = setup({ ownership: 'ours-pm2' });
  assert.equal(
    start.classifyAppPortOwner({ name: 'conversion', pid: null }),
    'ours-pm2'
  );
  teardown();
});

test('classifyAppPortOwner: 本目录 runtime 进程 → ours-residual', () => {
  const { start } = setup({ ownership: 'ours-residual' });
  assert.equal(
    start.classifyAppPortOwner({ name: 'conversion', pid: 4242 }),
    'ours-residual'
  );
  teardown();
});

test('classifyAppPortOwner: 另一部署目录 runtime 进程 → foreign-deploy', () => {
  const { start } = setup({ ownership: 'foreign-deploy' });
  assert.equal(
    start.classifyAppPortOwner({ name: 'conversion', pid: 4242 }),
    'foreign-deploy'
  );
  teardown();
});

test('classifyAppPortOwner: plain node 归属不可判定 → unknown（不得猜成本部署）', () => {
  const { start } = setup({ ownership: 'unknown' });
  assert.equal(
    start.classifyAppPortOwner({ name: 'conversion', pid: 4242 }),
    'unknown'
  );
  teardown();
});

test('classifyAppPortOwner: 非 node 系统服务 → external', () => {
  const { start } = setup({ ownership: 'external' });
  assert.equal(
    start.classifyAppPortOwner({ name: 'conversion', pid: 4242 }),
    'external'
  );
  teardown();
});

// ---------------------------------------------------------------------------
// resolveConversionPortConflict：处置动作
// ---------------------------------------------------------------------------

test('本部署 PM2 实例占端口 → 复用，不换端口不杀进程', async () => {
  const { start, calls, updates } = setup({ ownership: 'ours-pm2' });
  const conversion = { env: {} };
  assert.equal(await start.resolveConversionPortConflict(conversion), 'ok');
  assert.deepEqual(updates, [], '不得改写 .env');
  assert.equal(calls.includes('killTree'), false, '不得杀 PM2 托管实例');
  assert.equal(conversion.env.CONVERSION_SERVICE_PORT, undefined);
  teardown();
});

test('本部署残留进程占端口 → 清掉后用原端口（不换端口）', async () => {
  const { start, calls, updates } = setup({ ownership: 'ours-residual' });
  const conversion = { env: {} };
  assert.equal(await start.resolveConversionPortConflict(conversion), 'ok');
  assert.equal(calls.includes('killTree'), true);
  assert.deepEqual(updates, [], '自己的残留不需要改端口');
  teardown();
});

test('另一部署目录占端口 + 用户拒绝让位 → blocked（绝不静默换端口）', async () => {
  const { start, calls, updates } = setup({
    ownership: 'foreign-deploy',
    stopConsent: false,
  });
  const conversion = { env: {} };
  assert.equal(await start.resolveConversionPortConflict(conversion), 'blocked');
  assert.deepEqual(updates, [], '不得改写 .env 换端口');
  assert.equal(calls.includes('findFreePortUpFrom'), false, '不得找空闲端口');
  assert.equal(calls.includes('stopForeignService'), false, '未经同意不得停对方');
  teardown();
});

test('另一部署目录占端口 + 用户同意 → 经对方 PM2 停止，沿用原端口', async () => {
  const { start, calls, updates } = setup({
    ownership: 'foreign-deploy',
    stopConsent: true,
  });
  const conversion = { env: {} };
  assert.equal(await start.resolveConversionPortConflict(conversion), 'ok');
  assert.equal(calls.includes('stopForeignService'), true);
  assert.deepEqual(updates, [], '让位后沿用原端口，无需换端口');
  teardown();
});

test('plain node 占用 + 用户拒绝 → blocked（不误杀可能的别家前台实例）', async () => {
  const { start, calls, updates } = setup({
    ownership: 'unknown',
    stopConsent: false,
  });
  assert.equal(
    await start.resolveConversionPortConflict({ env: {} }),
    'blocked'
  );
  assert.equal(calls.includes('killTree'), false);
  assert.deepEqual(updates, []);
  teardown();
});

test('外部系统服务占用 → 换端口并同步三份配置', async () => {
  const { start, calls, updates } = setup({ ownership: 'external' });
  const conversion = { env: {} };
  assert.equal(await start.resolveConversionPortConflict(conversion), 'ok');
  assert.equal(calls.includes('findFreePortUpFrom'), true);
  assert.deepEqual(updates, [{ CONVERSION_SERVICE_PORT: '3101' }]);
  assert.equal(conversion.env.CONVERSION_SERVICE_PORT, '3101');
  // 换端口必须同步 conversion-service 自己那份 .env，否则源码 dev 起的服务
  // 仍监听旧端口 → 后端连不上的老故障复现。
  assert.equal(calls.includes('syncConversionServiceEnvPort'), true);
  assert.equal(calls.includes('align'), true);
  teardown();
});

test('清理本部署残留后端口仍未释放 → blocked（不带着冲突继续启动）', async () => {
  const { start, updates } = setup({
    ownership: 'ours-residual',
    portReleased: false,
  });
  assert.equal(
    await start.resolveConversionPortConflict({ env: {} }),
    'blocked'
  );
  assert.deepEqual(updates, []);
  teardown();
});
