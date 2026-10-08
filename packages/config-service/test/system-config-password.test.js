'use strict';

/**
 * ADR-0071/0073 收敛回归：/api/password/{database,redis,admin-user} 已改为薄壳。
 *
 * 锁住四件事：
 *  - 输入校验仍在本层（旧密码核对；网页表单带该字段，是防误改的人机确认）；
 *    例外是 admin-user——不索取旧密码，被锁死的恰恰是「不知旧密码」；
 *  - 改密逻辑整体委托 runtime/scripts（本层不再自己 spawn psql/redis-cli）；
 *  - 响应契约：ok=200+message，失败=400+error（表单错误区据此显示）；
 *  - admin-user 回传 totpEnabled/unbindTotp，让网页能提示重置后仍会被动态码挡住。
 *
 * 真实改密路径（ALTER USER / CONFIG SET / bcrypt 写库 / 新口令回连验证 / 审计）
 * 的单测在 runtime/scripts/commands/*-reset-password.test.js，本文件只测委托边界。
 *
 * 运行：cd packages/config-service && npm test
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { EventEmitter } = require('node:events');

const OPS_PATH = require.resolve('../lib/ops');
const SESSION_PATH = require.resolve('../lib/session');
const ENV_PATH = require.resolve('../lib/env');
const ROUTE_PATH = require.resolve('../routes/system-config');

const realOps = require(OPS_PATH);
const realSession = require(SESSION_PATH);
const realEnv = require(ENV_PATH);

// —— 注入缝：委托结果 / 登录态 / .env 内容 全部可控 ——
let dbResult = { ok: true, message: '已重置数据库密码' };
let redisResult = { ok: true, message: '已重置 Redis 密码' };
let adminUsersResult = {
  ok: true,
  admins: [
    { id: 'u-1', username: 'admin', totpEnabled: false, status: 'active' },
    { id: 'u-2', username: 'boss', totpEnabled: true, status: 'active' },
  ],
};
let adminUserResult = { ok: true, message: '已重置管理员 admin 的密码' };
let authed = true;
let envFile = {};
const calls = [];

function installCache(modulePath, exports) {
  const orig = require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
    children: orig && orig.children ? orig.children : [],
    paths: orig && orig.paths ? orig.paths : [],
  };
}

installCache(OPS_PATH, {
  ...realOps,
  runDbPasswordReset: async (newPassword) => {
    calls.push(['db', newPassword]);
    return dbResult;
  },
  runRedisPasswordReset: async (newPassword) => {
    calls.push(['redis', newPassword]);
    return redisResult;
  },
  listAdminUsers: () => {
    calls.push(['admin-users']);
    return adminUsersResult;
  },
  runAdminUserPasswordReset: async (opts) => {
    calls.push(['admin-user', opts]);
    return adminUserResult;
  },
});
installCache(SESSION_PATH, {
  ...realSession,
  authMiddleware: () => (authed ? { userId: 'tester' } : null),
});
installCache(ENV_PATH, {
  ...realEnv,
  parseEnvFile: () => envFile,
});

const { handle } = require('../routes/system-config');

function reset() {
  dbResult = { ok: true, message: '已重置数据库密码' };
  redisResult = { ok: true, message: '已重置 Redis 密码' };
  adminUsersResult = {
    ok: true,
    admins: [
      { id: 'u-1', username: 'admin', totpEnabled: false, status: 'active' },
      { id: 'u-2', username: 'boss', totpEnabled: true, status: 'active' },
    ],
  };
  adminUserResult = { ok: true, message: '已重置管理员 admin 的密码' };
  authed = true;
  envFile = {};
  calls.length = 0;
}

/** 构造一次 POST 并收集响应 */
async function post(pathname, body, method = 'POST') {
  const req = new EventEmitter();
  req.headers = {};
  const captured = { status: null, body: null };
  const res = {
    writeHead(status) {
      captured.status = status;
    },
    end(payload) {
      captured.body = payload ? JSON.parse(payload) : null;
      return true;
    },
  };
  const handled = handle(req, res, pathname, method);
  req.emit('data', Buffer.from(JSON.stringify(body || {})));
  req.emit('end');
  return { captured, handled: await handled };
}

