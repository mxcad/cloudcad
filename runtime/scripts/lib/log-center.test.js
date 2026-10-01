/**
 * log-center 回归测试（node:test，0 外部依赖）
 *
 * 日志位置清单是 CLI 与运维中心（ADR-0071）共用的单一事实源，测试锁定：
 * - collectLogFiles：LOG_SOURCES 全覆盖、zipName 按 slug 隔离同名文件、
 *   --days N 只收最近 N 天有修改的文件
 * - listLogLocations：不存在的目录 exists=false 不算错误
 * - bundleLogs：产物落 zip、days 过滤生效、无文件时 ok=false
 *
 * 运行：node --test runtime/scripts/lib/log-center.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const {
  LOG_SOURCES,
  collectLogFiles,
  listLogLocations,
  bundleLogs,
} = require('./log-center');
const { crc32 } = require('./zip-writer');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'log-center-test-'));
}

function touch(rootDir, rel, content, mtime) {
  const abs = path.join(rootDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  if (mtime) fs.utimesSync(abs, mtime, mtime);
  return abs;
}

/** 从产物 zip 解出 [{name, content}]（复用 zip-writer 的结构约定） */
function readZipEntries(buf) {
  const entries = [];
  let offset = 0;
  for (;;) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const csize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const data = buf.slice(
      offset + 30 + nameLen + extraLen,
      offset + 30 + nameLen + extraLen + csize
    );
    entries.push({ name, content: zlib.inflateRawSync(data) });
    offset += 30 + nameLen + extraLen + csize;
  }
  return entries;
}

test('LOG_SOURCES 覆盖调研确认的全部日志源，slug 唯一', () => {
  const slugs = LOG_SOURCES.map((s) => s.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'slug 不得重复');
  const dirs = LOG_SOURCES.map((s) => s.dir);
  for (const must of [
    path.join('data', 'pm2', 'logs'),
    path.join('data', 'logs', 'backend'),
    path.join('data', 'logs', 'conversion-service'),
    path.join('data', 'logs', 'config-service'),
    path.join('data', 'logs', 'deploy'),
    path.join('data', 'ops-log'),
  ]) {
    assert.ok(dirs.includes(must), `LOG_SOURCES 应含 ${must}`);
  }
  // data/logs 根只收 postgres.log，子目录由独立条目覆盖（防重复打包）
  const logsRoot = LOG_SOURCES.find((s) => s.dir === path.join('data', 'logs'));
  assert.ok(logsRoot, 'data/logs 根目录条目存在（postgres.log）');
});

test('collectLogFiles：全源收集 + zipName 按 slug 隔离同名文件', () => {
  const root = tmpRoot();
  touch(root, 'data/pm2/logs/backend-out.log', 'pm2 log');
  touch(root, 'data/logs/postgres.log', 'pg log');
  touch(root, 'data/logs/backend/app-2026-10-01.log', 'backend app');
  touch(root, 'data/logs/conversion-service/app-2026-10-01.log', 'conv app');
  touch(root, 'data/logs/config-service/app-2026-10-01.log', 'config app');
  touch(root, 'data/ops-log/202610.ops.log', 'ops');

  const files = collectLogFiles({ rootDir: root });
  const names = files.map((f) => f.zipName).sort();
  assert.deepEqual(names, [
    'backend/app-2026-10-01.log',
    'config-service/app-2026-10-01.log',
    'conversion/app-2026-10-01.log',
    'ops/202610.ops.log',
    'pm2/backend-out.log',
    'postgres/postgres.log',
  ]);

  // 非 .log 文件与子目录不收
  touch(root, 'data/pm2/logs/not-a-log.txt', 'skip');
  touch(root, 'data/logs/backend/subdir/nested.log', 'skip');
  const again = collectLogFiles({ rootDir: root });
  assert.equal(again.length, 6, '仅平铺 .log 文件入清单');
});

test('collectLogFiles：days 过滤只收最近 N 天内有修改的文件', () => {
  const root = tmpRoot();
  const now = new Date();
  const old = new Date(now.getTime() - 10 * 24 * 3600 * 1000);
  touch(root, 'data/logs/backend/fresh.log', 'fresh', now);
  touch(root, 'data/logs/backend/stale.log', 'stale', old);

  assert.equal(collectLogFiles({ rootDir: root, days: 7 }).length, 1);
  assert.deepEqual(
    collectLogFiles({ rootDir: root, days: 7 }).map((f) => path.basename(f.absPath)),
    ['fresh.log']
  );
  assert.equal(collectLogFiles({ rootDir: root, days: 0 }).length, 2, 'days=0 收全部');
  assert.equal(collectLogFiles({ rootDir: root }).length, 2, '缺省收全部');
});

test('listLogLocations：缺失目录 exists=false，存在目录给出文件明细', () => {
  const root = tmpRoot();
  touch(root, 'data/logs/backend/app.log', 'x');

  const groups = listLogLocations({ rootDir: root });
  const backend = groups.find((g) => g.dir.endsWith('backend'));
  assert.ok(backend.exists && backend.files.length === 1);
  assert.equal(backend.files[0].name, 'app.log');
  assert.ok(/\d/.test(backend.files[0].sizeText), 'sizeText 已格式化');
  assert.ok(/\d{4}-\d{2}-\d{2}/.test(backend.files[0].mtimeText), 'mtimeText 已格式化');

  const missing = groups.filter((g) => !g.exists);
  assert.ok(missing.length > 0, '未创建的源 exists=false');
  assert.ok(missing.every((g) => g.files.length === 0));
});

test('bundleLogs：默认落 data/log-bundles、产物为合法 zip、内容与磁盘一致', () => {
  const root = tmpRoot();
  touch(root, 'data/pm2/logs/backend-error.log', 'boom');
  touch(root, 'data/ops-log/202610.ops.log', 'start deploy');

  const result = bundleLogs({ rootDir: root });
  assert.equal(result.ok, true);
  assert.equal(result.fileCount, 2);
  assert.ok(path.isAbsolute(result.outPath), '回显绝对路径');
  // 默认去向 = <root>/data/log-bundles（与 data/backups 同族，用户可在固定位置找到）
  assert.ok(
    result.outPath.includes(path.join('data', 'log-bundles')),
    `outPath 应在 data/log-bundles: ${result.outPath}`
  );
  assert.ok(fs.existsSync(result.outPath));
  assert.match(path.basename(result.outPath), /^logs-\d{8}-\d{6}\.zip$/);

  const buf = fs.readFileSync(result.outPath);
  const entries = readZipEntries(buf);
  assert.deepEqual(
    entries.map((e) => e.name).sort(),
    ['ops/202610.ops.log', 'pm2/backend-error.log']
  );
  assert.equal(entries[0].content.toString(), 'boom');

  // skipped 报告缺失目录（相对路径），不算错误
  assert.ok(result.skipped.includes(path.join('data', 'logs', 'deploy')));
});

test('bundleLogs：days 过滤传导到产物；无文件时 ok=false', () => {
  const root = tmpRoot();
  const now = new Date();
  const old = new Date(now.getTime() - 10 * 24 * 3600 * 1000);
  touch(root, 'data/logs/backend/fresh.log', 'f', now);
  touch(root, 'data/logs/backend/stale.log', 's', old);

  const filtered = bundleLogs({ rootDir: root, outDir: path.join(root, 'b1'), days: 7 });
  assert.equal(filtered.fileCount, 1);

  const empty = bundleLogs({ rootDir: tmpRoot(), outDir: path.join(root, 'b2') });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'no-files');
  assert.ok(!fs.existsSync(path.join(root, 'b2')), '无文件时不落 zip');
});
