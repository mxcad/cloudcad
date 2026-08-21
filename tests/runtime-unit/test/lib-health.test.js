/**
 * L1 特征测试 —— lib/health.js waitForPort / checkHttpHealth
 *
 * 目的：锁定 Step A-2 重构前 waitForPort（端口就绪探测）的行为作为回归守卫。
 * - 端口可连接 → resolve(true)
 * - 端口不可连接且超时 → reject
 * - checkHttpHealth 对 200 响应 → resolve(true)
 *
 * 用真实 TCP server / http server（本机随机端口）验证，不 mock net/http。
 */
const net = require('net');
const http = require('http');

const {
  waitForPort,
  checkHttpHealth,
  isPortOpen,
  waitPortReleased,
} = require('../../../runtime/scripts/lib/health');

const realLog = console.log;
beforeAll(() => { console.log = () => {}; });
afterAll(() => { console.log = realLog; });

function listen(server, port = 0) {
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}
function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe('waitForPort', () => {
  test('端口可连接时 resolve true', async () => {
    const server = net.createServer();
    const port = await listen(server);
    try {
      await expect(waitForPort(port, '测试', 3000)).resolves.toBe(true);
    } finally {
      await close(server);
    }
  });

  test('端口不可连接且超时后 reject', async () => {
    // 绑定后立即关闭 → 端口空闲不可连接
    const server = net.createServer();
    const port = await listen(server);
    await close(server);
    await expect(waitForPort(port, '不可达', 1200)).rejects.toThrow(/启动超时/);
  });
});

describe('checkHttpHealth', () => {
  test('HTTP 200 时 resolve true', async () => {
    const server = http.createServer((req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    const port = await listen(server);
    try {
      await expect(checkHttpHealth(port, '/health', 3000)).resolves.toBe(true);
    } finally {
      await close(server);
    }
  });

  test('HTTP 非 200 且超时后 reject', async () => {
    const server = http.createServer((req, res) => {
      res.statusCode = 503;
      res.end('bad');
    });
    const port = await listen(server);
    try {
      await expect(checkHttpHealth(port, '/health', 1200)).rejects.toThrow(/超时/);
    } finally {
      await close(server);
    }
  });
});

describe('isPortOpen (Q2 端口占用单次检测)', () => {
  test('端口已监听时返回 true', async () => {
    const server = net.createServer();
    const port = await listen(server);
    try {
      await expect(isPortOpen(port)).resolves.toBe(true);
    } finally {
      await close(server);
    }
  });

  test('端口空闲时返回 false', async () => {
    const server = net.createServer();
    const port = await listen(server);
    await close(server);
    await expect(isPortOpen(port, '127.0.0.1', 300)).resolves.toBe(false);
  });
});

describe('waitPortReleased (Q1 清理后确认端口释放)', () => {
  test('端口被占用后释放 → resolve true', async () => {
    const server = net.createServer();
    const port = await listen(server);
    // 先确认占用，再关闭，随后等待释放
    await expect(isPortOpen(port)).resolves.toBe(true);
    await close(server);
    await expect(waitPortReleased(port, 3000)).resolves.toBe(true);
  });

  test('端口一直占用且超时 → resolve false', async () => {
    const server = net.createServer();
    const port = await listen(server);
    try {
      await expect(waitPortReleased(port, 800)).resolves.toBe(false);
    } finally {
      await close(server);
    }
  });
});
