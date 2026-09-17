import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RedisClient from '../lib/redis-client';
import { startMockRedis, simple } from '../test-utils/mock-redis';

describe('RedisClient (最小 RESP 客户端)', () => {
  let mock: Awaited<ReturnType<typeof startMockRedis>>;
  let client: RedisClient | null;

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
    assert.equal(String(pong), 'PONG');
  });

  it('HSET/HGET/HGETALL/HDEL 往返与整数回复', async () => {
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`);
    await client.connect(2000);
    await client.command(['HSET', 'k', 'f1', 'v1']);
    await client.command(['HSET', 'k', 'f2', 'v2']);
    const got = await client.command(['HGET', 'k', 'f1']);
    assert.equal(String(got), 'v1');
    const all = await client.command(['HGETALL', 'k']);
    assert.deepEqual((all as Buffer[]).map((b) => String(b)), ['f1', 'v1', 'f2', 'v2']);
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
    assert.deepEqual((all as Buffer[]).map((b) => String(b)), ['a', '1', 'b', '22']);
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
      () => client!.command(['HSET', 'k', 'f', 'v']),
      /wrong number/,
    );
  });

  it('带密码 URL 先 AUTH 再 PING（requirepass 场景，回归 NOAUTH）', async () => {
    mock.server.close();
    let authenticated = false;
    let authSent = false;
    mock = await startMockRedis({
      custom: (args) => {
        const cmd = String(args[0]).toUpperCase();
        if (cmd === 'AUTH') {
          authSent = true;
          if (String(args[1]) === 'secret123') {
            authenticated = true;
            return simple('OK');
          }
          return Buffer.from('-WRONGPASS invalid password\r\n');
        }
        if (!authenticated) return Buffer.from('-NOAUTH Authentication required.\r\n');
        return null;
      },
    });
    client = new RedisClient(`redis://:secret123@127.0.0.1:${mock.port}`);
    await client.connect(2000);
    assert.ok(authSent, '应在 PING 前发送 AUTH');
    const pong = await client.command(['PING']);
    assert.equal(String(pong), 'PONG');
  });

  it('无密码 URL 不发 AUTH（向后兼容）', async () => {
    mock.server.close();
    let authSent = false;
    mock = await startMockRedis({
      custom: (args) => {
        if (String(args[0]).toUpperCase() === 'AUTH') {
          authSent = true;
          return simple('OK');
        }
        return null;
      },
    });
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`);
    await client.connect(2000);
    assert.equal(authSent, false, '无密码时不应发送 AUTH');
    const pong = await client.command(['PING']);
    assert.equal(String(pong), 'PONG');
  });

  it('密码错误时 connect reject', async () => {
    mock.server.close();
    mock = await startMockRedis({
      custom: (args) =>
        String(args[0]).toUpperCase() === 'AUTH'
          ? Buffer.from('-WRONGPASS invalid password\r\n')
          : null,
    });
    client = new RedisClient(`redis://:wrongpass@127.0.0.1:${mock.port}`);
    await assert.rejects(() => client!.connect(2000));
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

describe('RedisClient 自动重连（S3-1）', () => {
  let mock: Awaited<ReturnType<typeof startMockRedis>>;
  let client: RedisClient | null;

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

  function waitUntil(predicate: () => boolean, timeout = 3000, interval = 10): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (predicate()) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(new Error('waitUntil timeout'));
        }
      }, interval);
    });
  }

  it('瞬时断连后自动重连（指数退避），重连后可继续 command', async () => {
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`, {
      reconnectBaseDelayMs: 20,
      reconnectMaxDelayMs: 100,
    });
    await client.connect(2000);
    assert.equal(String(await client.command(['PING'])), 'PONG');
    assert.equal(client.isConnected(), true);

    // 模拟瞬时断连：销毁服务端 socket
    for (const s of mock.sockets) s.destroy();

    // 等待客户端重连成功
    await waitUntil(() => client!.isConnected());
    // 重连后可继续发命令
    assert.equal(String(await client.command(['PING'])), 'PONG');
  });

  it('close() 停止自动重连（_closed 后不再重连）', async () => {
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`, { reconnectBaseDelayMs: 20 });
    await client.connect(2000);
    client.close();
    assert.equal(client.isConnected(), false);
    // close 后即使等待也不应重连
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(client.isConnected(), false);
  });

  it('autoReconnect=false 时断连不重连', async () => {
    client = new RedisClient(`redis://127.0.0.1:${mock.port}`, { autoReconnect: false });
    await client.connect(2000);
    for (const s of mock.sockets) s.destroy();
    // autoReconnect=false：断连后不重连，isConnected 恒 false
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(client.isConnected(), false);
  });
});
