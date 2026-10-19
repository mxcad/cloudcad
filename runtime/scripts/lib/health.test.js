/**
 * health.js 就绪探测回归测试（node:test，0 外部依赖，不需要真实数据库）
 *
 * 锁定的核心缺陷：waitForPort 只做裸 TCP 连接，而 PostgreSQL 先开监听 socket
 * 再重放 WAL，重放期间会 accept 连接并立刻回 `FATAL: the database system is
 * starting up`——端口通连 ≠ 可接受查询，部署包里 CREATE DATABASE 因此失败并
 * 中止。本测试用假服务器模拟这条时间窗：端口开着、协议层回 57P03，
 * checkDatabaseOnce 必须判 false。
 *
 * 运行：node --test runtime/scripts/lib/health.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const net = require('net');

const {
  getPgIsReadyPath,
  checkDatabaseOnce,
  waitForDatabase,
  checkRedisOnce,
  waitForRedis,
} = require('./health');

// libpq 对「连接被拒绝」有自己的重试退避（本机实测约 2s）。测试里调短，
// 不改变被测行为（本机 127.0.0.1 连正常服务器都是几十毫秒）。
process.env.PGCONNECT_TIMEOUT = '1';

/**
 * 起一个本地假服务器。teardown 先 destroy 已有连接再 close——顺序不能反，
 * 否则 server.close 的回调要等连接自然结束，promise 永不 settle 且事件循环
 * 已排空，node:test 会报 "Promise resolution is still pending" 并取消整个文件。
 * @param {(socket: import('net').Socket) => void} onSocket
 */
function startServer(onSocket) {
  return new Promise((resolve, reject) => {
    const sockets = [];
    const server = net.createServer((socket) => {
      sockets.push(socket);
      socket.on('error', () => {});
      onSocket(socket);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: server.address().port,
        teardown: () =>
          new Promise((done) => {
            sockets.forEach((s) => s.destroy());
            server.close(() => done());
          }),
      })
    );
  });
}

/** 取一个未被监听的端口 */
async function freePort() {
  const { port, teardown } = await startServer(() => {});
  await teardown();
  return port;
}

// ---------- 假 PostgreSQL ----------
// EDB 的 libpq 先发 8 字节 SSLRequest（magic 80877103），不回 'N' 它就永远等不到
// 真正的 startup packet，pg_isready 只能报 "no response"。
const SSL_MAGICS = [0x075bcd15, 0x04d2162f];

function pgMessage(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length + 4);
  return Buffer.concat([Buffer.from(type, 'utf8'), len, body]);
}

function pgError(sqlstate, severity, text) {
  return pgMessage(
    'E',
    Buffer.concat([
      Buffer.from('S', 'utf8'),
      Buffer.from(`${severity}\0`, 'utf8'),
      Buffer.from('V', 'utf8'),
      Buffer.from(`${sqlstate}\0`, 'utf8'),
      Buffer.from('M', 'utf8'),
      Buffer.from(`${text}\0`, 'utf8'),
      Buffer.from('\0', 'utf8'),
    ])
  );
}

const PG_READY = Buffer.concat([
  pgMessage('R', Buffer.from([0, 0, 0, 0])), // AuthenticationOk
  pgMessage('Z', Buffer.from('I', 'utf8')), // ReadyForQuery
]);

function fakePostgres(reply) {
  return startServer((socket) => {
    socket.on('data', (d) => {
      if (d.length === 8 && SSL_MAGICS.includes(d.readUInt32BE(4))) {
        socket.write('N'); // 不支持 SSL，走明文
        return;
      }
      if (reply) socket.write(reply);
    });
  });
}

// ---------- checkDatabaseOnce ----------

const HAS_PG_ISREADY = fs.existsSync(getPgIsReadyPath());

test('checkDatabaseOnce: 实例接受查询 → true（回归基准）', async (t) => {
  if (!HAS_PG_ISREADY) return t.skip('未找到 pg_isready');
  const { port, teardown } = await fakePostgres(PG_READY);
  try {
    assert.equal(await checkDatabaseOnce(port), true);
  } finally {
    await teardown();
  }
});

test('checkDatabaseOnce: WAL 重放中（端口开着但回 57P03 starting up）→ false', async (t) => {
  if (!HAS_PG_ISREADY) return t.skip('未找到 pg_isready');
  const { port, teardown } = await fakePostgres(
    pgError('57P03', 'FATAL', 'the database system is starting up')
  );
  try {
    // 端口是通的，裸 TCP 探测会误判就绪；协议级探测必须判未就绪
    assert.equal(await checkDatabaseOnce(port), false);
  } finally {
    await teardown();
  }
});

