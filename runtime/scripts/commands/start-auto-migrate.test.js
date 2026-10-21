/**
 * startAppServicesWithInfra 的迁移自动执行（#487 后续：手动部署也要自动迁移）
 *
 * start 是升级包「解压覆盖 → 重跑 start」的入口。此前只有 deploy 跑
 * runDatabaseMigration / runPiiBackfill，start 直接跳到应用层——升级包带新迁移
 * 时后端会带着陈旧 schema 启动（列缺失、枚举新增值未落库）。
 *
 * 覆盖三条：
 * - 迁移在基础服务之后、应用服务之前执行（顺序）
 * - 迁移失败 → 中止启动（带旧 schema 拉起应用只会表现为随机 5xx）
 * - PII 回填失败 → 只告警不中止（deploy 路径已拦过；start 再拦会新增
 *   「从旧备份还原部署目录后 start 起不来」的回归）
 *
 * Node 20 无 node:test mock.module，故用 require.cache 预置桩模块来隔离
 * PM2 / 端口 / 进程管理副作用。fs.existsSync 全返 false 是刻意的：让
 * startAppServices 在 dist 检查处干净早退（否则 PM2 注册会真的建应用、
 * conversion-service 分支还有 process.exit(1)），不影响断言顺序与返回值。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const stubs = new Map();
const origRealpathSync = require('fs').realpathSync.native;

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
  const logLines = [];
  const migrationOptions = { value: undefined };
  const rec = (fn, name) => (...a) => {
    calls.push(name);
    return fn(...a);
  };

  stub('../lib/context', {
    IS_LINUX: false,
    USE_RUNTIME: false,
    PROJECT_ROOT: 'D:/tmp/cloudcad-test',
    RUNTIME_DIR: 'D:/tmp/cloudcad-test/runtime',
    DATA_DIR: 'D:/tmp/cloudcad-test/data',
    PORTS: {
      backend: 3001,
      frontend: 3000,
      postgresql: 5432,
      redis: 6379,
      cooperate: 3091,
      configService: 3002,
      conversion: 3100,
    },
    NODE_EXE: 'node.exe',
    PM2_JS: null,
    getMobileAccessPath: () => '/mobile',
    OPS_ENTRY: 'runtime\\cloudcad.bat',
    INFRA_SERVICE_APPS: ['postgresql', 'redis', 'cooperate', 'config-service'],
  });
  const logger = {
    colors: new Proxy({}, { get: () => '' }),
    log: (level, msg) => logLines.push(msg),
    clearScreen: () => {},
    printHeader: () => {},
  };
  stub('../lib/logger', logger);
  stub('../lib/prompt', { promptChoice: async () => '1', promptConfirm: async () => true });
  stub('../lib/admin-login', { getAdminLoginPath: () => '/admin' });
  stub('../lib/proc', {
    runPm2: () => true,
    getPm2AppStatus: async () => 'online',
    getPm2StatusList: () => [],
    getPidByPort: () => null,
    isNodePid: () => false,
    isOurRuntimeProcess: () => false,
    killTree: () => {},
  });
  stub('../lib/health', {
    waitForPort: async () => {},
    waitForDatabase: async () => {},
    waitForRedis: async () => {},
    waitAndOpenBrowsers: async () => {},
    openBrowser: () => {},
    isPortOpen: async () => false,
    waitPortReleased: async () => {},
  });
  stub('../lib/env', {
    parseEnvFile: () => ({}),
    updateEnvFile: () => true,
  });
  stub('../lib/infra-gate', { findFreePortUpFrom: () => 3101 });
  stub('../lib/mxcad-path', { resolveMxcadAssemblyPath: () => null });
  stub('../config-updater', { alignConversionServiceUrl: () => ({ changed: false }) });
  stub('../lib/state', { childProcesses: new Map() });
  stub('./infra', {
    startInfrastructure: rec(async () => true, 'startInfrastructure'),
    isPm2AppFromThisProject: () => true,
  });
  stub('./stop', { stopAppServices: rec(async () => true, 'stopAppServices') });
  stub('./migrate', {
    runDatabaseMigration: rec(
      async (options) => {
        // 真 migrate.js 自己会打「[2/3] 执行数据库迁移...」，桩里补一条以便断言顺序
        logger.log('blue', '[2/3] 执行数据库迁移...');
        migrationOptions.value = options;
        return opts.migration !== false;
      },
      'runDatabaseMigration'
    ),
    runPiiBackfill: rec(async () => {
      logger.log('blue', 'PII 字段级加密存量回填（phone/email → enc/hmac）...');
      return opts.pii !== false;
    }, 'runPiiBackfill'),
  });
  stub('./setup-wizard', { runSetupWizard: async () => {}, showCurrentPasswords: () => {} });
  stub('../foreground/registry', { setupSignalHandlers: () => {} });

  // startAppServices 走 fs.existsSync 早退，必须全返 false
  require('fs').realpathSync.native = () => false;

  // 只清 start.js 自身的缓存（上一个测试留下的真实依赖绑定），桩保持不动。
  // 注意：require.cache 的键是绝对路径，stubs 里存的是相对路径，不能拿两者互查。
  delete require.cache[require.resolve('./start')];

  return { start: require('./start'), calls, logLines, migrationOptions };
}

test.after(() => {
  require('fs').realpathSync.native = origRealpathSync;
  for (const [rel, resolved] of stubs) delete require.cache[resolved];
});

test('顺序：基础设施 → 数据库迁移 → PII 回填 → 应用服务，非交互 options 透传给迁移', async () => {
  const result = setup({});
  const { start, calls, logLines } = result;

  const ok = await start.startAppServicesWithInfra('pm2', { mode: 'pm2' });

  assert.equal(ok, true, '迁移成功应继续启动并返回 true');
  assert.deepEqual(calls, [
    'startInfrastructure',
    'runDatabaseMigration',
    'runPiiBackfill',
  ]);
  assert.deepEqual(
    result.migrationOptions.value,
    { mode: 'pm2' },
    '非交互标记必须透传，否则备份失败会去问人而不是安全中止'
  );
  assert.ok(
    logLines.findIndex((l) => l.includes('执行数据库迁移')) >= 0,
    '迁移步骤要出现在启动日志里'
  );
  assert.ok(
    logLines.findIndex((l) => l.includes('[3/3] 启动应用服务')) >
      logLines.findIndex((l) => l.includes('执行数据库迁移')),
    '应用服务必须排在迁移之后'
  );
});

test('迁移失败 → 返回 false 且应用服务不启动', async () => {
  const { start, logLines } = setup({ migration: false });

  const ok = await start.startAppServicesWithInfra('pm2', null);

  assert.equal(ok, false, '迁移失败必须中止');
  assert.ok(
    logLines.some((l) => l.includes('数据库迁移失败，已中止启动')),
    '要给出中止原因'
  );
  assert.ok(
    !logLines.some((l) => l.includes('[3/3] 启动应用服务')),
    '迁移失败后不得进入应用服务启动'
  );
});

test('PII 回填失败 → 告警但不中止，应用服务照常启动', async () => {
  const { start, logLines } = setup({ pii: false });

  const ok = await start.startAppServicesWithInfra('pm2', null);

  assert.equal(ok, true, '回填失败不应挡住启动（deploy 路径已拦过）');
  assert.ok(
    logLines.some((l) => l.includes('PII 存量回填失败')),
    '必须告警，不能静默'
  );
  assert.ok(
    logLines.some((l) => l.includes('[3/3] 启动应用服务')),
    '告警之后仍要继续启动应用服务'
  );
});
