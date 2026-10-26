/**
 * db-reset-password 单元测试
 *
 * node --test runtime/scripts/commands/db-reset-password.test.js
 *
 * 只测纯函数与「注入 IO 缝后的决策树」——不测真实 psql/PM2（需真实 PG/PM2，
 * 归集成环境与端到端净零验证）。重点是安全性质：
 *   1. 新密码回连验证通过之前绝不写 .env（服务端与账本不得分叉）；
 *   2. 验证失败时必须尝试回滚，且回滚与「是否写 .env」的判定彼此独立。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  dbResetPassword,
  buildDatabaseUrl,
  isConnectVerified,
} = require('./db-reset-password');

const ENV = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'postgres',
  DB_DATABASE: 'cloudcad',
  DB_PASSWORD: 'old-pass-1',
};

// ==================== buildDatabaseUrl ====================

test('buildDatabaseUrl 编码 # —— 否则会被当成 URL 片段静默截断', () => {
  assert.equal(
    buildDatabaseUrl('postgres', 'a#b', 'localhost', '5432', 'cloudcad'),
    'postgresql://postgres:a%23b@localhost:5432/cloudcad'
  );
});

test('buildDatabaseUrl 编码 URL 保留字符（$ & / + @）', () => {
  assert.equal(
    buildDatabaseUrl('u', 'a$b&c/d+e@f', 'h', '5432', 'd'),
    'postgresql://u:a%24b%26c%2Fd%2Be%40f@h:5432/d'
  );
});

test('buildDatabaseUrl 保留 URL 结构，不改用户名/主机/端口/库名', () => {
  assert.equal(
    buildDatabaseUrl('app', 'plain', '10.0.0.5', '15432', 'cad'),
    'postgresql://app:plain@10.0.0.5:15432/cad'
  );
});

// ==================== isConnectVerified ====================

test('isConnectVerified 只认 ok 且 stdout 恰为 "1"', () => {
  assert.equal(isConnectVerified({ ok: true, stdout: '1' }), true);
  assert.equal(isConnectVerified({ ok: true, stdout: '1\n' }), false);
  assert.equal(isConnectVerified({ ok: true, stdout: '' }), false);
  assert.equal(isConnectVerified({ ok: false, stdout: '1' }), false);
  assert.equal(isConnectVerified(undefined), false);
  assert.equal(isConnectVerified(null), false);
});

// ==================== 决策树（注入 IO 缝） ====================

/**
 * 构造注入缝。
 * @param {{alterOk?: boolean, verifyOk?: boolean, rollbackOk?: boolean}} [o]
 */
function makeDeps(o = {}) {
  const { alterOk = true, verifyOk = true, rollbackOk = true } = o;
  const calls = { alter: 0, verify: 0, rollback: 0, audit: 0, generated: 0, restart: [] };
  const envWrites = [];

  const deps = {
    envPath: '/tmp/not-real.env',
    parseEnv: () => ({ ...ENV }),
    updateEnv: (_p, updates) => {
      envWrites.push(updates);
    },
    run: (sql, opts = {}) => {
      if (sql.includes("WITH PASSWORD 'old-pass-1'")) {
        calls.rollback += 1;
        return rollbackOk
          ? { ok: true, stdout: 'ALTER USER', stderr: '' }
          : { ok: false, stdout: '', stderr: 'rollback denied' };
      }
      if (sql.includes('ALTER USER')) {
        calls.alter += 1;
        calls.lastAlter = sql;
        return alterOk
          ? { ok: true, stdout: 'ALTER USER', stderr: '' }
          : { ok: false, stdout: '', stderr: 'alter denied' };
      }
      calls.verify += 1;
      return verifyOk
        ? { ok: true, stdout: '1', stderr: '' }
        : { ok: false, stdout: '', stderr: 'password authentication failed' };
    },
    audit: () => {
      calls.audit += 1;
      return { ok: true, stdout: '' };
    },
    getAuditor: () => 'admin-1',
    restart: (args) => {
      calls.restart.push(args);
      return true;
    },
    generatePassword: () => {
      calls.generated += 1;
      return 'NewPass1234';
    },
    resolveLimit: () => 10,
  };

  return { deps, calls, envWrites };
}

