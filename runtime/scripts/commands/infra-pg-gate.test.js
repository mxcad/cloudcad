/**
 * PG 端口门禁（ensurePostgresPortManaged）处置矩阵回归测试（node:test，0 外部依赖）
 *
 * 回归背景（2026-10，#425）：.env 的 DB 端口被外部实例（系统装的 PostgreSQL）
 * 占用时，旧流程只会在 reconcile 里告警"端口被外部进程占用，未接管"然后继续
 * 部署——迁移步骤拿本部署的密码连系统 PG，认证恒失败，"是否继续部署？"成了假
 * 选择（同一套凭据下 migrate deploy 必败）。用户 VM 实例：系统 PG 占 5432，
 * 部署以普通用户运行（跨用户看不到系统 PG 的 PID），部署卡死在备份失败提示。
 *
 * 新策略锁定的行为（用户明确要求："始终用本地的，不破坏正在运行的系统数据库"）：
 *  1. 本部署实例（postmaster.pid 匹配 / 可执行文件在本目录 runtime 下）→ 复用；
 *  2. 外部实例（系统 PG / 其他用户，任何情况）→ 一律不碰（不停、不改密、不
 *     采纳）→ 自带 PG 自动换到空闲端口，.env 的 DB_PORT 与 DATABASE_URL 成对
 *     改写（relocated）；
 *  3. 另一部署目录的实例（同包多解压）→ 直接停掉、启动本目录的（stop-foreign，
 *     无需询问）；停止失败 / 端口未释放 → blocked；
 *  4. PID 无法定位但全量扫描已执行（fullScanDone）→ 必属其他用户 → 换端口；
 *     手段不足（!fullScanDone）→ blocked（无法排除是本部署实例，防共写数据目录）；
 *  5. 远程 DB_HOST → ok（自带 PG 不服务远程库，连不上由迁移步骤上报）；
 *  6. DATABASE_URL 端口与 DB_PORT 漂移 → 自动对齐（repaired，用户 VM 实锤的
 *     split-brain：DB_PORT=5433、URL 仍 5432，pg_dump 成功但 Prisma 连系统库
 *     P1000）；DATABASE_URL 主机与 DB_HOST 指向不同机器 / 形状无法识别 /
 *     换端口落盘失败 / 无空闲端口 → blocked 且内存 PORTS 不变。
 *
 * mock 手法（同 infra-redis-gate.test.js）：infra.js 在模块加载期从 lib/proc、
 * lib/health、lib/env、config-updater、lib/credentials 解构导出，故必须在
 * require('./infra') 之前打补丁并删除其缓存条目；补丁在 require 之后立即还原
 * （解构已捕获 mock）。
 *
 * CLOUDCAD_PG_DATA_DIR 在 require infra 之前重定向到临时目录（pg-manager.js 的
 * 单测约定），postmaster.pid 判据测试不触碰真实数据目录。
 *
 * 运行：node --test runtime/scripts/commands/infra-pg-gate.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PORTS, BACKEND_ENV_PATH } = require('../lib/context');

// 必须在 require('./infra') 之前设置：PG_DATA_DIR 在模块加载期解析
const PG_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-gate-'));
process.env.CLOUDCAD_PG_DATA_DIR = PG_TMP;

// 内存 PORTS 是共享对象：relocate 会改写 PORTS.postgresql。每个用例前重置为
// 已知默认值（排除 dev .env 的干扰），用例后还原，避免跨用例/跨文件污染。
const SAVED_PORTS = { ...PORTS };
function resetPorts() {
  PORTS.backend = 3001;
  PORTS.frontend = 3000;
  PORTS.configService = 3002;
  PORTS.postgresql = 5432;
  PORTS.redis = 6379;
  PORTS.cooperate = 3091;
  PORTS.conversion = 3100;
}
function restorePorts() {
  Object.assign(PORTS, SAVED_PORTS);
}

const infra = require('./infra');
// 纯判定层（ADR-0056 下沉）：决策矩阵 / URL 形状解析 / 归属判定
const gate = require('../lib/infra-gate');

// ==================== 纯函数：decidePostgresGateAction 决策矩阵 ====================

const D = gate.decidePostgresGateAction;

test('decidePostgresGateAction: 远程 DB_HOST 不属自带 PG 服务范围，一律 ok', () => {
  assert.equal(
    D({ ownership: 'foreign', fullScanDone: true, isLocal: false }),
    'ok'
  );
  assert.equal(
    D({ ownership: 'foreign-deploy', fullScanDone: true, isLocal: false }),
    'ok'
  );
});

test('decidePostgresGateAction: 本部署实例 → ok（复用，不处置）', () => {
  assert.equal(
    D({ ownership: 'ours', fullScanDone: true, isLocal: true }),
    'ok'
  );
  assert.equal(
    D({ ownership: 'ours', fullScanDone: false, isLocal: true }),
    'ok'
  );
});

test('decidePostgresGateAction: 另一部署目录实例 → stop-foreign（直接停掉起本目录）', () => {
  assert.equal(
    D({ ownership: 'foreign-deploy', fullScanDone: true, isLocal: true }),
    'stop-foreign'
  );
});

test('decidePostgresGateAction: 外部实例 → relocate（永不触碰外部实例）', () => {
  for (const fullScanDone of [true, false]) {
    assert.equal(
      D({ ownership: 'foreign', fullScanDone, isLocal: true }),
      'relocate',
      `external + fullScanDone=${fullScanDone} 必须换端口`
    );
  }
});

test('decidePostgresGateAction: PID 未定位 + 全量扫描已执行 → 必属其他用户 → relocate', () => {
  assert.equal(
    D({ ownership: null, fullScanDone: true, isLocal: true }),
    'relocate'
  );
});

test('decidePostgresGateAction: PID 未定位 + 手段不足 → blocked（无法排除本部署实例）', () => {
  assert.equal(
    D({ ownership: null, fullScanDone: false, isLocal: true }),
    'blocked'
  );
});

test('decidePostgresGateAction: 归属未知（可执行文件不可读）→ blocked 不冒险', () => {
  assert.equal(
    D({ ownership: 'unknown', fullScanDone: true, isLocal: true }),
    'blocked'
  );
});

// ==================== 纯函数：rewriteDatabaseUrlPort ====================

const R = gate.rewriteDatabaseUrlPort;

test('rewriteDatabaseUrlPort: 标准 URL 只改端口段，userinfo/库名保留', () => {
  assert.equal(
    R('postgresql://postgres:pw@localhost:5432/cloudcad', 5432, 5433),
    'postgresql://postgres:pw@localhost:5433/cloudcad'
  );
});

test('rewriteDatabaseUrlPort: 无 userinfo 的 URL', () => {
  assert.equal(
    R('postgresql://localhost:5432/cloudcad', 5432, 5433),
    'postgresql://localhost:5433/cloudcad'
  );
});

test('rewriteDatabaseUrlPort: 查询参数逐字保留（sslmode 等，重组 URL 会丢失）', () => {
  assert.equal(
    R(
      'postgresql://postgres:pw@localhost:5432/cloudcad?sslmode=disable',
      5432,
      5433
    ),
    'postgresql://postgres:pw@localhost:5433/cloudcad?sslmode=disable'
  );
});

test('rewriteDatabaseUrlPort: 无端口段（隐式 5432）且 oldPort=5432 → 补上端口', () => {
  assert.equal(
    R('postgresql://postgres@localhost/cloudcad', 5432, 5433),
    'postgresql://postgres@localhost:5433/cloudcad'
  );
});

test('rewriteDatabaseUrlPort: 无端口段但 oldPort≠5432 → null（.env 不一致，不动）', () => {
  assert.equal(R('postgresql://postgres@localhost/cloudcad', 5433, 5434), null);
});

test('rewriteDatabaseUrlPort: URL 端口 ≠ oldPort → null（.env 自身不一致，不动）', () => {
  assert.equal(
    R('postgresql://postgres:pw@localhost:5433/cloudcad', 5432, 5434),
    null
  );
});

test('rewriteDatabaseUrlPort: 形状无法识别 / 空值 → null', () => {
  assert.equal(R('mysql://x:5432/db', 5432, 5433), null);
  assert.equal(R('', 5432, 5433), null);
  assert.equal(R(null, 5432, 5433), null);
});

// ==================== 纯函数：parseDatabaseUrlHostPort ====================

const P = gate.parseDatabaseUrlHostPort;

test('parseDatabaseUrlHostPort: 标准 URL → host/port/prefix/rest', () => {
  assert.deepEqual(P('postgresql://postgres:pw@localhost:5432/cloudcad'), {
    host: 'localhost',
    port: 5432,
    prefix: 'postgresql://postgres:pw@localhost',
    rest: '/cloudcad',
  });
});

test('parseDatabaseUrlHostPort: 无端口段 → 隐式 5432', () => {
  const r = P('postgresql://postgres@localhost/cloudcad');
  assert.equal(r.port, 5432);
  assert.equal(r.prefix, 'postgresql://postgres@localhost');
  assert.equal(r.rest, '/cloudcad');
});

test('parseDatabaseUrlHostPort: 查询参数归入 rest（逐字保留）', () => {
  const r = P('postgresql://postgres:pw@localhost:5432/cloudcad?sslmode=disable');
  assert.equal(r.rest, '/cloudcad?sslmode=disable');
});

test('parseDatabaseUrlHostPort: 形状无法识别 / 空值 → null', () => {
  assert.equal(P('mysql://x:5432/db'), null);
  assert.equal(P(''), null);
  assert.equal(P(null), null);
});

// ==================== 纯函数：detectPostgresOwnership ====================

const O = gate.detectPostgresOwnership;

test('detectPostgresOwnership: 无 PID → null', () => {
  assert.equal(
    O(null, {
      pgDataDir: PG_TMP,
      isOurs: () => false,
      isForeign: () => false,
      getExe: () => null,
    }),
    null
  );
});

test('detectPostgresOwnership: postmaster.pid 的 PID 匹配 → ours（最直接证据）', () => {
  const pidFile = path.join(PG_TMP, 'postmaster.pid');
  fs.writeFileSync(pidFile, '42\n', 'utf8');
  try {
    assert.equal(
      O(42, {
        pgDataDir: PG_TMP,
        isOurs: () => false,
        isForeign: () => false,
        getExe: () => null,
      }),
      'ours'
    );
  } finally {
    fs.unlinkSync(pidFile);
  }
});

test('detectPostgresOwnership: postmaster.pid 不匹配（陈旧文件）→ 落到可执行文件判定', () => {
  const pidFile = path.join(PG_TMP, 'postmaster.pid');
  fs.writeFileSync(pidFile, '42\n', 'utf8');
  try {
    assert.equal(
      O(99, {
        pgDataDir: PG_TMP,
        isOurs: () => false,
        isForeign: () => false,
        getExe: () => '/usr/lib/postgresql/15/bin/postgres',
      }),
      'foreign'
    );
  } finally {
    fs.unlinkSync(pidFile);
  }
});

test('detectPostgresOwnership: 可执行文件在本目录 runtime 下 → ours', () => {
  assert.equal(
    O(7, { pgDataDir: PG_TMP, isOurs: () => true, isForeign: () => false, getExe: () => '/x' }),
    'ours'
  );
});

test('detectPostgresOwnership: 可执行文件在另一部署目录 runtime 下 → foreign-deploy', () => {
  assert.equal(
    O(7, { pgDataDir: PG_TMP, isOurs: () => false, isForeign: () => true, getExe: () => '/x' }),
    'foreign-deploy'
  );
});

test('detectPostgresOwnership: 可执行文件可读但属外部系统 → foreign', () => {
  assert.equal(
    O(7, {
      pgDataDir: PG_TMP,
      isOurs: () => false,
      isForeign: () => false,
      getExe: () => '/usr/lib/postgresql/15/bin/postgres',
    }),
    'foreign'
  );
});

test('detectPostgresOwnership: 可执行文件不可读 → unknown', () => {
  assert.equal(
    O(7, { pgDataDir: PG_TMP, isOurs: () => false, isForeign: () => false, getExe: () => null }),
    'unknown'
  );
});

// ==================== 门禁集成：ensurePostgresPortManaged ====================

/**
 * 按 infra-redis-gate.test.js 的手法打补丁后重载 infra.js，返回被 mock 捕获的
 * 调用记录。restore() 还原所有模块导出。
 *
 * 注意：stopForeignPostgres 是 infra.js 内部函数（不跨模块边界），无法通过
 * 补丁 mock——集成测试里"停止成功"用例走真实实现，但注入一个全机不可能存在的
 * PID（999999999）：Linux 下 process.kill 抛 ESRCH（视为已停止），Windows 下
 * taskkill 返回 128（目标不存在，视为已停止），两条路径都安全且确定。
 * "停止失败"用例经 ensurePostgresPortManaged 的 deps.stopForeign 注入。
 */
