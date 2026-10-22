/**
 * deployMode 的前台退出处理器注册时机（回归测试）
 *
 * 「关终端 = 全停」依赖信号处理器在拉起基础服务**之前**就已注册。deploy 路径
 * 不经 startAppServicesWithInfra（直接 startInfrastructure + startAppServices），
 * 此前从 stopAppServices 到 startAppServices 的整段部署窗口（图纸版本检查、
 * 数据库迁移、PII 回填、构建校验）里关终端只会触发 OS 硬杀——不派生 detached
 * 全量停止，PM2 托管的基础服务就此残留。
 *
 * 锁定点：
 * - 前台模式（options.mode === 'foreground'）：setupSignalHandlers 必须早于 startInfrastructure
 * - PM2 模式：不注册（后台模式关终端不该停服务）
 *
 * startInfrastructure 桩默认返回 false，使 deployModeImpl 在注册点之后立即
 * return——下游步骤（版本检查 / 迁移 / 构建校验 / 尾验）无需逐个 stub。
 *
 * 运行：node --test runtime/scripts/commands/deploy-foreground-signal.test.js
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

function setup(opts = {}) {
  const calls = [];
  const rec =
    (fn, name) =>
    (...a) => {
      calls.push(name);
      return fn(...a);
    };

  stub('../lib/context', {
    PROJECT_ROOT: 'D:/tmp/cloudcad-test',
    PORTS: {
      backend: 3001,
      frontend: 8000,
      postgresql: 5432,
      redis: 6379,
      cooperate: 3091,
      configService: 3002,
      conversion: 3100,
    },
  });
  stub('../lib/logger', {
    colors: new Proxy({}, { get: () => '' }),
    log: () => {},
    clearScreen: () => {},
    printHeader: () => {},
  });
  stub('../lib/proc', { runPnpm: async () => true });
  stub('../lib/prompt', { promptChoice: async () => '2' });
  stub('../lib/health', {
    waitForDatabase: async () => {},
    waitForRedis: async () => {},
  });
  stub('../lib/deploy-log', { runWithDeployLog: async (_name, fn) => fn() });
  stub('../foreground/registry', {
    setupSignalHandlers: rec(async () => {}, 'setupSignalHandlers'),
  });
  stub('../drawing-version-helper', {
    runHealthCheck: async () => ({ failures: 0, warnings: 0 }),
  });
  stub('./infra', {
    startInfrastructure: rec(async () => opts.infraOk, 'startInfrastructure'),
    setupPm2Startup: async () => {},
  });
  stub('./stop', { stopAppServices: rec(async () => true, 'stopAppServices') });
  stub('./migrate', {
    runDatabaseMigration: async () => true,
    runPiiBackfill: async () => true,
  });
  stub('./dev', { rimdir: async () => {} });
  stub('./start', {
    startAppServices: rec(async () => true, 'startAppServices'),
    assertNoForeignAppConflict: rec(
      async () => true,
      'assertNoForeignAppConflict'
    ),
  });

  delete require.cache[require.resolve('./deploy')];
  return { deploy: require('./deploy'), calls };
}

test.after(() => {
  for (const [rel, resolved] of stubs) delete require.cache[resolved];
});

test('前台模式：退出处理器早于 startInfrastructure 注册', async () => {
  const { deploy, calls } = setup({});

  const ok = await deploy.deployMode(false, { mode: 'foreground' });

  assert.equal(ok, false, 'startInfrastructure 失败即中止部署');
  assert.ok(
    calls.includes('setupSignalHandlers'),
    '前台模式必须注册退出处理器'
  );
  assert.ok(
    calls.indexOf('setupSignalHandlers') < calls.indexOf('startInfrastructure'),
    '处理器必须早于 startInfrastructure'
  );
  assert.ok(
    calls.indexOf('stopAppServices') < calls.indexOf('setupSignalHandlers'),
    '注册点应在应用层停止之后（不干扰应用层端口让渡）'
  );
});

test('PM2 模式：不注册前台退出处理器', async () => {
  const { deploy, calls } = setup({});

  const ok = await deploy.deployMode(false, { mode: 'pm2' });

  assert.equal(ok, false, 'startInfrastructure 失败即中止部署');
  assert.ok(
    !calls.includes('setupSignalHandlers'),
    'PM2 模式不得注册前台退出处理器'
  );
});