test('checkDatabaseOnce: 停机中（57P01）→ false', async (t) => {
  if (!HAS_PG_ISREADY) return t.skip('未找到 pg_isready');
  const { port, teardown } = await fakePostgres(
    pgError('57P01', 'FATAL', 'the database system is shutting down')
  );
  try {
    assert.equal(await checkDatabaseOnce(port), false);
  } finally {
    await teardown();
  }
});

test('checkDatabaseOnce: 端口未监听 → false', async () => {
  assert.equal(await checkDatabaseOnce(await freePort()), false);
});

// ---------- checkRedisOnce ----------

function fakeRedis(replies) {
  return startServer((socket) => {
    if (replies) {
      socket.write(
        Buffer.concat(replies.map((r) => Buffer.from(`${r}\r\n`, 'utf8')))
      );
    }
    socket.end();
  });
}

test('checkRedisOnce: PING 回 PONG → true', async () => {
  const { port, teardown } = await fakeRedis(['+PONG']);
  try {
    assert.equal(await checkRedisOnce(port, '127.0.0.1', 3000, ''), true);
  } finally {
    await teardown();
  }
});

test('checkRedisOnce: 加载数据集期间回 LOADING（端口开着）→ false', async () => {
  const { port, teardown } = await fakeRedis([
    '-LOADING Redis is loading the dataset in memory',
  ]);
  try {
    assert.equal(await checkRedisOnce(port, '127.0.0.1', 3000, ''), false);
  } finally {
    await teardown();
  }
});

test('checkRedisOnce: 带密码时先发 AUTH 再 PING', async () => {
  const received = [];
  const { port, teardown } = await startServer((socket) => {
    socket.on('data', (d) => {
      received.push(d.toString('utf8'));
      socket.write('+OK\r\n+PONG\r\n');
      socket.end();
    });
  });
  try {
    assert.equal(
      await checkRedisOnce(port, '127.0.0.1', 3000, 'p@ss 字'),
      true
    );
    const wire = received.join('');
    // 密码含多字节字符：长度必须是 UTF-8 字节数（8）而不是字符数（6）
    assert.match(wire, /\*2\r\n\$4\r\nAUTH\r\n\$8\r\np@ss 字\r\n/);
    assert.match(wire, /\*1\r\n\$4\r\nPING\r\n/);
  } finally {
    await teardown();
  }
});

test('checkRedisOnce: 未传密码时不发 AUTH', async () => {
  const received = [];
  const { port, teardown } = await startServer((socket) => {
    socket.on('data', (d) => {
      received.push(d.toString('utf8'));
      socket.write('+PONG\r\n');
      socket.end();
    });
  });
  try {
    assert.equal(await checkRedisOnce(port, '127.0.0.1', 3000, ''), true);
    assert.doesNotMatch(received.join(''), /AUTH/);
  } finally {
    await teardown();
  }
});

test('checkRedisOnce: 端口未监听 → false', async () => {
  assert.equal(
    await checkRedisOnce(await freePort(), '127.0.0.1', 500, ''),
    false
  );
});

// ---------- waitForRedis / waitForDatabase ----------

test('waitForRedis: 先 LOADING 后 PONG → 重试至就绪', async () => {
  let hits = 0;
  const { port, teardown } = await startServer((socket) => {
    socket.write(
      `${hits === 0 ? '-LOADING Redis is loading the dataset' : '+PONG'}\r\n`
    );
    hits += 1;
    socket.end();
  });
  try {
    const t0 = Date.now();
    assert.equal(await waitForRedis(port, 'Redis', 10000), true);
    assert.ok(hits >= 2, `期望至少重试两次，实际 ${hits} 次`);
    assert.ok(Date.now() - t0 >= 1000, '退避应至少等一个间隔');
  } finally {
    await teardown();
  }
});

test('waitForRedis: 超时 → 抛出启动超时', async () => {
  await assert.rejects(
    waitForRedis(await freePort(), 'Redis', 200),
    /Redis 启动超时/
  );
});

test('waitForDatabase: 超时 → 抛出启动超时', async () => {
  await assert.rejects(
    waitForDatabase(await freePort(), 'PostgreSQL', 200),
    /PostgreSQL 启动超时/
  );
});
