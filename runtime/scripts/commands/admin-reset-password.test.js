/**
 * admin-reset-password.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定管理员密码重置恢复通道（#417，ADR-0072）的可测纯逻辑：
 * - 口令策略断言与后端 password-policy.service.assertPasswordPolicy 同口径
 *   （长度下限 + 大小写/数字/特殊字符四类至少三类），生成的强随机口令必须稳过——
 *   否则重置出来的密码客户照样登不上，恢复通道等于没修
 * - bcrypt 哈希用后端同款算法与成本因子（$2b$12$），必须能被后端 bcrypt.compare 验过：
 *   这是整条通道的正确性核心，哈希前缀/成本错一个字符登录就永久失败
 * - 管理员候选列表解析：psql -tA 的 | 分隔 + totpEnabled 布尔小写 t/f 语义
 * - 长度下限读取：缺省 10，接受 env 抬高，低于 8 的取值回退默认（那种配置本身不安全）
 *
 * 不测数据库交互（UPDATE/DELETE/INSERT audit_logs）——需真实 PG，归集成环境。
 * 用源码扫描锁两条委托契约（见文件末尾）：显式口令必须过策略校验、点名用户
 * 名必须限定 ADMIN 角色。
 *
 * 运行：node --test runtime/scripts/commands/admin-reset-password.test.js
 */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertPasswordPolicy,
  parseAdminList,
  verifyUpdateCount,
  promptInteractivePassword,
  hashPassword,
  loadBcrypt,
  resolveMinLength,
} = require('./admin-reset-password');
const { generateStrongPassword } = require('./setup-wizard');

test('assertPasswordPolicy 拒绝过短口令', () => {
  const errors = assertPasswordPolicy('Ab1!', 10);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('长度至少')));
});

test('assertPasswordPolicy 拒绝空口令', () => {
  const errors = assertPasswordPolicy('', 10);
  assert.ok(errors.length > 0);
});

test('assertPasswordPolicy 拒绝字符类别不足三类的口令（小写+数字仅两类）', () => {
  const errors = assertPasswordPolicy('abcdefgh12', 10);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('至少三类')));
});

test('assertPasswordPolicy 接受大小写+数字两类以上（恰好三类）', () => {
  assert.deepEqual(assertPasswordPolicy('Abcdefgh12!', 10), []);
});

test('assertPasswordPolicy 按传入的下限判定，不被内置默认覆盖', () => {
  // 'Ab1!cdefg' 为 9 位：下限 10 时因长度不足被拒，下限 8 时通过（复杂度四类全含）
  const errors = assertPasswordPolicy('Ab1!cdefg', 10);
  assert.ok(errors.some((e) => e.includes('长度至少')));
  assert.deepEqual(assertPasswordPolicy('Ab1!cdefg', 8), []);
});

test('生成的强随机口令全部满足默认策略（策略校验与生成器不脱节）', () => {
  for (let i = 0; i < 50; i++) {
    const password = generateStrongPassword();
    assert.equal(password.length, 16, `第 ${i} 次生成长度异常`);
    assert.deepEqual(
      assertPasswordPolicy(password, 10),
      [],
      `第 ${i} 次生成的口令未通过策略校验`
    );
  }
});

test('生成的强随机口令随密码学随机源变化，不产生重复', () => {
  const samples = new Set();
  for (let i = 0; i < 200; i++) {
    samples.add(generateStrongPassword());
  }
  assert.equal(samples.size, 200);
});

test('hashPassword 产出与后端一致的 $2b$12$ 前缀与 60 字符长度', () => {
  const hash = hashPassword('@Q8mAOz%qJ2c^_Pu');
  assert.ok(hash.startsWith('$2b$12$'), `哈希前缀异常: ${hash.slice(0, 7)}`);
  assert.equal(hash.length, 60);
});

test('hashPassword 产物可被后端 bcrypt.compare 验过，且拒绝错误口令', () => {
  const bcrypt = loadBcrypt();
  const plain = '@Q8mAOz%qJ2c^_Pu';
  const hash = hashPassword(plain);
  assert.equal(bcrypt.compareSync(plain, hash), true);
  assert.equal(bcrypt.compareSync('wrong-password', hash), false);
});

test('hashPassword 同一口令每次产出不同哈希（salt 随机）', () => {
  assert.notEqual(hashPassword('same-password'), hashPassword('same-password'));
});

test('parseAdminList 解析空输出为空数组', () => {
  assert.deepEqual(parseAdminList(''), []);
  assert.deepEqual(parseAdminList('   \n  '), []);
});

test('parseAdminList 解析多行并正确转换 totpEnabled 布尔语义', () => {
  const admins = parseAdminList(
    'u1|admin|t|ACTIVE\nu2|ops|f|ACTIVE\nu3|boss|t|INACTIVE'
  );
  assert.equal(admins.length, 3);
  assert.deepEqual(admins[0], {
    id: 'u1',
    username: 'admin',
    totpEnabled: true,
    status: 'ACTIVE',
  });
  assert.equal(admins[1].totpEnabled, false);
  assert.equal(admins[2].status, 'INACTIVE');
});

