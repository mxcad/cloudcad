'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = path.join(os.tmpdir(), `storage-files-${Date.now()}`);
fs.mkdirSync(dataDir, { recursive: true });
process.env.FILES_DATA_PATH = dataDir;

const FileHandler = require('../services/file-handler');

describe('FileHandler', () => {
  let handler;

  before(() => {
    handler = new FileHandler();
  });

  after(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('should write and read a file', async () => {
    await handler.write('202607/node1/a.dwg', Buffer.from('dwg-data'));

    const data = await handler.read('202607/node1/a.dwg');
    assert.equal(data.toString(), 'dwg-data');
  });

  it('should report existence', async () => {
    assert.equal(await handler.exists('202607/node1/a.dwg'), true);
    assert.equal(await handler.exists('202607/node1/missing.dwg'), false);
  });

  it('should delete a file', async () => {
    await handler.write('202607/node1/tmp.dwg', Buffer.from('x'));
    await handler.delete('202607/node1/tmp.dwg');

    assert.equal(await handler.exists('202607/node1/tmp.dwg'), false);
  });

  it('should reject a missing file read', async () => {
    await assert.rejects(() => handler.read('202607/node1/nope.dwg'));
  });

  it('should confine paths inside FILES_DATA_PATH (traversal guard)', () => {
    const resolved = handler._resolvePath('../../../etc/passwd');
    assert.ok(resolved.startsWith(path.resolve(dataDir)));
    assert.ok(!resolved.includes('..'));
  });

  it('should reject an absolute path escaping to a prefix-sibling directory', () => {
    // base 的同名前缀兄弟目录：裸 startsWith(base) 会误放行（前缀匹配成立），
    // 补 + path.sep 后绝对路径落到兄弟目录必须被拒绝。
    const siblingDir = path.resolve(dataDir) + '-evil';
    const evilPath = path.join(siblingDir, 'foo.txt');
    assert.ok(evilPath.startsWith(path.resolve(dataDir))); // 证明前缀匹配成立（缺陷前提）
    assert.throws(() => handler._resolvePath(evilPath), /Path traversal/);
  });

  it('should serve hot files from cache', async () => {
    const beforeStats = handler.getCacheStats();
    await handler.read('202607/node1/a.dwg'); // miss (or hit from prior)
    const afterStats = handler.getCacheStats();
    assert.equal(afterStats.hits, beforeStats.hits + 1);
  });

  it('should stream files', async () => {
    const stream = handler.readStream('202607/node1/a.dwg');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), 'dwg-data');
  });

  it('should write via stream', async () => {
    const { Readable } = require('stream');
    const stream = Readable.from([Buffer.from('streamed')]);
    await handler.writeStream('202607/node1/s.dwg', stream);

    assert.equal((await handler.read('202607/node1/s.dwg')).toString(), 'streamed');
  });
});
