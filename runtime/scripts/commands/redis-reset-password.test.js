/**
 * redis-reset-password 单元测试
 *
 * node --test runtime/scripts/commands/redis-reset-password.test.js
 *
 * 只测纯函数与「注入 IO 缝后的决策树」——不测真实 RESP/PM2（需真实 Redis/PM2，
 * 归集成环境与端到端净零验证）。重点是与 db-reset-password 一致的安全性质：
 *   AUTH 验证通过之前绝不写 .env（服务端与账本不得分叉）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  redisResetPassword,
  restartRegistered,
} = require('./redis-reset-password');

// OLD 需满足口令策略（≥10 位、三类），否则「与旧密码相同」的用例会被策略拦截
const OLD = 'old-rp-pass1';
const NEW = 'NewRp12345';

// ==================== restartRegistered ====================

test('restartRegistered 跳过未注册 app，并区分成功/失败/跳过', () => {
  const statusOf = (n) => ({ redis: 'online', backend: 'online', conversion: 'unknown' }[n]);
  const restart = () => true;
  const res = restartRegistered(['redis', 'backend', 'conversion'], statusOf, restart);
  assert.deepEqual(res.done, ['redis', 'backend']);
  assert.deepEqual(res.failed, []);
  assert.deepEqual(res.skipped, ['conversion']);
});

test('restartRegistered 按给定顺序重启，失败不中断后续', () => {
  const order = [];
  const res = restartRegistered(
    ['redis', 'backend', 'conversion'],
    () => 'online',
    (args) => {
      order.push(args.join(' '));
      return args[1] !== 'backend';
    }
  );
  assert.deepEqual(order, ['restart redis', 'restart backend', 'restart conversion']);
  assert.deepEqual(res.done, ['redis', 'conversion']);
  assert.deepEqual(res.failed, ['backend']);
  assert.deepEqual(res.skipped, []);
});

test('restartRegistered 全部未注册：什么都不重启', () => {
  const res = restartRegistered(['redis', 'backend', 'conversion'], () => 'unknown');
  assert.deepEqual(res.done, []);
  assert.deepEqual(res.failed, []);
  assert.deepEqual(res.skipped, ['redis', 'backend', 'conversion']);
});

// ==================== 决策树（注入 IO 缝） ====================

/**
 * 构造注入缝。
 * @param {{
 *   env?: object,
 *   portOpen?: boolean,
 *   setPasswordOk?: boolean,
 *   verifyState?: string,
 *   oldState?: string,
 *   persistOk?: boolean,
 *   auditor?: string,
 * }} [o]
 */
function makeDeps(o = {}) {
  const {
    env = {},
    portOpen = true,
    setPasswordOk = true,
    verifyState = 'ok',
    oldState = 'ok',
    persistOk = true,
    auditor = 'admin-1',
  } = o;

  const calls = {
    setPassword: 0,
    setPasswordWith: undefined,
    probes: [],
    persist: 0,
    audit: 0,
    generated: 0,
    restart: [],
  };
  const envWrites = [];

  const deps = {
    envPath: '/tmp/not-real.env',
    parseEnv: () => ({
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: OLD,
      ...env,
    }),
    updateEnv: (_p, updates) => {
      envWrites.push(updates);
    },
    audit: () => {
      calls.audit += 1;
      return { ok: true, stdout: '' };
    },
    getAuditor: () => auditor,
    portOpen: async () => portOpen,
    probe: async (_h, _p, pwd) => {
      calls.probes.push(pwd);
      // 旧口令按 oldState 返回（用于「改密被拒」时的原因分类）；新口令按 verifyState
      return { state: pwd === OLD ? oldState : verifyState, reason: '' };
    },
    setPassword: async (_h, _p, pwd) => {
      calls.setPassword += 1;
      calls.setPasswordWith = pwd;
      return setPasswordOk ? { ok: true, reason: '' } : { ok: false, reason: 'NOAUTH' };
    },
    persist: async () => {
      calls.persist += 1;
      return persistOk ? { ok: true, reason: '' } : { ok: false, reason: 'no config file' };
    },
    doRestart: (names) => {
      calls.restart.push(names);
      return { done: [...names], failed: [], skipped: [] };
    },
    generatePassword: () => {
      calls.generated += 1;
      return NEW;
    },
    resolveLimit: () => 10,
  };

  return { deps, calls, envWrites };
}