test('resolveMinLength 缺省回退后端默认 10', () => {
  assert.equal(resolveMinLength({}), 10);
  assert.equal(resolveMinLength({ PASSWORD_POLICY_MIN_LENGTH: undefined }), 10);
  assert.equal(resolveMinLength({ PASSWORD_POLICY_MIN_LENGTH: 'not-a-number' }), 10);
});

test('resolveMinLength 接受 env 抬高的下限', () => {
  assert.equal(resolveMinLength({ PASSWORD_POLICY_MIN_LENGTH: '14' }), 14);
});

test('resolveMinLength 拒绝低于 8 的下限（该配置本身不安全，回退默认）', () => {
  assert.equal(resolveMinLength({ PASSWORD_POLICY_MIN_LENGTH: '4' }), 10);
  assert.equal(resolveMinLength({ PASSWORD_POLICY_MIN_LENGTH: '0' }), 10);
  assert.equal(resolveMinLength({ PASSWORD_POLICY_MIN_LENGTH: '-3' }), 10);
});

test('verifyUpdateCount 单条 UPDATE 事务通过', () => {
  assert.equal(verifyUpdateCount('BEGIN\nUPDATE 1\nDELETE 3\nCOMMIT\n', 1), true);
});

test('verifyUpdateCount 解绑 TOTP + 改口令两条 UPDATE 通过', () => {
  assert.equal(verifyUpdateCount('BEGIN\nUPDATE 1\nUPDATE 1\nDELETE 0\nCOMMIT\n', 2), true);
});

test('verifyUpdateCount 抓出「口令未更新但另一条 UPDATE 成功」的静默失败', () => {
  // --also-unbind-totp 时解绑那条先输出 UPDATE 1，若口令那条是 UPDATE 0
  // （例如 id 已失效），期望 2 行只来 1 行 → 必须判失败。
  const stdout = 'BEGIN\nUPDATE 1\nUPDATE 0\nDELETE 0\nCOMMIT\n';
  assert.equal(verifyUpdateCount(stdout, 2), false);
  // 这正是原 `/UPDATE 1/` 正则匹配会漏判的场景：它只看「有没有」不看「有几条」
  assert.equal(/UPDATE 1/.test(stdout), true);
});

test('verifyUpdateCount 零行更新与空输出都判失败', () => {
  assert.equal(verifyUpdateCount('BEGIN\nUPDATE 0\nDELETE 0\nCOMMIT\n', 1), false);
  assert.equal(verifyUpdateCount('', 1), false);
  assert.equal(verifyUpdateCount('', 0), true);
});

// 交互循环回归：原先用 do-while 条件混合「未提供密码」与「策略不达标」两种失败，
// 第 2 次输入不匹配时会跳过取消分支、经 while 条件静默通过校验并返回空字符串。
// 循环体必须始终校验策略，任何被采用的口令都要能过。
test('交互循环：首次空白即自动生成，不再重问', async () => {
  let calls = 0;
  const prompter = async () => {
    calls += 1;
    return ''; // 空白 → 自动生成
  };
  const res = await promptInteractivePassword('admin', 10, prompter);
  assert.equal(res.ok, true);
  assert.equal(calls, 1);
  assert.equal(res.password.length, 16);
  assert.equal(assertPasswordPolicy(res.password, 10).length, 0);
});

test('交互循环：策略不达标必须重输而非采用', async () => {
  let calls = 0;
  const prompter = async () => {
    calls += 1;
    if (calls === 1) return 'abcdefgh12'; // 仅两类，不达标
    return 'Ab1!cdefgh'; // 重输后达标
  };
  const res = await promptInteractivePassword('admin', 10, prompter);
  assert.equal(res.ok, true);
  assert.equal(res.password, 'Ab1!cdefgh');
  assert.equal(calls, 2);
});

// ==================== 委托契约（源码扫描） ====================
// adminResetPassword 没有 deps 注入缝（bcrypt / psql 绑在模块级），不为锁两条
// 委托契约而引入缝——真实写库路径由集成环境与只读探针覆盖（弱口令被拦且
// passwordChangedAt 不变；非管理员用户名在写库前被拦）。

const SOURCE = fs.readFileSync(
  path.join(__dirname, 'admin-reset-password.js'),
  'utf8'
);

test('显式口令必须过策略校验（否则网页表单可写入弱口令）', () => {
  const atOpts = SOURCE.indexOf('options?.password');
  const atCheck = SOURCE.indexOf('assertPasswordPolicy(newPassword, minLength)');
  assert.ok(atOpts > 0, '应支持 options.password（运维中心 ADR-0071 非交互通道）');
  assert.ok(
    atCheck > atOpts,
    '策略校验须落在口令来源判定之后，覆盖显式指定 / 交互输入 / 自动生成三个来源'
  );
});

test('点名用户名限定 ADMIN 角色，与候选列表同一口径（防越权重置非管理员）', () => {
  const i = SOURCE.indexOf('function queryAdminByUsername');
  const j = SOURCE.indexOf('function queryAdminCandidates');
  assert.ok(i > 0 && j > i);
  const byName = SOURCE.slice(i, j);
  assert.match(byName, /JOIN "roles"/);
  assert.match(byName, /r\."name"\s*=\s*'ADMIN'/);
  assert.ok(!/LEFT JOIN/.test(byName), '按用户名查也必须 INNER JOIN 过滤角色');
});
