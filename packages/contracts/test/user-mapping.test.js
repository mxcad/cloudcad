'use strict';

/**
 * toPublicUser 的纯函数契约测试。
 *
 * 该函数是「内部 UserRecord → 可下发客户端的公开形状」的唯一出口，职责是剥离 password 哈希。
 * 历史上「剥掉密码再出响应」被写成 13 处人工惯例，其中 3 处漏剥导致 bcrypt 哈希经
 * /auth/login-phone、/auth/refresh、getUserInfo 泄漏进前端 localStorage。本测试钉死
 * 「经此函数的对象绝不含 password」这一契约，作为那 3 处泄漏回归的底层保障。
 *
 * CommonJS + node --test，跑在 pnpm build 产出的 dist/ 上，零外部依赖。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { toPublicUser } = require('../dist/index.js');

function sampleUser() {
  return {
    id: 'user-1',
    email: 'a@b.com',
    username: 'alice',
    nickname: '昵称',
    avatar: null,
    password: '$2b$12$hashed-secret',
    phone: '13800000000',
    phoneVerified: true,
    emailVerified: false,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    wechatId: null,
    provider: 'LOCAL',
    roleId: 'role-1',
    status: 'ACTIVE',
    role: { id: 'role-1', name: 'USER', description: null, isSystem: true, permissions: [] },
    deletedAt: null,
    deactivatedBy: null,
    totpEnabled: false,
    passwordChangedAt: null,
  };
}

test('toPublicUser 剥离 password 哈希', () => {
  const pub = toPublicUser(sampleUser());
  assert.equal('password' in pub, false, '公开形状不得含 password 键');
  assert.equal(pub.password, undefined);
});

test('toPublicUser 保留其余全部字段（含 role 关系）', () => {
  const pub = toPublicUser(sampleUser());
  assert.equal(pub.id, 'user-1');
  assert.equal(pub.username, 'alice');
  assert.equal(pub.email, 'a@b.com');
  assert.equal(pub.phone, '13800000000');
  assert.equal(pub.status, 'ACTIVE');
  assert.deepEqual(pub.role, { id: 'role-1', name: 'USER', description: null, isSystem: true, permissions: [] });
});

test('toPublicUser 不修改入参（返回新对象）', () => {
  const user = sampleUser();
  const pub = toPublicUser(user);
  assert.notEqual(pub, user);
  assert.equal(user.password, '$2b$12$hashed-secret', '入参的 password 必须原样保留，供校验路径使用');
});