test('.env 不可读：干净失败，不触碰实例', async () => {
  const calls = [];
  const res = await redisResetPassword(
    { confirmed: true },
    {
      parseEnv: () => {
        throw new Error('ENOENT');
      },
      setPassword: async () => calls.push(1),
    }
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /无法读取/);
  assert.equal(calls.length, 0);
});

test('实例未监听：中止，绝不尝试改密', async () => {
  const { deps, calls, envWrites } = makeDeps({ portOpen: false });
  const res = await redisResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /未监听/);
  assert.equal(calls.setPassword, 0);
  assert.equal(envWrites.length, 0);
});

test('策略不达标：中止，不触碰实例、不写 .env', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await redisResetPassword(
    { confirmed: true, password: 'abcdefgh12' }, // 仅两类字符
    deps
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /不符合策略/);
  assert.equal(calls.setPassword, 0);
  assert.equal(envWrites.length, 0);
});

test('密码为空：中止（后端对 REDIS_PASSWORD 是生产 fail-fast）', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await redisResetPassword(
    { confirmed: true, password: '' },
    { ...deps, generatePassword: () => '' }
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /不能为空/);
  assert.equal(calls.setPassword, 0);
  assert.equal(envWrites.length, 0);
});

test('新密码与当前密码相同：中止', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await redisResetPassword({ confirmed: true, password: OLD }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /相同/);
  assert.equal(calls.setPassword, 0);
  assert.equal(envWrites.length, 0);
});

test('CONFIG SET 被拒：回读旧口令给出原因，且不写 .env', async () => {
  const { deps, calls, envWrites } = makeDeps({ setPasswordOk: false });
  const res = await redisResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /改密失败/);
  assert.match(res.message, /旧密码仍有效/);
  assert.equal(calls.probes.length, 1);
  assert.equal(calls.probes[0], OLD, '用旧口令探活以判定是预存不一致还是被实例拒绝');
  assert.equal(envWrites.length, 0);
  assert.equal(calls.audit, 0);
  assert.equal(calls.restart.length, 0);
});

test('CONFIG SET 被拒 + 旧口令也已失效：说明实例密码此前已漂移', async () => {
  const { deps, calls, envWrites } = makeDeps({
    setPasswordOk: false,
    oldState: 'wrongpass',
  });
  const res = await redisResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /已与此前不同/);
  assert.equal(envWrites.length, 0);
});

test('AUTH 验证失败：绝不写 .env（核心安全性质）', async () => {
  const { deps, calls, envWrites } = makeDeps({ verifyState: 'wrongpass' });
  const res = await redisResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /验证失败/);
  assert.match(res.message, /\.env 未更新/);
  assert.equal(envWrites.length, 0, '这是「绝不漂移」的核心断言');
  assert.equal(calls.persist, 0);
  assert.equal(calls.audit, 0);
  assert.equal(calls.restart.length, 0);
});

test('成功路径：改密 → AUTH 验证 → 写 .env → 持久化 → 审计 → 按序重启', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await redisResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, true);
  assert.equal(res.password, NEW);

  assert.equal(calls.setPassword, 1);
  assert.equal(calls.probes.length, 1);
  assert.equal(calls.probes[0], NEW, '验证用的是新口令');

  assert.equal(envWrites.length, 1);
  assert.deepEqual(envWrites[0], { REDIS_PASSWORD: NEW });

  assert.equal(calls.persist, 1);
  assert.equal(calls.audit, 1);
  assert.deepEqual(calls.restart, [
    ['redis', 'backend', 'conversion'],
  ]);
});

