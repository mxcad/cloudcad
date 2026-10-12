/**
 * redis 密码门禁（ensureRedisPasswordManaged）处置矩阵回归测试（node:test，0 外部依赖）
 *
 * 回归背景（2026-10）：旧门禁对"外部实例"（系统装的 redis / 其他用户进程）的处置是
 * 设密/停掉/采纳——会修改甚至停掉用户机器上的系统服务；且 PID 定位不到时（非 root
 * 下 ss 看不到其他用户进程的 pid=，lsof/netstat 未安装）无差别 blocked 中止部署
 * （用户 VM 实例：系统 redis 占 6379，部署以普通用户运行，部署中止）。
 *
 * 新策略锁定的行为：
 *  1. 本部署实例：密码正确→复用；无密码→运行中设密（configured）；
 *     不一致/未知→停止重拉（taken-over）；停止后端口未释放→blocked；
 *  2. 外部实例（任何认证状态）：一律不碰（不停、不改密、不采纳）→ 自带 redis
 *     自动换到空闲端口并改写 .env 的 REDIS_PORT（relocated）；
 *  3. PID 无法定位但全量扫描已执行（fullScanDone）→ 必属其他用户 → 换端口；
 *     手段不足（!fullScanDone）→ blocked（无法排除是本部署实例，防共写 --dir）；
 *  4. 远程 REDIS_HOST：密码正确→复用，否则 blocked（远程实例无法自动处置）；
 *  5. 换端口落盘失败 / 无空闲端口 → blocked 且内存 PORTS 不变。
 *
 * mock 手法（同 infra-reconcile.test.js）：infra.js 在模块加载期从 lib/proc、
 * lib/health、lib/redis-takeover、config-updater 解构导出，故必须在 require('./infra')
 * 之前打补丁并删除其缓存条目；补丁在 require 之后立即还原（解构已捕获 mock）。
 *
 * 运行：node --test runtime/scripts/commands/infra-redis-gate.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { PORTS, BACKEND_ENV_PATH } = require('../lib/context');

// 内存 PORTS 是共享对象：relocate 会改写 PORTS.redis。每个用例前重置为已知
// 默认值（排除 dev .env 的干扰），用例后还原，避免跨用例/跨文件污染。
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

// ==================== 纯函数：decideRedisGateAction 决策矩阵 ====================

const infra = require('./infra');
// 纯判定层（ADR-0056 下沉）：决策矩阵 / 空闲端口扫描 / 本机主机判定
const gate = require('../lib/infra-gate');
const D = gate.decideRedisGateAction;

test('decideRedisGateAction: 远程实例只有密码正确可复用，其余一律 blocked', () => {
  assert.equal(
    D({
      probeState: 'ok',
      ownership: null,
      fullScanDone: false,
      isLocal: false,
    }),
    'ok'
  );
  assert.equal(
    D({
      probeState: 'wrongpass',
      ownership: null,
      fullScanDone: true,
      isLocal: false,
    }),
    'blocked'
  );
  assert.equal(
    D({
      probeState: 'noauth',
      ownership: null,
      fullScanDone: true,
      isLocal: false,
    }),
    'blocked'
  );
});

test('decideRedisGateAction: 本部署实例按认证状态分派（复用/设密/停拉）', () => {
  const base = { ownership: 'ours', fullScanDone: true, isLocal: true };
  assert.equal(D({ ...base, probeState: 'ok' }), 'ok');
  assert.equal(D({ ...base, probeState: 'noauth' }), 'fix-ours');
  assert.equal(D({ ...base, probeState: 'wrongpass' }), 'takeover-ours');
  assert.equal(D({ ...base, probeState: 'unknown' }), 'takeover-ours');
});

test('decideRedisGateAction: 外部实例任何认证状态都换端口（不碰外部实例）', () => {
  const base = { ownership: 'foreign', isLocal: true };
  for (const probeState of ['ok', 'noauth', 'wrongpass', 'unknown']) {
    for (const fullScanDone of [true, false]) {
      assert.equal(
        D({ ...base, probeState, fullScanDone }),
        'relocate',
        `external + ${probeState} + fullScanDone=${fullScanDone} 必须换端口`
      );
    }
  }
});

test('decideRedisGateAction: PID 未定位时按 fullScanDone 区分换端口/中止', () => {
  const base = { probeState: 'wrongpass', ownership: null, isLocal: true };
  assert.equal(D({ ...base, fullScanDone: true }), 'relocate');
  assert.equal(D({ ...base, fullScanDone: false }), 'blocked');
});

test('decideRedisGateAction: 归属未知（PID 在但 cmdline 不可读）→ blocked 不冒险', () => {
  assert.equal(
    D({
      probeState: 'wrongpass',
      ownership: 'unknown',
      fullScanDone: true,
      isLocal: true,
    }),
    'blocked'
  );
});

// ==================== 纯函数：findFreePortUpFrom / isLocalHost ====================

test('findFreePortUpFrom: 跳过占用端口，返回第一个空闲端口', async () => {
  assert.equal(
    await gate.findFreePortUpFrom(6380, {
      isPortOpen: async (p) => p === 6380,
    }),
    6381
  );
  assert.equal(
    await gate.findFreePortUpFrom(6380, { isPortOpen: async () => false }),
    6380
  );
});

test('findFreePortUpFrom: 排除集合与尝试上限/端口边界', async () => {
  assert.equal(
    await gate.findFreePortUpFrom(6380, {
      isPortOpen: async (p) => p !== 6382,
      exclude: new Set([6381]),
    }),
    6382
  );
  assert.equal(
    await gate.findFreePortUpFrom(6380, {
      isPortOpen: async () => true,
      maxTries: 3,
    }),
    null
  );
  assert.equal(
    await gate.findFreePortUpFrom(65535, {
      isPortOpen: async () => true,
      maxTries: 5,
    }),
    null
  );
});

test('isLocalHost: 本机形态识别（大小写/空值回落）', () => {
  assert.equal(gate.isLocalHost('127.0.0.1'), true);
  assert.equal(gate.isLocalHost('localhost'), true);
  assert.equal(gate.isLocalHost('LOCALHOST'), true);
  assert.equal(gate.isLocalHost('::1'), true);
  assert.equal(gate.isLocalHost(''), true);
  assert.equal(gate.isLocalHost('10.0.0.5'), false);
  assert.equal(gate.isLocalHost('redis.internal'), false);
});

// ==================== 门禁集成：ensureRedisPasswordManaged ====================

/**
 * 按 infra-reconcile.test.js 的手法打补丁后重载 infra.js，返回被 mock 捕获的
 * 实例与调用记录。restore() 还原所有模块导出。
 */