test('策略不达标：中止，且绝不触碰服务端', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await dbResetPassword(
    { confirmed: true, password: 'abcdefgh12' }, // 仅两类字符
    deps
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /不符合策略/);
  assert.equal(calls.alter, 0);
  assert.equal(calls.verify, 0);
  assert.equal(envWrites.length, 0);
});

test('新密码与当前密码相同：中止，不触碰服务端', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await dbResetPassword({ confirmed: true, password: 'old-pass-1' }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /相同/);
  assert.equal(calls.alter, 0);
  assert.equal(envWrites.length, 0);
});

test('.env 不可读：干净失败，不执行任何 SQL', async () => {
  const calls = [];
  const res = await dbResetPassword(
    { confirmed: true },
    {
      parseEnv: () => {
        throw new Error('ENOENT');
      },
      run: () => calls.push(1),
    }
  );
  assert.equal(res.ok, false);
  assert.match(res.message, /无法读取/);
  assert.equal(calls.length, 0);
});

test('ALTER USER 失败：中止，服务端与账本都未变更', async () => {
  const { deps, calls, envWrites } = makeDeps({ alterOk: false });
  const res = await dbResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /改密失败/);
  assert.equal(calls.verify, 0);
  assert.equal(calls.rollback, 0);
  assert.equal(envWrites.length, 0);
  assert.equal(calls.audit, 0);
  assert.equal(calls.restart.length, 0);
});

test('验证失败 + 回滚成功：不写 .env，且不写审计、不重启', async () => {
  const { deps, calls, envWrites } = makeDeps({ verifyOk: false, rollbackOk: true });
  const res = await dbResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /已回滚旧密码/);
  assert.equal(calls.rollback, 1);
  assert.equal(envWrites.length, 0, '回滚成功路径绝不写 .env');
  assert.equal(calls.audit, 0);
  assert.equal(calls.restart.length, 0);
});

test('验证失败 + 回滚也失败：如实报告，且仍不写 .env', async () => {
  const { deps, calls, envWrites } = makeDeps({ verifyOk: false, rollbackOk: false });
  const res = await dbResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /回滚失败/);
  assert.match(res.message, /\.env 未更新/);
  assert.equal(envWrites.length, 0, '这是「绝不漂移」的核心断言');
});

test('验证失败 + 旧密码为空：无回滚可用，明确告知', async () => {
  const env = { ...ENV, DB_PASSWORD: '' };
  let rollbackSeen = false;
  const res = await dbResetPassword(
    { confirmed: true },
    {
      ...makeDeps({ verifyOk: false }).deps,
      parseEnv: () => env,
      run: (sql) => {
        // 旧密码为空时回滚 SQL 形如 WITH PASSWORD ''（首次 ALTER 带的是新密码）
        if (sql.includes("WITH PASSWORD ''")) rollbackSeen = true;
        return sql.includes('ALTER USER')
          ? { ok: true, stdout: 'ALTER USER', stderr: '' }
          : { ok: false, stdout: '', stderr: 'auth failed' };
      },
    }
  );
  assert.equal(res.ok, false);
  assert.equal(rollbackSeen, false, '旧密码为空时不发回滚 SQL');
  assert.match(res.message, /回滚失败/);
});

test('成功路径：ALTER → 验证 → 成对写 .env → 审计 → 重启', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await dbResetPassword({ confirmed: true }, deps);
  assert.equal(res.ok, true);
  assert.equal(res.password, 'NewPass1234');

  // 顺序：ALTER(1) → SELECT 1(1)
  assert.equal(calls.alter, 1);
  assert.equal(calls.verify, 1);
  assert.equal(calls.rollback, 0);

  // 账本必须成对更新：只改 DB_PASSWORD 会让 Prisma 继续拿旧口令
  assert.equal(envWrites.length, 1);
  const written = envWrites[0];
  assert.equal(written.DB_PASSWORD, 'NewPass1234');
  assert.equal(
    written.DATABASE_URL,
    'postgresql://postgres:NewPass1234@localhost:5432/cloudcad'
  );

  assert.equal(calls.audit, 1);
  assert.deepEqual(calls.restart, [['restart', 'backend']]);
});