test('--no-restart：其余步骤照做，但不重启', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await redisResetPassword({ confirmed: true, restart: false }, deps);
  assert.equal(res.ok, true);
  assert.equal(envWrites.length, 1);
  assert.equal(calls.audit, 1);
  assert.equal(calls.restart.length, 0);
  assert.match(res.message, /未重启/);
});

test('CONFIG REWRITE 失败不算错：仍判定成功并提示下次重启自愈', async () => {
  const { deps, calls, envWrites } = makeDeps({ persistOk: false });
  const res = await redisResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, true);
  assert.equal(envWrites.length, 1);
  assert.equal(calls.audit, 1);
});

test('审计归属缺失：跳过审计但不改变成功结果', async () => {
  const { deps, calls, envWrites } = makeDeps({ auditor: '' });
  const res = await redisResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, true);
  assert.equal(envWrites.length, 1);
  assert.equal(calls.audit, 0);
  assert.match(res.message, /审计跳过/);
});

test('审计失败：不改变成功结果，仅附告警', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await redisResetPassword(
    { confirmed: true },
    { ...deps, audit: () => ({ ok: false, stdout: '', stderr: 'enum violation' }) }
  );
  assert.equal(res.ok, true);
  assert.equal(envWrites.length, 1);
  assert.match(res.message, /审计写入失败/);
});

// ==================== interactive 分支（交互菜单与 CLI --interactive 的入口） ====================

/**
 * 构造交互输入缝：返回交互式提示被采用的口令；记录是否真的走了交互提示
 * （交互提示从不返回空白——空白在内部已回退自动生成，见 admin-reset-password.test.js）。
 */
function interactiveDeps(password, o = {}) {
  const { deps, calls, envWrites } = makeDeps(o);
  let prompted = 0;
  const wrapped = {
    ...deps,
    // 交互提示被调用的次数挂在 deps 上（0 = 走了别的分支）
    get prompted() {
      return prompted;
    },
    promptInteractivePassword: async () => {
      prompted += 1;
      return { ok: true, password };
    },
    promptNewPassword: async () => password,
  };
  return { deps: wrapped, calls, envWrites };
}

test('interactive：采用交互输入的口令，不走自动生成，改密与账本都用该口令', async () => {
  const { deps, calls, envWrites } = interactiveDeps('Typed-Rp1234');
  const res = await redisResetPassword({ confirmed: true, interactive: true }, deps);
  assert.equal(res.ok, true);
  assert.equal(res.password, 'Typed-Rp1234');
  assert.equal(deps.prompted, 1, '必须真的走交互提示');
  assert.equal(calls.generated, 0, '交互路径不得回落自动生成');
  assert.equal(calls.setPasswordWith, 'Typed-Rp1234', 'CONFIG SET 用的是输入口令');
  assert.deepEqual(envWrites[0], { REDIS_PASSWORD: 'Typed-Rp1234' });
});

test('interactive：输入的弱口令同样过不了策略闸门', async () => {
  const { deps, calls, envWrites } = interactiveDeps('abcdefgh12');
  const res = await redisResetPassword({ confirmed: true, interactive: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /不符合策略/);
  assert.equal(calls.setPassword, 0);
  assert.equal(envWrites.length, 0);
});

test('interactive：输成当前口令仍被拦（与指定口令同判据）', async () => {
  const { deps, calls, envWrites } = interactiveDeps(OLD);
  const res = await redisResetPassword({ confirmed: true, interactive: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /相同/);
  assert.equal(calls.setPassword, 0);
  assert.equal(envWrites.length, 0);
});

test('interactive：同时给了指定密码时，指定优先、不触发交互提示', async () => {
  const { deps, calls, envWrites } = interactiveDeps('Typed-Rp1234');
  const res = await redisResetPassword(
    { confirmed: true, interactive: true, password: 'Spec-Rp1234' },
    deps
  );
  assert.equal(res.ok, true);
  assert.equal(res.password, 'Spec-Rp1234');
  assert.equal(deps.prompted, 0, '已显式给口令时无需再问用户');
  assert.deepEqual(envWrites[0], { REDIS_PASSWORD: 'Spec-Rp1234' });
});
