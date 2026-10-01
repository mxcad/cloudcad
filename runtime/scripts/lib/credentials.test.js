/**
 * credentials.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定首次部署凭据备份（根目录 DEPLOY-PASSWORDS.txt）的行为：
 * - 随机生成的数据库/Redis/管理员密码只在终端一次性显示，用户没复制就走就找不回
 *   （数据库密码丢失只能重装 data/postgres）——本文件是终端之外唯一的找回入口
 * - 内容：三项密码 + 账号 + 登录地址 + 4 条保管/找回/销毁提醒，标签列按显示宽度对齐
 *   （中文按 2 列计，否则中英文混排的标签会错位）
 * - 失败语义：写失败只告警、返回 ok:false，**绝不抛错**——凭据备份失败不得中断部署；
 *   空密码项跳过，但 Redis 空值语义是「无密码」而非缺失，必须保留
 * - 权限：非 Windows 落盘后 chmod 600（明文密码文件不应被同机其他账户读取）
 *
 * 运行：node --test runtime/scripts/lib/credentials.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CREDENTIAL_FILE_NAME,
  credentialFilePath,
  formatDateTime,
  buildCredentialItems,
  formatCredentialFile,
  saveCredentialBackup,
} = require('./credentials');
const { PRODUCT_NAME } = require('./branding');

const TOP_LINE = '='.repeat(60);
const MID_LINE = '-'.repeat(60);
const REMINDER_LINES = [
  '  1. 本文件包含明文密码，请妥善保管：勿上传网盘、勿发聊天记录、勿提交代码仓库。',
  '  2. 首次登录管理后台后请立即修改管理员密码。',
  '  3. 密码全部丢失时可从 packages/backend/.env 查看（DB_PASSWORD / REDIS_PASSWORD / INITIAL_ADMIN_PASSWORD）。',
  '  4. 确认密码已记录且不再需要时可删除本文件，删除不影响系统运行。',
];

/** 捕获 console.log 的调用（凭据模块通过 logger 打用户可见提示） */
function captureConsole(fn) {
  const calls = [];
  const original = console.log;
  console.log = (...args) => {
    calls.push(args.join(' '));
  };
  try {
    return { result: fn(), calls };
  } finally {
    console.log = original;
  }
}

let tmpDir;

test.before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'credentials-test-'));
});

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('备份文件路径 = 部署包根目录 + DEPLOY-PASSWORDS.txt', () => {
  assert.equal(path.basename(credentialFilePath()), CREDENTIAL_FILE_NAME);
  assert.equal(
    credentialFilePath(),
    path.join(path.dirname(credentialFilePath()), CREDENTIAL_FILE_NAME)
  );
});

test('formatDateTime 输出本地时区 YYYY-MM-DD HH:mm:ss', () => {
  assert.equal(
    formatDateTime(new Date(2026, 9, 1, 8, 30, 5)),
    '2026-10-01 08:30:05'
  );
});

test('buildCredentialItems：全量条目 + 默认值兜底', () => {
  const items = buildCredentialItems(
    {
      DB_PASSWORD: 'db-123',
      REDIS_PASSWORD: 'redis-456',
      INITIAL_ADMIN_PASSWORD: 'admin-789',
    },
    {
      INITIAL_ADMIN_USERNAME: 'boss',
      DB_HOST: 'db.internal',
      DB_PORT: '5433',
      DB_DATABASE: 'cad',
      DB_USERNAME: 'app',
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      FRONTEND_PORT: '8080',
      CONFIG_SERVICE_PORT: '3003',
    }
  );

  assert.deepEqual(
    items.map((i) => i.label),
    [
      '管理员账号',
      '管理员密码',
      '数据库',
      '数据库密码',
      'Redis',
      'Redis 密码',
      '管理员登录',
      '配置中心',
    ]
  );
  assert.equal(items[0].value, 'boss');
  assert.equal(items[3].value, 'db-123');
  assert.equal(items[5].value, 'redis-456');
  assert.equal(items[2].value, 'db.internal:5433/cad（用户 app）');
  assert.equal(items[6].value, 'http://localhost:8080/admin-login');
  assert.equal(items[7].value, 'http://localhost:3003');
});

test('buildCredentialItems：空 .env 走默认值，Redis 空值 = 无密码而非缺失', () => {
  const items = buildCredentialItems(
    { DB_PASSWORD: 'x', INITIAL_ADMIN_PASSWORD: 'y' },
    {}
  );
  const byLabel = Object.fromEntries(items.map((i) => [i.label, i.value]));

  assert.equal(byLabel['管理员账号'], 'admin');
  assert.equal(byLabel['数据库'], 'localhost:5432/cloudcad（用户 postgres）');
  assert.equal(byLabel['Redis'], 'localhost:6379');
  // 空字符串在这里代表「无密码部署」，必须保留而不是被过滤成一行空值
  assert.equal(byLabel['Redis 密码'], '无密码');
  assert.ok(byLabel['管理员登录'].startsWith('http://localhost:'));
});

