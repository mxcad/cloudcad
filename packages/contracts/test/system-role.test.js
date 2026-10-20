'use strict';

/**
 * ADMIN 判定唯一出口（T4 前置收敛）的纯函数契约测试。
 *
 * Role.name 在 schema 中是自由字符串（无 Prisma 枚举），SystemRole.ADMIN 是其
 * 唯一事实源。收敛前 `role?.name === 'ADMIN'` 散落 backend 8 处（含
 * jwt.strategy 的 MFA 锁定与口令到期锁定两个分支），任一处分叉都会让
 * 「谁是管理员」的答案不一致。
 *
 * 钉死两件事：
 * - 判定语义严格全等且大小写敏感（Role.name 由种子数据写入，不做归一化）；
 * - 入参按最小结构吃（role 可缺失、可 null、name 可 null），
 *   使 include 深度不同的查询结果都能传入而不会静默漏判。
 *
 * CommonJS + node --test，跑在 pnpm build 产出的 dist/ 上，零外部依赖。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { isAdminRole, isAdminUser, SystemRole } = require('../dist/index.js');

test('isAdminRole：SystemRole.ADMIN 命中（唯一事实源，非字面量）', () => {
  assert.equal(isAdminRole(SystemRole.ADMIN), true);
  assert.equal(isAdminRole('ADMIN'), true);
});

test('isAdminRole：其余系统角色全部不命中', () => {
  for (const role of [
    SystemRole.AUDIT_ADMIN,
    SystemRole.USER_MANAGER,
    SystemRole.FONT_MANAGER,
    SystemRole.USER,
  ]) {
    assert.equal(isAdminRole(role), false, `${role} 不应被当作管理员`);
  }
});

test('isAdminRole：严格全等且大小写敏感（不 trim、不归一大小写）', () => {
  assert.equal(isAdminRole('admin'), false);
  assert.equal(isAdminRole('Admin'), false);
  assert.equal(isAdminRole(' ADMIN '), false);
});

test('isAdminRole：缺失值一律不命中，绝不抛错', () => {
  assert.equal(isAdminRole(undefined), false);
  assert.equal(isAdminRole(null), false);
  assert.equal(isAdminRole(''), false);
});

test('isAdminUser：带 role 关系的用户命中', () => {
  assert.equal(isAdminUser({ role: { name: 'ADMIN' } }), true);
  assert.equal(
    isAdminUser({
      role: {
        id: 'r1',
        name: 'ADMIN',
        description: null,
        isSystem: true,
        permissions: [],
      },
    }),
    true,
  );
});

test('isAdminUser：role 缺失或为 null 均不命中（include 深度不同的查询结果安全）', () => {
  assert.equal(isAdminUser({}), false);
  assert.equal(isAdminUser({ role: null }), false);
  assert.equal(isAdminUser({ role: undefined }), false);
});

test('isAdminUser：用户本身为 null 不命中（不抛错）', () => {
  assert.equal(isAdminUser(null), false);
  assert.equal(isAdminUser(undefined), false);
});

test('isAdminUser：name 缺失、为 null 或非 ADMIN 均不命中', () => {
  assert.equal(isAdminUser({ role: {} }), false);
  assert.equal(isAdminUser({ role: { name: null } }), false);
  assert.equal(isAdminUser({ role: { name: 'USER' } }), false);
  assert.equal(isAdminUser({ role: { name: 'admin' } }), false);
});
