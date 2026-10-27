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
 * - 基础服务启动后失败（前台）：立即派生全量停止（killChildProcessesSync +
 *   spawnDetachedCleanup + markCleanExit）再 exit(1)——不留 PG/Redis 跑着锁目录
 *   （2026-10-27 真机事故：迁移失败后驱动常驻、目录锁死）
 * - 基础服务启动后失败（PM2）：不停服务（按设计常驻），直接 exit(1)
 *
 * startInfrastructure 桩默认返回 false，使 deployModeImpl 在注册点之后立即
 * 走失败收尾——下游步骤（版本检查 / 迁移 / 构建校验 / 尾验）无需逐个 stub。
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
    killChildProcessesSync: rec(() => 0, 'killChildProcessesSync'),
    spawnDetachedCleanup: rec(() => {}, 'spawnDetachedCleanup'),
    markCleanExit: rec(() => {}, 'markCleanExit'),
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

/**
 * 拦截 process.exit：abortAfterInfra 在部署失败时 exit(1)，测试里替换为
 * 「记录退出码 + 抛错」让调用栈正常返回。返回捕获的退出码（未退出则 null）。
 */
async function runUntilExit(deploy, args) {
  let exitCode = null;
  const realExit = process.exit;
  process.exit = (code) => {
    exitCode = code;
    throw new Error('__process_exit__');
  };
  try {
    await deploy.deployMode(...args);
  } catch (err) {
    if (err.message !== '__process_exit__') throw err; // 预期的退出信号
  } finally {
    process.exit = realExit;
  }
  return exitCode;
}

test('前台模式：退出处理器早于 startInfrastructure 注册；失败即全停后退出', async () => {
  const { deploy, calls } = setup({});

  const exitCode = await runUntilExit(deploy, [
    false,
    { mode: 'foreground' },
  ]);

  assert.equal(exitCode, 1, '前台部署失败：全停收尾后 exit(1)');
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
  // 2026-10-27 真机事故回归：基础服务启动后失败须立即派生全量停止，
  // 不留 PG/Redis 跑着锁住部署目录
  assert.ok(calls.includes('killChildProcessesSync'), '前台失败：同步杀子进程');
  assert.ok(calls.includes('spawnDetachedCleanup'), '前台失败：派生 detached 全量停止');
  assert.ok(calls.includes('markCleanExit'), '前台失败：写 clean 标记（哨兵不重复停止）');
  assert.ok(
    calls.indexOf('killChildProcessesSync') <
      calls.indexOf('spawnDetachedCleanup') &&
      calls.indexOf('spawnDetachedCleanup') < calls.indexOf('markCleanExit'),
    '全停顺序：杀子进程 → 派生 cleanup → 写 clean 标记'
  );
});

test('PM2 模式：不注册前台退出处理器；失败只退出不全停', async () => {
  const { deploy, calls } = setup({});

  const exitCode = await runUntilExit(deploy, [false, { mode: 'pm2' }]);

  assert.equal(exitCode, 1, 'PM2 部署失败：直接 exit(1)');
  assert.ok(
    !calls.includes('setupSignalHandlers'),
    'PM2 模式不得注册前台退出处理器'
  );
  assert.ok(
    !calls.includes('spawnDetachedCleanup'),
    'PM2 模式失败不触发全停（基础服务按设计常驻）'
  );
});
