/**
 * psql.js 回归测试（node:test，0 外部依赖）
 *
 * 核心回归点：run() 必须用**参数数组**调用 psql，绝不拼命令串 + shell:true。
 * SQL 里全是双引号包裹的驼峰标识符（"resourceType" / "roleId" / "totpSecret" …），
 * 经 shell 传递时引号被吃掉、标识符被 PostgreSQL 折叠成小写
 * →「column resourcetype does not exist」，语句静默失败。
 * 该缺陷自 35b2e59 起让全部运维审计一条都写不进去，并让 admin:reset-password /
 * mfa:totp-unbind 两条恢复通道完全不可用（查询与 UPDATE 全部零命中）。
 *
 * 运行：node --test runtime/scripts/lib/psql.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { sqlQuote, makePsql } = require('./psql');

// ==================== sqlQuote ====================

test('sqlQuote 转义单引号', () => {
  assert.equal(sqlQuote("abc"), 'abc');
  assert.equal(sqlQuote("o'brien"), "o''brien");
  assert.equal(sqlQuote("'"), "''");
});

test('sqlQuote 对非字符串做 String 转换', () => {
  assert.equal(sqlQuote(123), '123');
  assert.equal(sqlQuote(null), 'null');
});

// ==================== run：参数数组 + 不经过 shell（核心回归） ====================

function makeHarness(overrides = {}) {
  const config = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_USERNAME: 'postgres',
    DB_DATABASE: 'cloudcad',
    DB_PASSWORD: 'env-db-pass',
    ...overrides.config,
  };
  const calls = [];
  const spawn = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return { status: 0, stdout: overrides.stdout === undefined ? '1\r\n' : overrides.stdout, stderr: overrides.stderr || '' };
  };
  const psql = makePsql({
    getPsqlPath: () => '/runtime/linux/postgres/bin/psql',
    getDbEnv: () => ({ env: { PATH: '/usr/bin', PGPASSWORD: config.DB_PASSWORD }, config }),
    spawn,
  });
  return { psql, calls, config };
}

test('run 用参数数组调用 psql，不拼命令串、不走 shell', () => {
  const { psql, calls } = makeHarness();
  psql.run('SELECT 1');
  assert.equal(calls.length, 1);
  const { cmd, args, options } = calls[0];
  assert.equal(cmd, '/runtime/linux/postgres/bin/psql');
  assert.equal(typeof cmd, 'string');
  // 回归点：SQL 不得拼进命令串（否则必然要 shell:true，引号就会被吃掉）
  assert.ok(Array.isArray(args));
  assert.equal(options.shell, undefined);
});

test('run 把 SQL 原样作为一个参数传递，双引号不被破坏', () => {
  const { psql, calls } = makeHarness();
  const sql = `SELECT u."id" FROM "users" u JOIN "roles" r ON u."roleId" = r."id" WHERE r."name" = 'ADMIN'`;
  psql.run(sql);
  const args = calls[0].args;
  assert.equal(args[args.length - 2], '-tAc');
  assert.equal(args[args.length - 1], sql);
  // 双引号必须逐字保留：这是整条链路能不能工作的唯一前提
  assert.ok(args[args.length - 1].includes('"resourceType"') === false);
  assert.ok(args[args.length - 1].includes('"roleId"'));
  assert.ok(args[args.length - 1].includes("'ADMIN'"));
});

test('run 连接目标来自 .env 配置，口令注入 PGPASSWORD', () => {
  const { psql, calls } = makeHarness();
  psql.run('SELECT 1');
  const { args, options } = calls[0];
  assert.deepEqual(args.slice(0, 7), ['-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d']);
  assert.equal(options.env.PGPASSWORD, 'env-db-pass');
});

test('run 的 override 可覆盖数据库与口令（维护库 ALTER USER / 新口令回连验证）', () => {
  const { psql, calls } = makeHarness();
  psql.run(`ALTER USER "postgres" WITH PASSWORD 'x'`, { database: 'postgres', password: 'new-pass-1' });
  const { args, options } = calls[0];
  assert.equal(args[7], 'postgres');
  assert.equal(options.env.PGPASSWORD, 'new-pass-1');
});

test('run 的 override.database 缺省时用 .env 的应用库', () => {
  const { psql, calls } = makeHarness();
  psql.run('SELECT 1', { password: 'only-password' });
  assert.equal(calls[0].args[7], 'cloudcad');
  assert.equal(calls[0].options.env.PGPASSWORD, 'only-password');
});

test('run 归一化结果：status 判定 ok，stdout/stderr 去首尾空白', () => {
  const { psql } = makeHarness({ stdout: '  BEGIN\nUPDATE 0\nROLLBACK  \n' });
  const r = psql.run('BEGIN;UPDATE "users" SET "totpEnabled" = false WHERE "id" = \'x\';ROLLBACK;');
  assert.equal(r.ok, true);
  assert.equal(r.stdout, 'BEGIN\nUPDATE 0\nROLLBACK');
  assert.equal(r.stderr, '');
});

test('run 在 psql 非零退出时 ok=false 并带回 stderr', () => {
  const result = makePsql({
    getPsqlPath: () => '/psql',
    getDbEnv: () => ({ env: {}, config: {} }),
    spawn: () => ({ status: 1, stdout: '', stderr: 'ERROR:  column "resourcetype" does not exist\n' }),
  });
  const r = result.run('SELECT "resourceType" FROM "audit_logs"');
  assert.equal(r.ok, false);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes('resourcetype'));
});

test('run 在 spawn 抛错时抛出包装后的错误', () => {
  const result = makePsql({
    getPsqlPath: () => '/psql',
    getDbEnv: () => ({ env: {}, config: {} }),
    spawn: () => ({ error: new Error('spawn ENOENT') }),
  });
  assert.throws(() => result.run('SELECT 1'), /psql 执行失败: spawn ENOENT/);
});

// ==================== writeAudit / auditorId ====================

/** 捕获 spawn 收到的参数数组与最后一条 SQL */
function makeCapturing(spawnResult = { status: 0, stdout: 'INSERT 0 1\n', stderr: '' }) {
  const calls = [];
  const psql = makePsql({
    getPsqlPath: () => '/psql',
    getDbEnv: () => ({
      env: { PGPASSWORD: 'env-pass' },
      config: { DB_HOST: 'h', DB_PORT: '5432', DB_USERNAME: 'u', DB_DATABASE: 'd' },
    }),
    spawn: (cmd, args, options) => {
      calls.push(args);
      return spawnResult;
    },
  });
  return {
    psql,
    calls,
    lastSql: () => {
      const args = calls[calls.length - 1];
      return args[args.length - 1];
    },
  };
}