describe('/api/password/database', () => {
  it('缺少旧密码或新密码 → 400，且不委托', async () => {
    reset();
    const { captured, handled } = await post('/api/password/database', {
      newPassword: 'New-Password-1',
    });
    assert.equal(handled, true);
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, '请输入旧密码和新密码');
    assert.deepEqual(calls, []);
  });

  it('新密码不是字符串 → 400（避免策略校验抛 TypeError）', async () => {
    reset();
    const { captured } = await post('/api/password/database', {
      oldPassword: 'x',
      newPassword: 12345678,
    });
    assert.equal(captured.status, 400);
    assert.deepEqual(calls, []);
  });

  it('旧密码与 .env 不一致 → 400「旧密码错误」，且不委托', async () => {
    reset();
    envFile = { DB_PASSWORD: 'Ledger-Pass-1' };
    const { captured } = await post('/api/password/database', {
      oldPassword: 'Wrong-Pass-1',
      newPassword: 'New-Pass-1',
    });
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, '旧密码错误');
    assert.deepEqual(calls, []);
  });

  it('校验通过则把新密码原样委托给 CLI，并回 200+message', async () => {
    reset();
    envFile = { DB_PASSWORD: 'Ledger-Pass-1' };
    const { captured, handled } = await post('/api/password/database', {
      oldPassword: 'Ledger-Pass-1',
      newPassword: 'New-Pass-1',
    });
    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    assert.equal(captured.body.success, true);
    assert.equal(captured.body.message, '已重置数据库密码');
    assert.deepEqual(calls, [['db', 'New-Pass-1']]);
  });

  it('CLI 失败 → 400 且 error 回带 CLI 的原因（策略拒绝要能显示到表单）', async () => {
    reset();
    envFile = { DB_PASSWORD: 'Ledger-Pass-1' };
    dbResult = { ok: false, message: '密码不符合策略：长度至少 10 位' };
    const { captured } = await post('/api/password/database', {
      oldPassword: 'Ledger-Pass-1',
      newPassword: 'short-1',
    });
    assert.equal(captured.status, 400);
    assert.equal(captured.body.success, false);
    assert.equal(captured.body.error, '密码不符合策略：长度至少 10 位');
  });

  it('runtime/scripts 不可用（桥接层结构化错误）→ 400 + error', async () => {
    reset();
    envFile = { DB_PASSWORD: 'Ledger-Pass-1' };
    dbResult = { ok: false, error: 'runtime/scripts 不可用：模块缺失' };
    const { captured } = await post('/api/password/database', {
      oldPassword: 'Ledger-Pass-1',
      newPassword: 'New-Pass-1',
    });
    assert.equal(captured.status, 400);
    assert.match(captured.body.error, /runtime\/scripts 不可用/);
  });

  it('未登录 → 止步，不委托', async () => {
    reset();
    authed = false;
    envFile = { DB_PASSWORD: 'Ledger-Pass-1' };
    const { captured, handled } = await post('/api/password/database', {
      oldPassword: 'Ledger-Pass-1',
      newPassword: 'New-Pass-1',
    });
    assert.equal(handled, true);
    assert.equal(captured.status, null);
    assert.deepEqual(calls, []);
  });
});

describe('/api/password/redis', () => {
  it('旧密码与 .env 不一致 → 400，且不委托', async () => {
    reset();
    envFile = { REDIS_PASSWORD: 'Ledger-Pass-1' };
    const { captured } = await post('/api/password/redis', {
      oldPassword: 'Wrong-Pass-1',
      newPassword: 'New-Pass-1',
    });
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, '旧密码错误');
    assert.deepEqual(calls, []);
  });

  it('校验通过则委托 CLI，并回 200+message', async () => {
    reset();
    envFile = { REDIS_PASSWORD: 'Ledger-Pass-1' };
    const { captured } = await post('/api/password/redis', {
      oldPassword: 'Ledger-Pass-1',
      newPassword: 'New-Pass-1',
    });
    assert.equal(captured.status, 200);
    assert.equal(captured.body.message, '已重置 Redis 密码');
    assert.deepEqual(calls, [['redis', 'New-Pass-1']]);
  });

  it('CLI 失败 → 400 + error', async () => {
    reset();
    envFile = { REDIS_PASSWORD: 'Ledger-Pass-1' };
    redisResult = { ok: false, message: '新密码验证失败：noauth' };
    const { captured } = await post('/api/password/redis', {
      oldPassword: 'Ledger-Pass-1',
      newPassword: 'New-Pass-1',
    });
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, '新密码验证失败：noauth');
  });
});

describe('/api/password/admin-users', () => {
  it('返回管理员清单，只带网页需要的字段', async () => {
    reset();
    const { captured, handled } = await post('/api/password/admin-users', {}, 'GET');
    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    assert.deepEqual(captured.body.admins, [
      { username: 'admin', totpEnabled: false, status: 'active' },
      { username: 'boss', totpEnabled: true, status: 'active' },
    ]);
  });

  it('查询失败 → 400 + error', async () => {
    reset();
    adminUsersResult = { ok: false, message: '查询失败：连接被拒绝' };
    const { captured } = await post('/api/password/admin-users', {}, 'GET');
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, '查询失败：连接被拒绝');
  });
});

