/**
 * redis-log-rotation 回归测试（node:test，0 外部依赖）
 *
 * 锁定 #472 的契约：
 * - redis.log 有界：超阈值轮转为日期戳文件，轮转文件按 LOG_RETENTION_DAYS 清理
 * - 空/缺失的当前文件不会被误轮转也不会被误删（空文件说明 Redis 没在写）
 * - 轮转发生在 Redis 启动前，本测试不启动 redis-server
 *
 * 运行：node --test runtime/scripts/lib/redis-log-rotation.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_ROTATE_BYTES,
  logBaseName,
  rotatedName,
  isRotatedLog,
  expiredRotatedLogs,
  getRetentionDays,
  rotateAndPrune,
} = require('./redis-log-rotation');

const DAY = 86400000;

test('isRotatedLog 只认日期戳产物', () => {
  assert.equal(isRotatedLog('redis-2026-10-20.log', 'redis'), true);
  assert.equal(isRotatedLog('redis-2026-10-20-153000.log', 'redis'), true);
  assert.equal(isRotatedLog('redis.log', 'redis'), false);
  assert.equal(isRotatedLog('postgres.log', 'redis'), false);
  // 形态校验不做日历合法性判断：非法日期也会匹配，但清理阶段按
  // Number.isFinite 拦下不会删（宁可不删，也不删不认识的）
  assert.equal(isRotatedLog('redis-2026-13-40.log', 'redis'), true);
});

test('isRotatedLog 对含正则元字符的 base 名不会误判', () => {
  assert.equal(isRotatedLog('a.b-2026-01-02.log', 'a.b'), true);
  assert.equal(isRotatedLog('axb-2026-01-02.log', 'a.b'), false);
});

test('logBaseName 剥掉 .log 后缀，与 app-YYYY-MM-DD.log 同构', () => {
  assert.equal(logBaseName('/data/logs/redis.log'), 'redis');
  assert.equal(logBaseName('redis.log'), 'redis');
  assert.equal(logBaseName('/data/logs/app.log'), 'app');
});

test('rotatedName 普通形态与同日碰撞形态', () => {
  assert.equal(rotatedName('redis', '2026-10-20'), 'redis-2026-10-20.log');
  assert.equal(
    rotatedName('redis', '2026-10-20', '153000'),
    'redis-2026-10-20-153000.log',
  );
});

test('expiredRotatedLogs 按保留期筛出过期文件，边界当天保留', () => {
  // now 对齐午夜，边界干净：180 天前当天保留、181 天起删除
  const now = new Date('2026-10-20T00:00:00');
  const names = [
    'redis.log',
    'redis-2026-10-20.log', // 当天
    'redis-2026-04-23.log', // 正好 180 天前 → 边界保留
    'redis-2026-04-22.log', // 181 天前 → 删
    'redis-2026-04-22-101500.log',
    'postgres.log',
  ];
  assert.deepEqual(
    expiredRotatedLogs(names, 'redis', 180, now),
    ['redis-2026-04-22.log', 'redis-2026-04-22-101500.log'],
  );
});

test('getRetentionDays 用 LOG_RETENTION_DAYS，非法值回落默认 180', () => {
  assert.equal(getRetentionDays({}), DEFAULT_RETENTION_DAYS);
  assert.equal(DEFAULT_RETENTION_DAYS, 180);
  assert.equal(getRetentionDays({ LOG_RETENTION_DAYS: '30' }), 30);
  assert.equal(getRetentionDays({ LOG_RETENTION_DAYS: 'abc' }), 180);
  assert.equal(getRetentionDays({ LOG_RETENTION_DAYS: '0' }), 180);
});

test('DEFAULT_ROTATE_BYTES 是有限正数（安全门存在，不是无限增长）', () => {
  assert.ok(Number.isFinite(DEFAULT_ROTATE_BYTES) && DEFAULT_ROTATE_BYTES > 0);
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'redis-rot-'));
}

test('未超阈值的当前文件原样保留', () => {
  const dir = tmpDir();
  const logFile = path.join(dir, 'redis.log');
  fs.writeFileSync(logFile, 'line\n');
  const r = rotateAndPrune({ logFile, retentionDays: 180 });
  assert.equal(r.rotated, null);
  assert.equal(fs.existsSync(logFile), true);
  assert.equal(fs.readFileSync(logFile, 'utf8'), 'line\n');
});

test('超阈值时轮转为日期戳文件，原路径让给新文件', () => {
  const dir = tmpDir();
  const logFile = path.join(dir, 'redis.log');
  fs.writeFileSync(logFile, 'x'.repeat(DEFAULT_ROTATE_BYTES + 1));
  const r = rotateAndPrune({
    logFile,
    retentionDays: 180,
    now: new Date('2026-10-20T09:00:00'),
  });
  assert.equal(r.rotated, 'redis-2026-10-20.log');
  assert.equal(fs.existsSync(logFile), false);
  assert.equal(
    fs.readFileSync(path.join(dir, r.rotated), 'utf8').length,
    DEFAULT_ROTATE_BYTES + 1,
  );
});

test('空当前文件不轮转也不删除（空文件说明 Redis 没在写）', () => {
  const dir = tmpDir();
  const logFile = path.join(dir, 'redis.log');
  fs.writeFileSync(logFile, '');
  const r = rotateAndPrune({ logFile, retentionDays: 180, now: new Date('2026-10-20T09:00:00') });
  assert.equal(r.rotated, null);
  assert.deepEqual(r.deleted, []);
  assert.equal(fs.existsSync(logFile), true);
});

test('当前文件不存在时不轮转，但仍做过期清理', () => {
  const dir = tmpDir();
  const logFile = path.join(dir, 'redis.log');
  fs.writeFileSync(path.join(dir, 'redis-2025-01-01.log'), 'old');
  const r = rotateAndPrune({
    logFile,
    retentionDays: 180,
    now: new Date('2026-10-20T09:00:00'),
  });
  assert.equal(r.rotated, null);
  assert.deepEqual(r.deleted, ['redis-2025-01-01.log']);
  assert.equal(fs.existsSync(path.join(dir, 'redis-2025-01-01.log')), false);
});

test('同日多次轮转不覆盖：降级到秒级后缀', () => {
  const dir = tmpDir();
  const logFile = path.join(dir, 'redis.log');
  fs.writeFileSync(path.join(dir, 'redis-2026-10-20.log'), 'first');
  fs.writeFileSync(logFile, 'x'.repeat(DEFAULT_ROTATE_BYTES + 1));
  const r = rotateAndPrune({
    logFile,
    retentionDays: 180,
    now: new Date('2026-10-20T09:30:00'),
  });
  assert.equal(r.rotated, 'redis-2026-10-20-093000.log');
  assert.equal(fs.readFileSync(path.join(dir, 'redis-2026-10-20.log'), 'utf8'), 'first');
  assert.equal(fs.existsSync(logFile), false);
});

test('清理按保留期而非 mtime，未过期轮转文件保留', () => {
  const dir = tmpDir();
  const logFile = path.join(dir, 'redis.log');
  fs.writeFileSync(logFile, 'cur');
  fs.writeFileSync(path.join(dir, 'redis-2026-10-01.log'), 'recent');
  fs.writeFileSync(path.join(dir, 'redis-2025-01-01.log'), 'ancient');
  const r = rotateAndPrune({
    logFile,
    retentionDays: 180,
    now: new Date('2026-10-20T09:00:00'),
  });
  assert.deepEqual(r.deleted, ['redis-2025-01-01.log']);
  assert.equal(fs.existsSync(path.join(dir, 'redis-2026-10-01.log')), true);
});