test('writeAudit 生成合法 INSERT：驼峰列名引号保留、params 为 jsonb', () => {
  const { psql, lastSql } = makeCapturing();
  const res = psql.writeAudit({
    action: 'DB_PASSWORD_RESET',
    resourceId: 'redis',
    resourceName: '127.0.0.1:6379',
    params: { method: 'db_reset' },
    userAgent: 'cloudcad-cli/db-reset-password',
    resourceType: 'SYSTEM',
    userId: 'user-123',
  });
  assert.equal(res.ok, true);
  assert.equal(res.stdout, 'INSERT 0 1');
  const sql = lastSql();
  assert.ok(sql.startsWith('INSERT INTO "audit_logs" ('));
  for (const col of ['"id"', '"action"', '"resourceType"', '"resourceId"', '"userId"', '"resourceName"', '"params"', '"success"', '"ipAddress"', '"userAgent"', '"createdAt"']) {
    assert.ok(sql.includes(col), `列 ${col} 必须带双引号`);
  }
  assert.ok(sql.includes("'DB_PASSWORD_RESET'"));
  assert.ok(sql.includes("'SYSTEM'"));
  assert.ok(sql.includes("'user-123'"));
  assert.ok(sql.includes("'redis'"));
  assert.ok(sql.includes("'127.0.0.1:6379'"));
  assert.ok(sql.includes("'127.0.0.1'"));
  assert.ok(sql.includes("'cloudcad-cli/db-reset-password'"));
  assert.ok(sql.includes("'{\"method\":\"db_reset\"}'::jsonb"));
  assert.ok(sql.includes('now()'));
  // success 固定为 true（运维通道审计只记成功操作）
  assert.ok(sql.includes("true,"));
});

test('writeAudit 默认 resourceType=USER，缺省 userId 回落到 resourceId', () => {
  const { psql, lastSql } = makeCapturing();
  psql.writeAudit({
    action: 'MFA_UNBIND',
    resourceId: 'user-42',
    resourceName: 'admin',
    params: { method: 'mfa_unbind' },
    userAgent: 'ua',
  });
  const sql = lastSql();
  assert.ok(sql.includes("'USER'"));
  assert.equal((sql.match(/'user-42'/g) || []).length, 2);
});

test('writeAudit 对含单引号的字段做 SQL 转义', () => {
  const { psql, lastSql } = makeCapturing();
  psql.writeAudit({
    action: 'X',
    resourceId: "o'brien",
    resourceName: "o'brien",
    params: { note: "it's" },
    userAgent: 'ua',
  });
  const sql = lastSql();
  assert.ok(sql.includes("'o''brien'"), '字符串字面量里的单引号被转义');
  // params 是 JSON 再整体转义：单引号出现在 JSON 值内部，两侧不是字面量引号
  assert.ok(sql.includes("'{\"note\":\"it''s\"}'::jsonb"), 'JSON 内的单引号同样被转义');
});

test('writeAudit 透传 psql 的失败', () => {
  const { psql } = makeCapturing({ status: 1, stdout: '', stderr: 'ERROR: duplicate key' });
  const res = psql.writeAudit({
    action: 'X',
    resourceId: 'r',
    resourceName: 'n',
    params: {},
    userAgent: 'ua',
  });
  assert.equal(res.ok, false);
  assert.ok(res.stderr.includes('duplicate key'));
});

test('auditorId 返回查到的 ADMIN 主键（去空白）', () => {
  const { psql, lastSql } = makeCapturing({ status: 0, stdout: '  user-900\n' });
  assert.equal(psql.auditorId(), 'user-900');
  const sql = lastSql();
  assert.ok(sql.includes('"users"'));
  assert.ok(sql.includes('"roles"'));
  assert.ok(sql.includes("'ADMIN'"));
  assert.ok(sql.includes('LIMIT 1'));
});

test('auditorId 在无管理员或查询失败时返回空串（调用方据此跳过审计）', () => {
  const empty = makeCapturing({ status: 0, stdout: '', stderr: '' });
  assert.equal(empty.psql.auditorId(), '');
  const failed = makeCapturing({ status: 1, stdout: '', stderr: 'ERROR: relation "users" does not exist' });
  assert.equal(failed.psql.auditorId(), '');
});