describe('/api/password/admin-user', () => {
  // 与数据库/Redis 两条刻意不同：不索取旧密码（被锁死的恰恰是「不知旧密码」）
  it('不带旧密码也能过校验并委托', async () => {
    reset();
    const { captured, handled } = await post('/api/password/admin-user', {
      username: 'admin',
      newPassword: 'New-Admin-1',
    });
    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    assert.equal(captured.body.message, '已重置管理员 admin 的密码');
    assert.deepEqual(calls, [
      [
        'admin-user',
        {
          username: 'admin',
          password: 'New-Admin-1',
          unbindTotp: false,
        },
      ],
    ]);
  });

  it('没有点选管理员 → 400，且不委托', async () => {
    reset();
    const { captured } = await post('/api/password/admin-user', {
      newPassword: 'New-Admin-1',
    });
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, '请选择要重置密码的管理员');
    assert.deepEqual(calls, []);
  });

  it('缺新密码 / 非字符串 → 400，且不委托（避免下游抛 TypeError）', async () => {
    reset();
    const missing = await post('/api/password/admin-user', { username: 'admin' });
    assert.equal(missing.captured.status, 400);
    assert.equal(missing.captured.body.error, '请输入新密码');
    const notString = await post('/api/password/admin-user', {
      username: 'admin',
      newPassword: 12345678,
    });
    assert.equal(notString.captured.status, 400);
    assert.equal(notString.captured.body.error, '请输入新密码');
    assert.deepEqual(calls, []);
  });

  it('回传 totpEnabled / unbindTotp，让网页能提示「登录后仍会被动态码挡住」', async () => {
    reset();
    adminUserResult = {
      ok: true,
      message: '已重置管理员 boss 的密码',
      totpEnabled: true,
      unbindTotp: false,
    };
    const { captured } = await post('/api/password/admin-user', {
      username: 'boss',
      newPassword: 'New-Admin-1',
    });
    assert.equal(captured.status, 200);
    assert.equal(captured.body.totpEnabled, true);
    assert.equal(captured.body.unbindTotp, false);
  });

  it('CLI 拒绝（用户名不是 ADMIN）→ 400 且原因显示到表单', async () => {
    reset();
    adminUserResult = { ok: false, message: '用户不存在或不是管理员：nobody' };
    const { captured } = await post('/api/password/admin-user', {
      username: 'nobody',
      newPassword: 'New-Admin-1',
    });
    assert.equal(captured.status, 400);
    assert.equal(captured.body.error, '用户不存在或不是管理员：nobody');
  });

  it('未登录 → 止步，不委托', async () => {
    reset();
    authed = false;
    const { captured, handled } = await post('/api/password/admin-user', {
      username: 'admin',
      newPassword: 'New-Admin-1',
    });
    assert.equal(handled, true);
    assert.equal(captured.status, null);
    assert.deepEqual(calls, []);
  });
});

describe('路由层不保留基础设施改密逻辑（ADR-0071 收尾，禁止双轨回归）', () => {
  it('system-config.js 不再自己拼 psql / redis-cli / CONFIG REWRITE / PM2 重启', () => {
    const source = fs.readFileSync(ROUTE_PATH, 'utf8');
    const banned = [
      'spawnSync',
      'ALTER USER',
      'CONFIG REWRITE',
      'requirepass',
      'getPsqlPath',
      'getRedisCliPath',
      'runPm2Command',
    ];
    const hit = banned.filter((token) => source.includes(token));
    assert.deepEqual(hit, [], `这些逻辑应只在 runtime/scripts 里：${hit.join(', ')}`);
  });

  it('委托入口存在且指向三个 CLI 命令', () => {
    const source = fs.readFileSync(ROUTE_PATH, 'utf8');
    assert.ok(source.includes('runDbPasswordReset(newPassword)'));
    assert.ok(source.includes('runRedisPasswordReset(newPassword)'));
    assert.ok(source.includes('runAdminUserPasswordReset('));
    assert.ok(source.includes('listAdminUsers()'));
  });

  it('桥接函数确实指向对应 CLI 命令，且网页来源统一标 ops_web', () => {
    const source = fs.readFileSync(OPS_PATH, 'utf8');
    assert.ok(source.includes("requireRuntime('commands/db-reset-password')"));
    assert.ok(source.includes("requireRuntime('commands/redis-reset-password')"));
    assert.ok(source.includes("requireRuntime('commands/admin-reset-password')"));
    assert.ok(source.includes('dbResetPassword('));
    assert.ok(source.includes('redisResetPassword('));
    assert.ok(source.includes('adminResetPassword('));
    assert.ok(source.includes("source: 'ops_web'"));
    assert.ok(source.includes("userAgent: 'config-service/web'"));
  });
});