function loadGate({
  portOpen = {},
  probeStates = ['wrongpass'],
  password = 'testpass',
  host = '127.0.0.1',
  owner = { pid: 961, fullScanDone: true },
  ownership = 'foreign',
  setResults = [{ ok: true, reason: '' }],
  persistResults = [{ ok: true, reason: '' }],
  stopOk = true,
  waitReleased = true,
  updateEnvOk = true,
} = {}) {
  const calls = { set: 0, persist: 0, stop: 0 };

  const proc = require(require.resolve('../lib/proc'));
  const prevProc = {
    detectPortOwner: proc.detectPortOwner,
    getPm2AppStatus: proc.getPm2AppStatus,
    runPm2: proc.runPm2,
  };
  proc.detectPortOwner = () => owner;
  proc.getPm2AppStatus = () => 'unknown';
  proc.runPm2 = () => true;

  const health = require(require.resolve('../lib/health'));
  const prevHealth = {
    isPortOpen: health.isPortOpen,
    waitPortReleased: health.waitPortReleased,
  };
  health.isPortOpen = async (port) => !!portOpen[port];
  health.waitPortReleased = async () => waitReleased;

  const rt = require(require.resolve('../lib/redis-takeover'));
  const prevRt = {
    loadRedisPassword: rt.loadRedisPassword,
    loadRedisHost: rt.loadRedisHost,
    probeRedisAuth: rt.probeRedisAuth,
    setRedisPasswordAtRuntime: rt.setRedisPasswordAtRuntime,
    persistRedisConfig: rt.persistRedisConfig,
    stopRedisProcess: rt.stopRedisProcess,
    detectRedisOwnership: rt.detectRedisOwnership,
  };
  rt.loadRedisPassword = () => password;
  rt.loadRedisHost = () => host;
  rt.probeRedisAuth = async () => {
    const s = probeStates.shift() || 'ok';
    return typeof s === 'string' ? { state: s, reason: '' } : s;
  };
  rt.setRedisPasswordAtRuntime = async () => {
    calls.set++;
    return setResults.shift() || { ok: true, reason: '' };
  };
  rt.persistRedisConfig = async () => {
    calls.persist++;
    return persistResults.shift() || { ok: true, reason: '' };
  };
  rt.stopRedisProcess = () => {
    calls.stop++;
    return stopOk;
  };
  rt.detectRedisOwnership = () => ownership;

  const cu = require(require.resolve('../config-updater'));
  const prevUpdateEnvFile = cu.updateEnvFile;
  const envWrites = [];
  cu.updateEnvFile = (p, updates) => {
    envWrites.push({ p, updates });
    return updateEnvOk;
  };

  const infraPath = require.resolve('./infra');
  delete require.cache[infraPath];
  const gate = require('./infra');

  return {
    gate,
    calls,
    envWrites,
    restore() {
      proc.detectPortOwner = prevProc.detectPortOwner;
      proc.getPm2AppStatus = prevProc.getPm2AppStatus;
      proc.runPm2 = prevProc.runPm2;
      health.isPortOpen = prevHealth.isPortOpen;
      health.waitPortReleased = prevHealth.waitPortReleased;
      rt.loadRedisPassword = prevRt.loadRedisPassword;
      rt.loadRedisHost = prevRt.loadRedisHost;
      rt.probeRedisAuth = prevRt.probeRedisAuth;
      rt.setRedisPasswordAtRuntime = prevRt.setRedisPasswordAtRuntime;
      rt.persistRedisConfig = prevRt.persistRedisConfig;
      rt.stopRedisProcess = prevRt.stopRedisProcess;
      rt.detectRedisOwnership = prevRt.detectRedisOwnership;
      cu.updateEnvFile = prevUpdateEnvFile;
    },
  };
}