function loadPgGate({
  portOpen = {},
  dbHost = 'localhost',
  envConfig = null,
  owner = { pid: 961, fullScanDone: true },
  exe = '/usr/lib/postgresql/15/bin/postgres',
  isOurs = false,
  isForeign = false,
  postmasterPid = null,
  waitReleased = true,
  updateEnvOk = true,
  credFileExists = false,
} = {}) {
  const calls = { credBackup: 0, credUpdates: null };
  const env =
    envConfig ||
    {
      DB_HOST: dbHost,
      DB_PORT: '5432',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'pw',
      DB_DATABASE: 'cloudcad',
      DATABASE_URL: `postgresql://postgres:pw@${dbHost}:5432/cloudcad`,
    };

  // postmaster.pid（本部署数据目录，已重定向到 PG_TMP）
  const pidFile = path.join(PG_TMP, 'postmaster.pid');
  if (postmasterPid != null) {
    fs.writeFileSync(pidFile, `${postmasterPid}\n`, 'utf8');
  } else if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }

  const proc = require(require.resolve('../lib/proc'));
  const prevProc = {
    detectPortOwner: proc.detectPortOwner,
    isOurRuntimeProcess: proc.isOurRuntimeProcess,
    isForeignCloudCadRuntimeProcess: proc.isForeignCloudCadRuntimeProcess,
    getProcessExecutablePath: proc.getProcessExecutablePath,
    runPm2: proc.runPm2,
    getPm2AppStatus: proc.getPm2AppStatus,
  };
  proc.detectPortOwner = () => owner;
  proc.isOurRuntimeProcess = () => isOurs;
  proc.isForeignCloudCadRuntimeProcess = () => isForeign;
  proc.getProcessExecutablePath = () => exe;
  proc.runPm2 = () => true;
  proc.getPm2AppStatus = () => 'unknown';

  const health = require(require.resolve('../lib/health'));
  const prevHealth = {
    isPortOpen: health.isPortOpen,
    waitPortReleased: health.waitPortReleased,
  };
  health.isPortOpen = async (port) => !!portOpen[port];
  health.waitPortReleased = async () => waitReleased;

  // 有状态 mock：updateEnvFile 成功后回写 envState，parseEnvFile 重读时看到
  // 更新后的值——与真实文件行为一致（repair 对齐 URL 后，relocate 重读 .env
  // 拿到的是对齐后的 URL，而非漂移的原始值）
  const envLib = require(require.resolve('../lib/env'));
  const prevParseEnvFile = envLib.parseEnvFile;
  const envState = { ...env };
  envLib.parseEnvFile = () => ({ ...envState });

  const cu = require(require.resolve('../config-updater'));
  const prevUpdateEnvFile = cu.updateEnvFile;
  const envWrites = [];
  cu.updateEnvFile = (p, updates) => {
    envWrites.push({ p, updates });
    if (updateEnvOk) Object.assign(envState, updates);
    return updateEnvOk;
  };

  const creds = require(require.resolve('../lib/credentials'));
  const prevCreds = {
    credentialFilePath: creds.credentialFilePath,
    saveCredentialBackup: creds.saveCredentialBackup,
  };
  const credPath = path.join(PG_TMP, 'DEPLOY-PASSWORDS.txt');
  if (credFileExists) {
    fs.writeFileSync(credPath, 'x', 'utf8');
  } else if (fs.existsSync(credPath)) {
    fs.unlinkSync(credPath);
  }
  creds.credentialFilePath = () => credPath;
  creds.saveCredentialBackup = (updates) => {
    calls.credBackup++;
    calls.credUpdates = updates;
    return { ok: true, path: credPath };
  };

  // lib/infra-gate 在模块加载期从 lib/proc、lib/health 解构默认依赖
  // （detectPostgresOwnership 的归属判定 / findFreePortUpFrom 的端口探测），
  // 须与 infra.js 一并重载，否则捕获的是打补丁前的真实函数
  const gatePath = require.resolve('../lib/infra-gate');
  delete require.cache[gatePath];
  const infraPath = require.resolve('./infra');
  delete require.cache[infraPath];
  // 遮蔽顶层 gate（lib/infra-gate）：此处返回的是重载后的 commands/infra 模块
  const gate = require('./infra');

  return {
    gate,
    calls,
    envWrites,
    restore() {
      proc.detectPortOwner = prevProc.detectPortOwner;
      proc.isOurRuntimeProcess = prevProc.isOurRuntimeProcess;
      proc.isForeignCloudCadRuntimeProcess =
        prevProc.isForeignCloudCadRuntimeProcess;
      proc.getProcessExecutablePath = prevProc.getProcessExecutablePath;
      proc.runPm2 = prevProc.runPm2;
      proc.getPm2AppStatus = prevProc.getPm2AppStatus;
      health.isPortOpen = prevHealth.isPortOpen;
      health.waitPortReleased = prevHealth.waitPortReleased;
      envLib.parseEnvFile = prevParseEnvFile;
      cu.updateEnvFile = prevUpdateEnvFile;
      creds.credentialFilePath = prevCreds.credentialFilePath;
      creds.saveCredentialBackup = prevCreds.saveCredentialBackup;
    },
  };
}

