/**
 * setup-wizard.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定管理员口令三分支（回车=默认简单口令 / y=复杂随机 / n=自定义）与
 * lib/secret-generator 的非交互默认值：DEFAULT_ADMIN_PASSWORD 是等保 8.1.4.1
 * 复杂度的有意放宽，交互路径（本文件）与非交互路径（fillEmptySecrets，离线安装
 * / docker 一键包）必须共用同一常量，不得各写一份。
 *
 * 运行：node --test runtime/scripts/commands/setup-wizard.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { isPasswordWeak, promptAdminPassword } = require('./setup-wizard');
const {
  DEFAULT_ADMIN_PASSWORD,
  fillEmptySecrets,
} = require('../lib/secret-generator');

/**
 * 构造假 readline：按序吐出预置输入，question 的提示文本可断言。
 * 队列耗尽后返回空串（等价直接回车）。
 * @param {string[]} responses
 */
function makeRl(responses) {
  const queue = [...responses];
  const prompts = [];
  return {
    prompts,
    question(text, cb) {
      prompts.push(text);
      cb(queue.shift() ?? '');
    },
    close() {},
  };
}

test('三分支：直接回车 → 默认简单口令', async () => {
  const rl = makeRl(['']);
  assert.equal(await promptAdminPassword(rl), DEFAULT_ADMIN_PASSWORD);
});

test('三分支：y → 16 位四类全覆盖的复杂随机口令', async () => {
  const rl = makeRl(['y']);
  const pwd = await promptAdminPassword(rl);
  assert.equal(pwd.length, 16);
  assert.notEqual(pwd, DEFAULT_ADMIN_PASSWORD);
  assert.match(pwd, /[a-z]/);
  assert.match(pwd, /[A-Z]/);
  assert.match(pwd, /\d/);
  assert.match(pwd, /[^a-zA-Z0-9]/);
});

test('三分支：n + 合格自定义口令 → 原样采用', async () => {
  const rl = makeRl(['n', 'Abcdefgh1!', 'Abcdefgh1!']);
  assert.equal(await promptAdminPassword(rl), 'Abcdefgh1!');
});

test('三分支：n + 弱口令被拒 → 回到分支提问，最终回车落默认', async () => {
  const rl = makeRl(['n', 'abc', 'abc', '']);
  assert.equal(await promptAdminPassword(rl), DEFAULT_ADMIN_PASSWORD);
});

test('三分支：n + 两次输入不一致 → 重新输入，最终采用一致值', async () => {
  const rl = makeRl(['n', 'Abcdefgh1!', 'Different1!', 'Abcdefgh1!', 'Abcdefgh1!']);
  assert.equal(await promptAdminPassword(rl), 'Abcdefgh1!');
});

test('三分支：非法输入被拒 → 重问，最终 y 生效', async () => {
  const rl = makeRl(['abc', '1', 'y']);
  const pwd = await promptAdminPassword(rl);
  assert.equal(pwd.length, 16);
  assert.notEqual(pwd, DEFAULT_ADMIN_PASSWORD);
});

test('三分支：提示文本带出默认值与三个分支说明', async () => {
  const rl = makeRl(['']);
  await promptAdminPassword(rl);
  assert.equal(rl.prompts.length, 1);
  assert.match(rl.prompts[0], /12345678/);
  assert.match(rl.prompts[0], /回车=使用默认/);
  assert.match(rl.prompts[0], /y=生成复杂随机口令/);
  assert.match(rl.prompts[0], /n=自定义/);
});

test('isPasswordWeak：过短或单类字符判为弱（自定义口令前置校验）', () => {
  assert.equal(isPasswordWeak('12345678'), true);
  assert.equal(isPasswordWeak('abcdefgh'), true);
  assert.equal(isPasswordWeak(''), true);
  assert.equal(isPasswordWeak('Abcdefgh1!'), false);
});

test('fillEmptySecrets：INITIAL_ADMIN_PASSWORD 空白 → 写默认简单口令，其余密钥仍随机', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-wizard-test-'));
  const envFile = path.join(dir, '.env');
  const logs = [];
  fs.writeFileSync(
    envFile,
    ['INITIAL_ADMIN_USERNAME=admin', 'INITIAL_ADMIN_PASSWORD=', 'SESSION_SECRET='].join('\n'),
    'utf8'
  );

  fillEmptySecrets(envFile, (m) => logs.push(m));

  const out = fs.readFileSync(envFile, 'utf8');
  assert.match(out, new RegExp(`^INITIAL_ADMIN_PASSWORD=${DEFAULT_ADMIN_PASSWORD}$`, 'm'));
  // 机器密钥不得退化成固定值：仍为 64 位随机十六进制
  assert.match(out, /^SESSION_SECRET=[0-9a-f]{64}$/m);
  // 非交互路径没有终端可问，日志必须把默认口令告知用户
  assert.ok(logs.some((l) => l.includes(DEFAULT_ADMIN_PASSWORD)));
  fs.rmSync(dir, { recursive: true, force: true });
});
