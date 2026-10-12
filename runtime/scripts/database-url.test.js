/**
 * DATABASE_URL 解析/组装回归 + 双包漂移守卫（node:test，0 外部依赖）
 *
 * 背景缺陷（ADR-0073 补完）：DATABASE_URL 是 Prisma 的权威连接来源，写侧历史上
 * 被逐字节抄了三份（setup-wizard ×2 / db-reset-password / config-service
 * system-config），回落链各自漂移。最严重的是 config-service 运维台写入器用 DB_*
 * 部件重组 URL——静默丢弃查询参数（?sslmode=disable 等）与 URL 内密码，与本包
 * infra.js「不得重组 URL」的既有决策直接矛盾：运维台改 DB_PORT 即删掉 ?sslmode=。
 *
 * 修复约定：解析/组装收敛到 lib/database-url.js 的 parseDatabaseUrl /
 * composeDatabaseUrl（唯一事实源）。config-service 是 0 依赖独立包，无法 require
 * 本文件，故在其 lib/ 保留一份逐字相同的副本；两份由本文件末尾的漂移守卫锁定
 * 行为一致（与 .env escape 字符类的三副本守卫同构，见 config-updater.test.js）。
 *
 * 运行：node --test runtime/scripts/database-url.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  parseDatabaseUrl,
  composeDatabaseUrl,
} = require('./lib/database-url');

// ==================== parseDatabaseUrl ====================

test('parseDatabaseUrl: 解析完整 URL 的各部件', () => {
  assert.deepEqual(
    parseDatabaseUrl('postgresql://app:secret@db.example.com:5433/mydb'),
    {
      host: 'db.example.com',
      port: '5433',
      user: 'app',
      password: 'secret',
      dbName: 'mydb',
    }
  );
});

test('parseDatabaseUrl: URL 编码的用户名/密码被解码', () => {
  const parsed = parseDatabaseUrl('postgresql://us%40er:p%40ss@h:5432/db');
  assert.equal(parsed.user, 'us@er');
  assert.equal(parsed.password, 'p@ss');
});

test('parseDatabaseUrl: 查询串被提取为 query（去掉前导 ?）', () => {
  const parsed = parseDatabaseUrl(
    'postgresql://app:secret@db.example.com:5433/mydb?sslmode=disable'
  );
  assert.equal(parsed.query, 'sslmode=disable');
  assert.equal(parsed.dbName, 'mydb');
});

test('parseDatabaseUrl: 空 / 非合法 URL 返回空对象', () => {
  assert.deepEqual(parseDatabaseUrl(''), {});
  assert.deepEqual(parseDatabaseUrl(undefined), {});
  assert.deepEqual(parseDatabaseUrl('not a url'), {});
});

// ==================== composeDatabaseUrl ====================

test('composeDatabaseUrl: 密码 encodeURIComponent（含 # 不被当 URL 片段截断）', () => {
  assert.equal(
    composeDatabaseUrl({
      host: 'localhost',
      port: '5432',
      user: 'postgres',
      password: 'a#b',
      dbName: 'cloudcad',
    }),
    'postgresql://postgres:a%23b@localhost:5432/cloudcad'
  );
});

test('composeDatabaseUrl: 编码 URL 保留字符（$ & / + @）', () => {
  assert.equal(
    composeDatabaseUrl({
      host: 'h',
      port: '5432',
      user: 'u',
      password: 'a$b&c/d+e@f',
      dbName: 'd',
    }),
    'postgresql://u:a%24b%26c%2Fd%2Be%40f@h:5432/d'
  );
});

test('composeDatabaseUrl: 逐字保留 query 段（缺陷修复的核心）', () => {
  assert.equal(
    composeDatabaseUrl({
      host: 'db.example.com',
      port: '5433',
      user: 'app',
      password: 'secret',
      dbName: 'mydb',
      query: 'sslmode=disable',
    }),
    'postgresql://app:secret@db.example.com:5433/mydb?sslmode=disable'
  );
});

test('composeDatabaseUrl: 无 query 时不追加 ?', () => {
  assert.equal(
    composeDatabaseUrl({
      host: 'h',
      port: '5432',
      user: 'u',
      password: 'p',
      dbName: 'd',
    }),
    'postgresql://u:p@h:5432/d'
  );
});

test('parse → compose 往返：含查询串的 URL 原样还原', () => {
  const original =
    'postgresql://app:secret@db.example.com:5433/mydb?sslmode=disable';
  assert.equal(composeDatabaseUrl(parseDatabaseUrl(original)), original);
});

// ==================== 缺陷回归：改端口不得丢查询串/密码 ====================

test('回归：仅改端口时，查询串与 URL 内密码逐字保留（不再被 DB_* 重组丢弃）', () => {
  // 模拟运维台：现有 URL 带 ?sslmode=disable 与 URL 内密码，仅变更 DB_PORT
  const env = {
    DATABASE_URL:
      'postgresql://app:realpw@db.example.com:5432/mydb?sslmode=disable',
    DB_HOST: 'localhost', // 故意与 URL 不一致：URL 权威，不得被 DB_HOST 覆盖
    DB_PORT: '5432',
    DB_USERNAME: 'postgres',
    DB_DATABASE: 'cloudcad',
    DB_PASSWORD: 'stale',
  };
  const updates = { DB_PORT: '5433' };
  const cur = parseDatabaseUrl(env.DATABASE_URL);
  const next = composeDatabaseUrl({
    host: updates.DB_HOST || cur.host || env.DB_HOST || 'localhost',
    port: updates.DB_PORT || cur.port || env.DB_PORT || '5432',
    user: updates.DB_USERNAME || cur.user || env.DB_USERNAME || 'postgres',
    password: updates.DB_PASSWORD || cur.password || env.DB_PASSWORD || 'password',
    dbName: updates.DB_DATABASE || cur.dbName || env.DB_DATABASE || 'cloudcad',
    query: cur.query,
  });
  // 端口已改，其余（含查询串与 URL 内密码）逐字保留
  assert.equal(
    next,
    'postgresql://app:realpw@db.example.com:5433/mydb?sslmode=disable'
  );
});

// ==================== 双包漂移守卫 ====================

test('漂移守卫：runtime 副本与 config-service 副本行为逐字一致', () => {
  const csPath = path.join(
    __dirname,
    '..',
    '..',
    'packages',
    'config-service',
    'lib',
    'database-url.js'
  );
  if (!fs.existsSync(csPath)) return; // 部署机无 monorepo 布局，跨包比对无从谈起
  const cs = require(csPath);

  const urls = [
    'postgresql://app:secret@db.example.com:5433/mydb',
    'postgresql://us%40er:p%40ss@h:5432/db',
    'postgresql://app:secret@db.example.com:5433/mydb?sslmode=disable',
    'postgresql://app@db.example.com/mydb',
    '',
    'not a url',
  ];
  for (const url of urls) {
    assert.deepEqual(
      cs.parseDatabaseUrl(url),
      parseDatabaseUrl(url),
      `parseDatabaseUrl 漂移: ${url}`
    );
  }

  const partSets = [
    { host: 'h', port: '5432', user: 'u', password: 'a#b', dbName: 'd' },
    {
      host: 'db.example.com',
      port: '5433',
      user: 'app',
      password: 'secret',
      dbName: 'mydb',
      query: 'sslmode=disable',
    },
    { host: 'h', port: '5432', user: 'u', password: 'a$b&c/d+e@f', dbName: 'd' },
    { host: 'h', port: '5432', user: 'u', password: '', dbName: 'd' },
  ];
  for (const parts of partSets) {
    assert.equal(
      cs.composeDatabaseUrl(parts),
      composeDatabaseUrl(parts),
      `composeDatabaseUrl 漂移: ${JSON.stringify(parts)}`
    );
  }
});