test('--no-restart：其余步骤照做，但不重启', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await dbResetPassword({ confirmed: true, restart: false }, deps);
  assert.equal(res.ok, true);
  assert.equal(envWrites.length, 1);
  assert.equal(calls.audit, 1);
  assert.equal(calls.restart.length, 0);
  assert.match(res.message, /未重启/);
});

test('审计归属缺失：跳过审计但不改变成功结果', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await dbResetPassword({ confirmed: true }, { ...deps, getAuditor: () => '' });
  assert.equal(res.ok, true);
  assert.equal(envWrites.length, 1);
  assert.equal(calls.audit, 0);
  assert.match(res.message, /审计跳过/);
});

test('审计失败：不改变成功结果，仅附告警', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await dbResetPassword(
    { confirmed: true },
    { ...deps, audit: () => ({ ok: false, stdout: '', stderr: 'enum violation' }) }
  );
  assert.equal(res.ok, true);
  assert.equal(envWrites.length, 1);
  assert.match(res.message, /审计写入失败/);
});

test('指定密码优先于自动生成，且同样受策略约束', async () => {
  const { deps, calls, envWrites } = makeDeps();
  const res = await dbResetPassword(
    { confirmed: true, password: 'Spec-P@ss99' },
    deps
  );
  assert.equal(res.ok, true);
  assert.equal(res.password, 'Spec-P@ss99');
  assert.equal(envWrites[0].DB_PASSWORD, 'Spec-P@ss99');
  assert.match(envWrites[0].DATABASE_URL, /Spec-P%40ss99/);
  assert.equal(calls.alter, 1);
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
  const { deps, calls, envWrites } = interactiveDeps('Typed-P@ss99');
  const res = await dbResetPassword({ confirmed: true, interactive: true }, deps);
  assert.equal(res.ok, true);
  assert.equal(res.password, 'Typed-P@ss99');
  assert.equal(deps.prompted, 1, '必须真的走交互提示');
  assert.equal(calls.generated, 0, '交互路径不得回落自动生成');
  assert.match(calls.lastAlter, /WITH PASSWORD 'Typed-P@ss99'/);
  assert.equal(envWrites[0].DB_PASSWORD, 'Typed-P@ss99');
});

test('interactive：输入的弱口令同样过不了策略闸门', async () => {
  const { deps, calls, envWrites } = interactiveDeps('abcdefgh12');
  const res = await dbResetPassword({ confirmed: true, interactive: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /不符合策略/);
  assert.equal(calls.alter, 0);
  assert.equal(envWrites.length, 0);
});

test('interactive：输成当前口令仍被拦（与指定口令同判据）', async () => {
  const { deps, calls, envWrites } = interactiveDeps('old-pass-1');
  const res = await dbResetPassword({ confirmed: true, interactive: true }, deps);
  assert.equal(res.ok, false);
  assert.match(res.message, /相同/);
  assert.equal(calls.alter, 0);
  assert.equal(envWrites.length, 0);
});

test('interactive：同时给了指定密码时，指定优先、不触发交互提示', async () => {
  const { deps, calls, envWrites } = interactiveDeps('Typed-P@ss99');
  const res = await dbResetPassword(
    { confirmed: true, interactive: true, password: 'Spec-P@ss99' },
    deps
  );
  assert.equal(res.ok, true);
  assert.equal(res.password, 'Spec-P@ss99');
  assert.equal(deps.prompted, 0, '已显式给口令时无需再问用户');
  assert.equal(envWrites[0].DB_PASSWORD, 'Spec-P@ss99');
});
