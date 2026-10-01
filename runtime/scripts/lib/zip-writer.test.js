/**
 * zip-writer 回归测试（node:test，0 外部依赖）
 *
 * 零依赖 ZIP 打包器是「日志中心打包」的底座（ADR-0071），离线部署环境没有
 * unzip/7z 可依赖，测试用内置 zlib.inflateRawSync 对产物做完整往返解压验证：
 * - 本地文件头逐字段解析 → inflate → 与原始内容逐字节一致
 * - EOCD 条目数与 central directory 偏移一致（Windows 资源管理器依赖）
 * - 边界：空文件、中文名（UTF-8 标志）、多目录前缀、拒绝空 entries
 *
 * 运行：node --test runtime/scripts/lib/zip-writer.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { createZip, crc32 } = require('./zip-writer');

/** 顺序解析本地文件头并解压，返回 [{name, content}]（信任我们自产的 csize/usize 字段） */
function parseZipEntries(buf) {
  const entries = [];
  let offset = 0;
  for (;;) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // 到 central directory 为止
    const method = buf.readUInt16LE(offset + 8);
    const csize = buf.readUInt32LE(offset + 18);
    const usize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const data = buf.slice(
      offset + 30 + nameLen + extraLen,
      offset + 30 + nameLen + extraLen + csize
    );
    assert.equal(method, 8, '统一 deflate（method=8）');
    const content = method === 8 ? zlib.inflateRawSync(data) : data;
    assert.equal(content.length, usize, `条目 ${name} 解压后长度一致`);
    entries.push({ name, content });
    offset += 30 + nameLen + extraLen + csize;
  }
  return entries;
}

function parseEocd(buf) {
  const idx = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(idx !== -1, '存在 EOCD 签名');
  return {
    entryCount: buf.readUInt16LE(idx + 10),
    cdSize: buf.readUInt32LE(idx + 12),
    cdOffset: buf.readUInt32LE(idx + 16),
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zip-writer-test-'));
}

test('crc32 已知值（IEEE 802.3 标准校验串）', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('多文件 zip 往返解压逐字节一致（含中文文件名/空文件/子目录前缀）', () => {
  const out = path.join(tmpDir(), 'out.zip');
  const bigText = '部署日志行\n'.repeat(5000); // 重复内容压缩率可观
  const entries = [
    { name: 'pm2/backend-out.log', data: Buffer.from(bigText, 'utf8') },
    { name: 'pm2/backend-error.log', data: Buffer.from('ERROR x', 'utf8') },
    { name: 'postgres/postgres.log', data: Buffer.alloc(0) }, // 空文件
    { name: 'backend/app-2026-10-01.log', data: Buffer.from('中文内容日志', 'utf8') },
  ];
  const { count, zipSize } = createZip(entries, out);

  const buf = fs.readFileSync(out);
  assert.equal(count, 4);
  assert.ok(zipSize > 0 && zipSize < bigText.length, 'deflate 后小于原始体积');

  const eocd = parseEocd(buf);
  assert.equal(eocd.entryCount, 4);
  // central directory 紧跟全部 local 条目之后：EOCD 前正好 cdSize 字节
  assert.equal(eocd.cdOffset + eocd.cdSize, buf.length - 22);

  const parsed = parseZipEntries(buf);
  assert.deepEqual(
    parsed.map((e) => e.name),
    entries.map((e) => e.name)
  );
  for (let i = 0; i < entries.length; i++) {
    assert.ok(parsed[i].content.equals(entries[i].data), `条目 ${entries[i].name} 内容一致`);
  }
});

test('mtime 写入 DOS 时间（2 秒精度，2026 年内往返）', () => {
  const out = path.join(tmpDir(), 'out.zip');
  const mtime = new Date(2026, 9, 1, 12, 30, 28);
  createZip([{ name: 'a.log', data: Buffer.from('x'), mtime }], out);
  const buf = fs.readFileSync(out);
  const dosDate = buf.readUInt16LE(12); // local header: mod date
  const dosTime = buf.readUInt16LE(10);
  const year = 1980 + (dosDate >> 9);
  const month = (dosDate >> 5) & 0xf;
  const day = dosDate & 0x1f;
  const hour = dosTime >> 11;
  const minute = (dosTime >> 5) & 0x3f;
  assert.equal(`${year}-${month}-${day}`, '2026-10-1');
  assert.equal(hour, 12);
  assert.equal(minute, 30);
});

test('拒绝空 entries；条目名缺失报错', () => {
  const out = path.join(tmpDir(), 'out.zip');
  assert.throws(() => createZip([], out), /entries 为空/);
  assert.throws(
    () => createZip([{ name: '', data: Buffer.from('x') }], out),
    /条目名为空/
  );
});

test('同名条目不去重（调用方 log-center 已按 slug 隔离）——两个同名条目都能往返', () => {
  const out = path.join(tmpDir(), 'out.zip');
  createZip(
    [
      { name: 'a/app.log', data: Buffer.from('one') },
      { name: 'b/app.log', data: Buffer.from('two') },
    ],
    out
  );
  const parsed = parseZipEntries(fs.readFileSync(out));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].content.toString(), 'one');
  assert.equal(parsed[1].content.toString(), 'two');
});