test('门禁：端口空闲 → ok，零写入', async () => {
  const g = loadPgGate({ portOpen: {} });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'ok');
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.postgresql, 5432);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：远程 DB_HOST → ok（自带 PG 不服务远程库，连不上由迁移步骤上报）', async () => {
  const g = loadPgGate({ portOpen: { 5432: true }, dbHost: '10.0.0.5' });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'ok');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：外部实例（系统 PG）→ 换端口，不停不采纳，.env 的 DB_PORT+DATABASE_URL 成对改写', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 961, fullScanDone: true },
    exe: '/usr/lib/postgresql/15/bin/postgres',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'relocated');
    assert.deepEqual(g.envWrites, [
      {
        p: BACKEND_ENV_PATH,
        updates: {
          DB_PORT: '5433',
          DATABASE_URL: 'postgresql://postgres:pw@localhost:5433/cloudcad',
        },
      },
    ]);
    assert.equal(PORTS.postgresql, 5433);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：PID 未定位但全量扫描已执行 → 必属其他用户 → 换端口', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: null, fullScanDone: true },
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'relocated');
    assert.deepEqual(g.envWrites, [
      {
        p: BACKEND_ENV_PATH,
        updates: {
          DB_PORT: '5433',
          DATABASE_URL: 'postgresql://postgres:pw@localhost:5433/cloudcad',
        },
      },
    ]);
    assert.equal(PORTS.postgresql, 5433);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：换端口跳过已占用端口（5433 被占 → 5434）', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true, 5433: true },
    owner: { pid: 961, fullScanDone: true },
    exe: '/usr/lib/postgresql/15/bin/postgres',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'relocated');
    assert.deepEqual(g.envWrites, [
      {
        p: BACKEND_ENV_PATH,
        updates: {
          DB_PORT: '5434',
          DATABASE_URL: 'postgresql://postgres:pw@localhost:5434/cloudcad',
        },
      },
    ]);
    assert.equal(PORTS.postgresql, 5434);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：范围内无空闲端口 → blocked 且内存 PORTS 不变', async () => {
  const portOpen = { 5432: true };
  for (let p = 5433; p <= 5432 + 100; p++) portOpen[p] = true;
  const g = loadPgGate({
    portOpen,
    owner: { pid: 961, fullScanDone: true },
    exe: '/usr/lib/postgresql/15/bin/postgres',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.postgresql, 5432);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：换端口落盘失败 → blocked 且内存 PORTS 不变（否则前后端端口漂移）', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 961, fullScanDone: true },
    exe: '/usr/lib/postgresql/15/bin/postgres',
    updateEnvOk: false,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'blocked');
    assert.equal(PORTS.postgresql, 5432);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：URL 端口漂移 + 端口被外部实例占用 → 先自动对齐再换端口（用户 VM 实锤的 split-brain 恢复）', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 961, fullScanDone: true },
    exe: '/usr/lib/postgresql/15/bin/postgres',
    envConfig: {
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'pw',
      DB_DATABASE: 'cloudcad',
      DATABASE_URL: 'postgresql://postgres:pw@localhost:5433/cloudcad',
    },
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'relocated');
    assert.deepEqual(g.envWrites, [
      {
        p: BACKEND_ENV_PATH,
        updates: {
          DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/cloudcad',
        },
      },
      {
        p: BACKEND_ENV_PATH,
        updates: {
          DB_PORT: '5433',
          DATABASE_URL: 'postgresql://postgres:pw@localhost:5433/cloudcad',
        },
      },
    ]);
    assert.equal(PORTS.postgresql, 5433);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：另一部署目录实例 → 直接停掉（stop-foreign），不换端口、不写 .env', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 999999999, fullScanDone: true },
    isForeign: true,
    exe: '/other/root/runtime/linux/postgres/bin/postgres',
    waitReleased: true,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'stopped-foreign');
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.postgresql, 5432);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：另一部署目录实例停止信号未确认 → blocked', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 961, fullScanDone: true },
    isForeign: true,
    exe: '/other/root/runtime/linux/postgres/bin/postgres',
  });
  resetPorts();
  try {
    assert.equal(
      await g.gate.ensurePostgresPortManaged({ stopForeign: () => false }),
      'blocked'
    );
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：另一部署目录实例停止后端口未释放 → blocked', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 999999999, fullScanDone: true },
    isForeign: true,
    exe: '/other/root/runtime/linux/postgres/bin/postgres',
    waitReleased: false,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：本部署实例（postmaster.pid 匹配）→ ok 复用，零写入', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 42, fullScanDone: true },
    postmasterPid: 42,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'ok');
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.postgresql, 5432);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：PID 未定位且手段不足（!fullScanDone）→ blocked（无法排除本部署实例）', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: null, fullScanDone: false },
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：归属未知（可执行文件不可读）→ blocked 不冒险', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 961, fullScanDone: true },
    exe: null,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：换端口后凭据备份存在则刷新（含新端口）', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 961, fullScanDone: true },
    exe: '/usr/lib/postgresql/15/bin/postgres',
    credFileExists: true,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'relocated');
    assert.equal(g.calls.credBackup, 1);
    assert.equal(g.calls.credUpdates.DB_PORT, '5433');
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：凭据备份已被用户删除 → 换端口但不重建该文件', async () => {
  const g = loadPgGate({
    portOpen: { 5432: true },
    owner: { pid: 961, fullScanDone: true },
    exe: '/usr/lib/postgresql/15/bin/postgres',
    credFileExists: false,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'relocated');
    assert.equal(g.calls.credBackup, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

// ==================== 门禁：DATABASE_URL ↔ DB_PORT 一致性修复 ====================
// 用户 VM 实锤（2026-10）：DB_PORT=5433 而 DATABASE_URL 仍 5432——pg_dump/建库
// 读 DB_PORT（成功），Prisma 优先读 DATABASE_URL（连到 5432 的系统库 → P1000）。
// 修复在所有本机场景执行（含"端口空闲"提前返回路径），漂移自动对齐。

test('门禁：URL 端口漂移（DB_PORT=5433、URL 仍 5432）→ 自动对齐，本部署实例复用', async () => {
  const g = loadPgGate({
    portOpen: { 5433: true },
    owner: { pid: 42, fullScanDone: true },
    postmasterPid: 42,
    envConfig: {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'pw',
      DB_DATABASE: 'cloudcad',
      DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/cloudcad',
    },
  });
  resetPorts();
  PORTS.postgresql = 5433;
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'ok');
    assert.deepEqual(g.envWrites, [
      {
        p: BACKEND_ENV_PATH,
        updates: {
          DATABASE_URL: 'postgresql://postgres:pw@localhost:5433/cloudcad',
        },
      },
    ]);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：端口空闲但 URL 漂移 → 仍修复（覆盖"端口空闲"提前返回路径）', async () => {
  const g = loadPgGate({
    portOpen: {},
    envConfig: {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'pw',
      DB_DATABASE: 'cloudcad',
      DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/cloudcad',
    },
  });
  resetPorts();
  PORTS.postgresql = 5433;
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'ok');
    assert.deepEqual(g.envWrites, [
      {
        p: BACKEND_ENV_PATH,
        updates: {
          DATABASE_URL: 'postgresql://postgres:pw@localhost:5433/cloudcad',
        },
      },
    ]);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：URL 主机与 DB_HOST 指向不同机器 → blocked（真实冲突，不猜）', async () => {
  const g = loadPgGate({
    portOpen: {},
    envConfig: {
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'pw',
      DB_DATABASE: 'cloudcad',
      DATABASE_URL: 'postgresql://postgres:pw@10.0.0.5:5432/cloudcad',
    },
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：URL 主机 127.0.0.1 与 DB_HOST localhost 等价 → 只对齐端口', async () => {
  const g = loadPgGate({
    portOpen: {},
    envConfig: {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'pw',
      DB_DATABASE: 'cloudcad',
      DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:5432/cloudcad',
    },
  });
  resetPorts();
  PORTS.postgresql = 5433;
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'ok');
    assert.deepEqual(g.envWrites, [
      {
        p: BACKEND_ENV_PATH,
        updates: {
          DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:5433/cloudcad',
        },
      },
    ]);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：URL 与 DB_PORT 已一致 → 零写入', async () => {
  const g = loadPgGate({ portOpen: {} });
  resetPorts();
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'ok');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：DATABASE_URL 缺失 → ok（Prisma CLI / 后端回落 DB_* 部件跟随 DB_PORT）', async () => {
  const g = loadPgGate({
    portOpen: {},
    envConfig: {
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'pw',
      DB_DATABASE: 'cloudcad',
    },
  });
  resetPorts();
  PORTS.postgresql = 5433;
  try {
    assert.equal(await g.gate.ensurePostgresPortManaged(), 'ok');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});
