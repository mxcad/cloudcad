/**
 * secret-generator.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定基础设施口令生成（generateInfraPasswords）：数据库 / Redis 是内部基础设施，
 * 管理员登录用的是 INITIAL_ADMIN_PASSWORD（用户实际操作体验不经过这两个口令），
 * 故可安全随机化——不得再退化成固定简单值 12345678（用户诉求：随机复杂密码）。
 * 同时锁定 generateStrongPassword 的通用属性（16 位四类 + 排除 `$`，供 Docker
 * compose env_file 变量插值安全）。
 *
 * 运行：node --test runtime/scripts/lib/secret-generator.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateStrongPassword,
  generateInfraPasswords,
} = require('./secret-generator');

/** 断言口令满足生成器契约：16 位 + 四类字符各至少一个 + 不含 `$` */
function assertStrongPwd(pwd) {
  assert.equal(pwd.length, 16, `口令应 16 位（实际 ${pwd.length}）`);
  assert.match(pwd, /[a-z]/, '应含小写');
  assert.match(pwd, /[A-Z]/, '应含大写');
  assert.match(pwd, /\d/, '应含数字');
  assert.match(pwd, /[^a-zA-Z0-9]/, '应含特殊字符');
  assert.ok(!pwd.includes('$'), '不得含 $（Docker compose env_file 变量插值陷阱）');
}

test('generateInfraPasswords：数据库与 Redis 各自生成独立 16 位四类强随机口令', () => {
  const { dbPassword, redisPassword } = generateInfraPasswords();
  assertStrongPwd(dbPassword);
  assertStrongPwd(redisPassword);
  // 两个口令独立生成不复用同值（避免一处泄露连带另一处）
  assert.notEqual(dbPassword, redisPassword, '数据库与 Redis 口令不得同值');
});

test('generateInfraPasswords：不得退化成固定简单口令 12345678（用户诉求随机化）', () => {
  for (let i = 0; i < 5; i++) {
    const { dbPassword, redisPassword } = generateInfraPasswords();
    assert.notEqual(dbPassword, '12345678');
    assert.notEqual(redisPassword, '12345678');
  }
});

test('generateInfraPasswords：多次调用结果不同（随机性）', () => {
  const first = generateInfraPasswords();
  const second = generateInfraPasswords();
  assert.notEqual(
    `${first.dbPassword}|${first.redisPassword}`,
    `${second.dbPassword}|${second.redisPassword}`,
    '连续两次生成的口令组合不应相同'
  );
});

test('generateStrongPassword：16 位四类强随机口令（既有契约回归）', () => {
  assertStrongPwd(generateStrongPassword());
});