test('buildCredentialItems：无值的密码项跳过，不打印空密码', () => {
  const items = buildCredentialItems(
    { DB_PASSWORD: 'db-only', REDIS_PASSWORD: '' },
    {}
  );
  const labels = items.map((i) => i.label);

  assert.ok(!labels.includes('管理员密码'), '管理员密码缺失时不应出现该条目');
  assert.ok(labels.includes('数据库密码'));
});

test('formatCredentialFile：结构 + 中文标签按显示宽度对齐', () => {
  const content = formatCredentialFile(
    [
      { label: '数据库密码', value: '1234567890' },
      { label: 'Redis 密码', value: '9876543210' },
    ],
    { generatedAt: '2026-10-01 08:30:00' }
  );

  const expected = [
    TOP_LINE,
    `  ${PRODUCT_NAME} 首次部署凭据`,
    '  生成时间：2026-10-01 08:30:00',
    TOP_LINE,
    '',
    '  数据库密码  1234567890',
    '  Redis 密码  9876543210',
    '',
    MID_LINE,
    '  ⚠ 重要提醒',
    ...REMINDER_LINES,
    MID_LINE,
    '',
  ].join('\n');

  assert.equal(content, expected);
});

test('saveCredentialBackup：写入临时目录，内容含三项密码，并提示已保存', () => {
  const target = path.join(tmpDir, 'case1.txt');
  const { result, calls } = captureConsole(() =>
    saveCredentialBackup(
      {
        DB_PASSWORD: 'db-secret',
        REDIS_PASSWORD: 'redis-secret',
        INITIAL_ADMIN_PASSWORD: 'admin-secret',
      },
      {},
      { filePath: target }
    )
  );

  assert.equal(result.ok, true);
  assert.equal(result.path, target);
  const written = fs.readFileSync(target, 'utf8');
  assert.ok(written.includes('db-secret'));
  assert.ok(written.includes('redis-secret'));
  assert.ok(written.includes('admin-secret'));
  assert.ok(written.includes('⚠ 重要提醒'));
  assert.ok(
    calls.some(
      (line) => line.includes('凭据备份已保存') && line.includes(target)
    )
  );
});

test('saveCredentialBackup：非 Windows 落盘后收窄为 600', () => {
  if (process.platform === 'win32') return;
  const target = path.join(tmpDir, 'case-perm.txt');
  captureConsole(() =>
    saveCredentialBackup({ DB_PASSWORD: 'x' }, {}, { filePath: target })
  );
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
});

test('saveCredentialBackup：重复调用覆盖旧内容（内容为当前生效配置的全量快照）', () => {
  const target = path.join(tmpDir, 'case-overwrite.txt');
  captureConsole(() =>
    saveCredentialBackup({ DB_PASSWORD: 'old' }, {}, { filePath: target })
  );
  captureConsole(() =>
    saveCredentialBackup({ DB_PASSWORD: 'new' }, {}, { filePath: target })
  );

  const written = fs.readFileSync(target, 'utf8');
  assert.ok(written.includes('new'));
  assert.ok(!written.includes('old'));
});

test('saveCredentialBackup：目标路径不可写时只告警不抛错', () => {
  const blocker = path.join(tmpDir, 'blocker');
  fs.writeFileSync(blocker, 'i am a file, not a directory');
  const target = path.join(blocker, 'case-fail.txt');

  const { result, calls } = captureConsole(() =>
    saveCredentialBackup({ DB_PASSWORD: 'x' }, {}, { filePath: target })
  );

  assert.equal(result.ok, false);
  assert.equal(result.path, target);
  assert.ok(calls.some((line) => line.includes('凭据备份写入失败')));
  assert.ok(!fs.existsSync(target));
});

test('saveCredentialBackup：Redis 无密码部署时写明「无密码」而非留空或漏行', () => {
  const target = path.join(tmpDir, 'case-nopass.txt');
  captureConsole(() => saveCredentialBackup({}, {}, { filePath: target }));

  const written = fs.readFileSync(target, 'utf8');
  assert.ok(
    written.split('\n').some((line) => line.trim() === 'Redis 密码  无密码'),
    'Redis 密码为空必须落成可见的「无密码」'
  );
  // 连接与登录信息取默认值，仍可用于找回部署拓扑
  assert.ok(written.includes('localhost:5432/cloudcad'));
  assert.ok(written.includes('localhost:6379'));
  assert.ok(written.includes('⚠ 重要提醒'));
});
