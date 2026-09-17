/**
 * redis-takeover.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定升级路径接管语义：老无托管 redis 实例（可能无密码/密码不一致，#419）
 * 不在当前 PM2 daemon 名下时，只有"cmdline 含本部署 data/redis 目录"才确认
 * 为本部署旧实例并接管（停旧 + PM2 按 .env 密码重启）；系统自带 redis /
 * 其他部署目录 / 归属未知一律不触碰。
 *
 * 运行：node --test runtime/scripts/lib/redis-takeover.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isOurRedisInstance,
  detectRedisOwnership,
  stopRedisProcess,
  loadRedisPassword,
  loadRedisHost,
  respCommand,
  respReply,
  respRequest,
  classifyAuthReplies,
  probeRedisAuth,
  setRedisPasswordAtRuntime,
  persistRedisConfig,
} = require('./redis-takeover');

const OUR_DATA_DIR = '/srv/dev/cloudcad/data/redis';
const OUR_CMDLINE = `redis-server --port 6379 --dir ${OUR_DATA_DIR} --appendonly yes`;

// ---------- isOurRedisInstance ----------

test('cmdline 含本部署 data/redis 绝对路径 → 本部署旧实例', () => {
  assert.equal(isOurRedisInstance(OUR_CMDLINE, OUR_DATA_DIR), true);
});

test('cmdline 指向其他部署目录的 data/redis → 非本部署实例', () => {
  const foreign = 'redis-server --port 6379 --dir /other/root/data/redis';
  assert.equal(isOurRedisInstance(foreign, OUR_DATA_DIR), false);
});

test('系统 redis（config 文件启动）→ 非本部署实例', () => {
  assert.equal(
    isOurRedisInstance('redis-server /etc/redis/redis.conf', OUR_DATA_DIR),
    false
  );
});

test('Windows 反斜杠 + 大小写差异 → 归一化后仍识别', () => {
  const winCmdline =
    'C:\\srv\\CloudCAD\\runtime\\windows\\redis\\redis-server.exe --port 6379 --dir C:\\srv\\CloudCAD\\data\\redis';
  assert.equal(
    isOurRedisInstance(winCmdline, 'c:\\srv\\cloudcad\\data\\redis'),
    true
  );
});

test('空 cmdline / 空 dataDir → 无法确认归属', () => {
  assert.equal(isOurRedisInstance('', OUR_DATA_DIR), false);
  assert.equal(isOurRedisInstance(OUR_CMDLINE, ''), false);
});

// ---------- detectRedisOwnership ----------

test('PID 未知（空）→ unknown，不触碰', () => {
  assert.equal(
    detectRedisOwnership(null, OUR_DATA_DIR, () => OUR_CMDLINE),
    'unknown'
  );
  assert.equal(
    detectRedisOwnership(undefined, OUR_DATA_DIR, () => OUR_CMDLINE),
    'unknown'
  );
});

test('cmdline 不可读（空串）→ unknown，不触碰', () => {
  assert.equal(
    detectRedisOwnership(14584, OUR_DATA_DIR, () => ''),
    'unknown'
  );
});

test('cmdline 含本部署 data/redis 目录 → ours，可接管', () => {
  assert.equal(
    detectRedisOwnership(14584, OUR_DATA_DIR, () => OUR_CMDLINE),
    'ours'
  );
});

test('cmdline 指向其他部署目录 → foreign，不触碰', () => {
  assert.equal(
    detectRedisOwnership(
      14584,
      OUR_DATA_DIR,
      () => 'redis-server --dir /other/root/data/redis'
    ),
    'foreign'
  );
});

test('系统 redis（config 文件启动）→ foreign，不触碰', () => {
  assert.equal(
    detectRedisOwnership(
      14584,
      OUR_DATA_DIR,
      () => 'redis-server /etc/redis/redis.conf'
    ),
    'foreign'
  );
});

// ---------- stopRedisProcess ----------

test('stopRedisProcess 停掉真实目标进程（SIGTERM 优雅退出）', async () => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  assert.ok(child.pid);
  assert.equal(stopRedisProcess(child.pid), true);
  // 等进程退出后验证已死（signal 0 = 探活，ESRCH = 已不存在）
  await new Promise((resolve) => setTimeout(resolve, 300));
  let alive = true;
  try {
    process.kill(child.pid, 0);
  } catch {
    alive = false;
  }
  assert.equal(alive, false);
});

test('stopRedisProcess 空 pid → false', () => {
  assert.equal(stopRedisProcess(null), false);
});

test('stopRedisProcess 目标进程已退出 → true（ESRCH/128 视为已停止，幂等）', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
    stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  assert.equal(stopRedisProcess(child.pid), true);
});

// ---------- loadRedisPassword / loadRedisHost ----------

test('loadRedisPassword 环境变量优先', () => {
  const prev = process.env.REDIS_PASSWORD;
  process.env.REDIS_PASSWORD = ' env-pw ';
  try {
    assert.equal(loadRedisPassword(), 'env-pw');
  } finally {
    if (prev === undefined) delete process.env.REDIS_PASSWORD;
    else process.env.REDIS_PASSWORD = prev;
  }
});

test('loadRedisPassword 读 .env 文件并去引号', () => {
  const prev = process.env.REDIS_PASSWORD;
  delete process.env.REDIS_PASSWORD;
  const f = path.join(os.tmpdir(), `redis-pw-test-${process.pid}.env`);
  fs.writeFileSync(f, 'REDIS_PASSWORD="file-pw"\n');
  try {
    assert.equal(loadRedisPassword(f), 'file-pw');
  } finally {
    fs.unlinkSync(f);
    if (prev !== undefined) process.env.REDIS_PASSWORD = prev;
  }
});

test('loadRedisHost 缺失时默认 127.0.0.1', () => {
  const f = path.join(os.tmpdir(), `redis-host-test-${process.pid}.env`);
  fs.writeFileSync(f, 'REDIS_PASSWORD=x\n');
  try {
    assert.equal(loadRedisHost(f), '127.0.0.1');
  } finally {
    fs.unlinkSync(f);
  }
});

// ---------- respCommand / respReply ----------

test('respCommand RESP 数组编码（AUTH 双参）', () => {
  assert.equal(
    respCommand(['AUTH', 'pw']).toString('utf8'),
    '*2\r\n$4\r\nAUTH\r\n$2\r\npw\r\n'
  );
});

test('respCommand 单参编码', () => {
  assert.equal(respCommand(['PING']).toString('utf8'), '*1\r\n$4\r\nPING\r\n');
});

test('respReply 去掉 + / - 前缀', () => {
  assert.equal(respReply('+OK'), 'OK');
  assert.equal(respReply('-ERR Authentication error'), 'ERR Authentication error');
});

// ---------- classifyAuthReplies ----------

test('classifyAuthReplies +OK / +PONG → ok', () => {
  assert.deepEqual(classifyAuthReplies(['+OK', '+PONG']), {
    state: 'ok',
    reason: '',
  });
});

test('classifyAuthReplies AUTH 报"未配置密码" → noauth', () => {
  // redis 7.0+
  assert.equal(
    classifyAuthReplies([
      '-ERR AUTH <password> called without any password configured. Does redis require auth?',
    ]).state,
    'noauth'
  );
  // redis 5.0/6.0（实测 5.0.14.1；部署机 6.0.16 同一分支）
  assert.equal(
    classifyAuthReplies([
      '-ERR Client sent AUTH, but no password is set',
      '+PONG',
    ]).state,
    'noauth'
  );
});

test('classifyAuthReplies 密码错误 → wrongpass', () => {
  // redis 7.x（未开 ACL）
  assert.equal(
    classifyAuthReplies([
      '-ERR Authentication error',
      '-NOAUTH Authentication required',
    ]).state,
    'wrongpass'
  );
  // redis 6.0（部署机实测：6.0.16）
  assert.equal(
    classifyAuthReplies([
      '-ERR invalid password',
      '-NOAUTH Authentication required.',
    ]).state,
    'wrongpass'
  );
  // 开 ACL（6.2+/7.x）
  assert.equal(
    classifyAuthReplies(['-WRONGPASS invalid username-password pair']).state,
    'wrongpass'
  );
});

test('classifyAuthReplies 数据不足（仅 AUTH 回复）→ null 继续等待', () => {
  assert.equal(classifyAuthReplies(['+OK']), null);
  assert.equal(classifyAuthReplies([]), null);
  assert.equal(classifyAuthReplies(null), null);
});

test('classifyAuthReplies 无法识别的回复 → unknown 且带原始输出', () => {
  const r = classifyAuthReplies([
    '-ERR unknown command',
    '-NOAUTH Authentication required',
  ]);
  assert.equal(r.state, 'unknown');
  assert.match(r.reason, /unknown command/);
});

// ---------- 本地 TCP mock：listenReplies ----------
//
// 本沙箱下对端 socket 的关闭不回传监听侧（server._connections 恒为 1）→
// server.close(cb) 回调永不触发、await 的 promise 永不 settle → node:test 报
// cancelledByParent + "Promise resolution is still pending"。故拆除时先
// destroy 所有 server 侧 socket 再 close，别只 await close 回调。

function listenReplies(replies, { closeAfter = false } = {}) {
  const sockets = [];
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      sockets.push(socket);
      if (replies) {
        socket.write(
          Buffer.concat(
            replies.map((r) => Buffer.from(`${r}\r\n`, 'utf8'))
          )
        );
        if (closeAfter) socket.end();
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        teardown: () =>
          new Promise((done) => {
            sockets.forEach((s) => s.destroy());
            server.close(() => done());
          }),
      });
    });
  });
}

// ---------- probeRedisAuth ----------

test('probeRedisAuth 密码正确 → ok', async () => {
  const { port, teardown } = await listenReplies(['+OK', '+PONG']);
  try {
    const r = await probeRedisAuth('127.0.0.1', port, 'pw');
    assert.deepEqual(r, { state: 'ok', reason: '' });
  } finally {
    await teardown();
  }
});

test('probeRedisAuth 实例未设密码 → noauth', async () => {
  const { port, teardown } = await listenReplies([
    '-ERR Client sent AUTH, but no password is set',
    '+PONG',
  ]);
  try {
    const r = await probeRedisAuth('127.0.0.1', port, 'pw');
    assert.equal(r.state, 'noauth');
  } finally {
    await teardown();
  }
});

test('probeRedisAuth 密码错误（6.0 实测形态）→ wrongpass', async () => {
  const { port, teardown } = await listenReplies([
    '-ERR invalid password',
    '-NOAUTH Authentication required.',
  ]);
  try {
    const r = await probeRedisAuth('127.0.0.1', port, 'bad');
    assert.equal(r.state, 'wrongpass');
  } finally {
    await teardown();
  }
});

test('probeRedisAuth 连接被拒 → unknown + 错误码', async () => {
  const { port, teardown } = await listenReplies(['+OK']);
  await teardown();
  const r = await probeRedisAuth('127.0.0.1', port, 'pw', 500);
  assert.equal(r.state, 'unknown');
  assert.match(r.reason, /ECONNREFUSED|127\.0\.0\.1:/);
});

test('probeRedisAuth 实例不响应 → unknown + 超时信息', async () => {
  const { port, teardown } = await listenReplies(null);
  try {
    const r = await probeRedisAuth('127.0.0.1', port, 'pw', 150);
    assert.equal(r.state, 'unknown');
    assert.match(r.reason, /连接超时/);
  } finally {
    await teardown();
  }
});

// ---------- respRequest / setRedisPasswordAtRuntime ----------

test('respRequest 收齐全部回复行', async () => {
  const { port, teardown } = await listenReplies(['+OK', '+PONG', '-ERR x']);
  try {
    const r = await respRequest('127.0.0.1', port, [
      ['AUTH', 'pw'],
      ['PING'],
      ['GET', 'nope'],
    ]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.lines, ['+OK', '+PONG', '-ERR x']);
    assert.equal(r.reason, '');
  } finally {
    await teardown();
  }
});

test('respRequest 实例收齐回复前断连 → 以已收到的回复收尾，不误判超时', async () => {
  const { port, teardown } = await listenReplies(
    ['-ERR Client sent AUTH, but no password is set'],
    { closeAfter: true }
  );
  try {
    const r = await respRequest(
      '127.0.0.1',
      port,
      [['AUTH', 'pw'], ['PING']],
      3000
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.lines, ['-ERR Client sent AUTH, but no password is set']);
  } finally {
    await teardown();
  }
});

test('respRequest 实例不响应 → ok:false 且 reason 带超时信息', async () => {
  const { port, teardown } = await listenReplies(null);
  try {
    const r = await respRequest(
      '127.0.0.1',
      port,
      [['CONFIG', 'SET', 'requirepass', 'pw']],
      150
    );
    assert.equal(r.ok, false);
    assert.deepEqual(r.lines, []);
    assert.match(r.reason, /连接超时/);
  } finally {
    await teardown();
  }
});

test('setRedisPasswordAtRuntime 运行中改密成功（+OK）', async () => {
  const { port, teardown } = await listenReplies(['+OK']);
  try {
    assert.deepEqual(
      await setRedisPasswordAtRuntime('127.0.0.1', port, 'new pw'),
      { ok: true, reason: '' }
    );
  } finally {
    await teardown();
  }
});

test('setRedisPasswordAtRuntime 已设别的密码无法改（NOAUTH）→ ok:false + 原因', async () => {
  const { port, teardown } = await listenReplies([
    '-NOAUTH Authentication required.',
  ]);
  try {
    const r = await setRedisPasswordAtRuntime('127.0.0.1', port, 'new pw');
    assert.equal(r.ok, false);
    assert.match(r.reason, /设置失败/);
    assert.match(r.reason, /NOAUTH/);
  } finally {
    await teardown();
  }
});

test('setRedisPasswordAtRuntime 连接被拒 → ok:false + 错误码', async () => {
  const { port, teardown } = await listenReplies(['+OK']);
  await teardown();
  const r = await setRedisPasswordAtRuntime('127.0.0.1', port, 'pw', 500);
  assert.equal(r.ok, false);
  assert.match(r.reason, /ECONNREFUSED|127\.0\.0\.1:/);
});

// ---------- persistRedisConfig ----------

test('persistRedisConfig 有配置文件 → +OK 持久化成功', async () => {
  const { port, teardown } = await listenReplies(['+OK', '+OK']);
  try {
    assert.deepEqual(await persistRedisConfig('127.0.0.1', port, 'pw'), {
      ok: true,
      reason: '',
    });
  } finally {
    await teardown();
  }
});

test('persistRedisConfig 命令行参数启动（无配置文件）→ ok:false + 原始原因', async () => {
  const { port, teardown } = await listenReplies([
    '+OK',
    '-ERR The server is running without a config file',
  ]);
  try {
    const r = await persistRedisConfig('127.0.0.1', port, 'pw');
    assert.equal(r.ok, false);
    assert.match(r.reason, /without a config file/);
  } finally {
    await teardown();
  }
});

test('persistRedisConfig 未先 AUTH 会被拒（NOAUTH）→ ok:false + AUTH 失败', async () => {
  const { port, teardown } = await listenReplies(
    ['+OK', '-NOAUTH Authentication required.'],
    { closeAfter: true }
  );
  try {
    const r = await persistRedisConfig('127.0.0.1', port, 'pw');
    assert.equal(r.ok, false);
    assert.match(r.reason, /NOAUTH/);
  } finally {
    await teardown();
  }
});

test('persistRedisConfig AUTH 失败 → ok:false + 原因', async () => {
  // 部分版本 AUTH 报错后直接关连接（实测 5.0.14.1），以断连收尾而非等超时。
  const { port, teardown } = await listenReplies(['-ERR invalid password'], {
    closeAfter: true,
  });
  try {
    const r = await persistRedisConfig('127.0.0.1', port, 'bad');
    assert.equal(r.ok, false);
    assert.match(r.reason, /AUTH 失败/);
    assert.match(r.reason, /invalid password/);
  } finally {
    await teardown();
  }
});

test('persistRedisConfig 连接被拒 → ok:false + 错误码', async () => {
  const { port, teardown } = await listenReplies(['+OK']);
  await teardown();
  const r = await persistRedisConfig('127.0.0.1', port, 'pw', 500);
  assert.equal(r.ok, false);
  assert.match(r.reason, /ECONNREFUSED|127\.0\.0\.1:/);
});
