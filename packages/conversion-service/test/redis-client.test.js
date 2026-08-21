'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const RedisClient = require('../lib/redis-client');
const { startMockRedis } = require('../test-utils/mock-redis');

describe('RedisClient (最小 RESP 客户端)', () => {
  let mock;
  let client;

  beforeEach(async () => {
    mock = await startMockRedis();
  });

  afterEach(async () => {
    if (client) {
      client.close();
      client = null;
    }
    await new Promise((r) => mock.server.close(r));
  });

  it('PING 往返返回 PONG', async () => {
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`);
    await client.connect(2000);
    const pong = await client.command(['PING']);
    assert.equal(pong.toString(), 'PONG');
  });

  it('HSET/HGET/HGETALL/HDEL 往返与整数回复', async () => {
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`);
    await client.connect(2000);
    await client.command(['HSET', 'k', 'f1', 'v1']);
    await client.command(['HSET', 'k', 'f2', 'v2']);
    const got = await client.command(['HGET', 'k', 'f1']);
    assert.equal(got.toString(), 'v1');
    const all = await client.command(['HGETALL', 'k']);
    assert.deepEqual(all.map((b) => b.toString()), ['f1', 'v1', 'f2', 'v2']);
    const missing = await client.command(['HGET', 'k', 'nope']);
    assert.equal(missing, null);
    const del = await client.command(['HDEL', 'k', 'f1']);
    assert.equal(del, 1);
  });

  it('HGETALL 对不存在 key 返回空数组', async () => {
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`);
    await client.connect(2000);
    const all = await client.command(['HGETALL', 'nokey']);
    assert.deepEqual(all, []);
  });

  it('回复被分片时仍能正确解析', async () => {
    mock.server.close();
    mock = await startMockRedis({ chunkSize: 2 });
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`);
    await client.connect(2000);
    await client.command(['HSET', 'k', 'a', '1']);
    await client.command(['HSET', 'k', 'b', '22']);
    const all = await client.command(['HGETALL', 'k']);
    assert.deepEqual(all.map((b) => b.toString()), ['a', '1', 'b', '22']);
  });

  it('-ERR 回复以 RedisError reject', async () => {
    mock.server.close();
    mock = await startMockRedis({
      custom: (args) => {
        if (String(args[0]).toUpperCase() === 'HSET') {
          return Buffer.from('-ERR wrong number of arguments\r\n');
        }
        return null;
      },
    });
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`);
    await client.connect(2000);
    await assert.rejects(
      () => client.command(['HSET', 'k', 'f', 'v']),
      /wrong number/,
    );
  });

  it('连接失败时 connect reject', async () => {
    const c = new RedisClient('redis://127.0.0.1:1');
    await assert.rejects(() => c.connect(500));
  });

  it('未连接时 command reject', async () => {
    const c = new RedisClient(`redis://127.0.0.1:${mock.port}`);
    await assert.rejects(() => c.command(['PING']), /未连接/);
    c.close();
  });
});