test('门禁：端口空闲 → ok，零写入', async () => {
  const g = loadGate({ portOpen: {} });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'ok');
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.redis, 6379);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：.env 无密码 → ok（跳过校验，由后端生产配置校验兜底）', async () => {
  const g = loadGate({ password: null });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'ok');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：外部实例（wrongpass）→ 换端口，不停不改密，.env 与内存 PORTS 同步更新', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['wrongpass'],
    owner: { pid: 961, fullScanDone: true },
    ownership: 'foreign',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'relocated');
    assert.deepEqual(g.envWrites, [
      { p: BACKEND_ENV_PATH, updates: { REDIS_PORT: '6380' } },
    ]);
    assert.equal(PORTS.redis, 6380);
    assert.equal(g.calls.set, 0, '外部实例不得运行中改密');
    assert.equal(g.calls.stop, 0, '外部实例不得被停止');
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：外部实例（noauth）→ 换端口而非 CONFIG SET（不碰系统 redis 配置）', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['noauth'],
    owner: { pid: 961, fullScanDone: true },
    ownership: 'foreign',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'relocated');
    assert.equal(g.calls.set, 0, '外部无密码实例也不得 CONFIG SET');
    assert.equal(g.calls.persist, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：换端口跳过已占用端口（6380 被占 → 6381）', async () => {
  const g = loadGate({
    portOpen: { 6379: true, 6380: true },
    probeStates: ['wrongpass'],
    owner: { pid: 961, fullScanDone: true },
    ownership: 'foreign',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'relocated');
    assert.deepEqual(g.envWrites, [
      { p: BACKEND_ENV_PATH, updates: { REDIS_PORT: '6381' } },
    ]);
    assert.equal(PORTS.redis, 6381);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：换端口落盘失败 → blocked 且内存 PORTS 不变', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['wrongpass'],
    owner: { pid: 961, fullScanDone: true },
    ownership: 'foreign',
    updateEnvOk: false,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'blocked');
    assert.equal(
      PORTS.redis,
      6379,
      '落盘失败不得更新内存端口（否则前后端端口漂移）'
    );
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：范围内无空闲端口 → blocked', async () => {
  const portOpen = { 6379: true };
  for (let p = 6380; p <= 6379 + 100; p++) portOpen[p] = true;
  const g = loadGate({
    portOpen,
    probeStates: ['wrongpass'],
    owner: { pid: 961, fullScanDone: true },
    ownership: 'foreign',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.redis, 6379);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：本部署无密码实例 → 运行中设密（configured），不写 .env 端口', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['noauth', 'ok'],
    owner: { pid: 42, fullScanDone: true },
    ownership: 'ours',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'configured');
    assert.equal(g.calls.set, 1);
    assert.equal(g.calls.persist, 1);
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.redis, 6379);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：本部署实例密码不一致 → 停止重拉（taken-over）', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['wrongpass'],
    owner: { pid: 42, fullScanDone: true },
    ownership: 'ours',
    waitReleased: true,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'taken-over');
    assert.equal(g.calls.stop, 1);
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.redis, 6379);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：本部署实例停止后端口未释放 → blocked（不得换端口，防共写 --dir）', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['wrongpass'],
    owner: { pid: 42, fullScanDone: true },
    ownership: 'ours',
    waitReleased: false,
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
    assert.equal(PORTS.redis, 6379);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：PID 未定位且手段不足（!fullScanDone）→ blocked（无法排除本部署实例）', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['wrongpass'],
    owner: { pid: null, fullScanDone: false },
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：PID 未定位但全量扫描已执行 → 必属其他用户 → 换端口', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['wrongpass'],
    owner: { pid: null, fullScanDone: true },
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'relocated');
    assert.deepEqual(g.envWrites, [
      { p: BACKEND_ENV_PATH, updates: { REDIS_PORT: '6380' } },
    ]);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：远程实例密码正确 → ok 原样复用', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['ok'],
    host: '10.0.0.5',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'ok');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});

test('门禁：远程实例密码不一致 → blocked（远程实例无法自动处置）', async () => {
  const g = loadGate({
    portOpen: { 6379: true },
    probeStates: ['wrongpass'],
    host: '10.0.0.5',
  });
  resetPorts();
  try {
    assert.equal(await g.gate.ensureRedisPasswordManaged(), 'blocked');
    assert.equal(g.envWrites.length, 0);
  } finally {
    g.restore();
    restorePorts();
  }
});
