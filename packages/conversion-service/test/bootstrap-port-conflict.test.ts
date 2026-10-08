import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import type { TestContext } from 'node:test';

/**
 * 启动健壮性回归：端口被占用时（EADDRINUSE）必须「友好失败」而不是裸崩溃。
 *
 * 覆盖两个曾经的缺陷（同一根因）：
 * 1. `server.listen` 的失败以 Server 的 'error' 事件抛出，不是 Promise rejection——不接住
 *    会落成 Node 默认的 `Unhandled 'error' event` 裸栈退出，`bootstrap().catch` 的
 *    `[server] 启动失败: ...` 永远打不出来。断言输出里没有 `Unhandled`。
 * 2. `workerPool.start()` 曾早于 `server.listen()`：端口冲突时本实例已在消费共享 Redis
 *    队列、并且跑过 recoverStuckProcessing，之后才死。断言「无 HTTP 入口」的实例不会
 *    启动 worker（日志里没有 `[WorkerPool] 已启动`）。
 *
 * 隔离性：REDIS_URL 指向 127.0.0.1:1（立即 connection refused）→ TaskStore 回退内存模式，
 * 不碰本机真实 Redis 的存量任务。lib/env.ts 的「已存在 process.env 优先」保证这里注入的
 * 值盖过 .env 文件。
 */

const SERVER_PATH = path.join(__dirname, '..', 'server.js');
const PKG_ROOT = path.join(__dirname, '..', '..');

// node:test 支持 it(name, fn, options)，但 @types/node 的 it 重载未覆盖该顺序
const itWithOptions = it as unknown as (
  name: string,
  fn: (t: TestContext) => Promise<void>,
  options?: { timeout?: number },
) => Promise<void>;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as AddressInfoLike).port;
      probe.close(() => resolve(port));
    });
  });
}

type AddressInfoLike = { port: number };

function startInstance(port: number): ChildProcess {
  return spawn(process.execPath, [SERVER_PATH], {
    cwd: PKG_ROOT,
    env: {
      ...process.env,
      CONVERSION_SERVICE_PORT: String(port),
      QUEUE_DRIVER: 'redis',
      // 127.0.0.1:1 立即拒绝连接 → TaskStore 回退内存，不触碰真实 Redis
      REDIS_URL: 'redis://127.0.0.1:1/0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function healthCheck(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForHealth(port: number, timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await healthCheck(port)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
}

function waitForExit(child: ChildProcess, timeoutMs = 15000): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      resolve({ code, output: stdout + stderr });
    };
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()));
    child.stderr?.on('data', (c: Buffer) => (stderr += c.toString()));
    child.on('close', (code) => finish(code));
    child.on('error', () => finish(null));
    setTimeout(() => finish(null), timeoutMs);
  });
}

describe('bootstrap 端口冲突', () => {
  const children: ChildProcess[] = [];
  const stopChild = (c: ChildProcess) => {
    try {
      c.kill('SIGKILL');
    } catch {
      /* 已退出 */
    }
  };

  after(() => {
    for (const c of children) stopChild(c);
  });

  itWithOptions(
    'EADDRINUSE 走 bootstrap().catch 友好退出，不裸崩、不启动 worker、不影响已有实例',
    async (t: TestContext) => {
      assert.ok(
        existsSync(SERVER_PATH),
        `需要已构建的 ${SERVER_PATH}（pnpm test 会先跑 tsc；裸跑 node --test dist/test/ 前须先 pnpm build）`,
      );
      const port = await getFreePort();

      const first = startInstance(port);
      children.push(first);
      assert.ok(await waitForHealth(port), `首个实例应在 ${port} 上就绪`);
      assert.ok(await healthCheck(port), '前置：首个实例 /health 返回 200');

      const second = startInstance(port);
      children.push(second);
      const { code, output } = await waitForExit(second);

      assert.equal(code, 1, `端口占用应 exit(1)，实际 code=${code}\n--- 输出 ---\n${output}`);
      assert.match(output, /启动失败/, `应打印 [server] 启动失败，实际输出：\n${output}`);
      assert.match(output, /EADDRINUSE/, `错误信息应保留 EADDRINUSE，实际输出：\n${output}`);
      assert.doesNotMatch(
        output,
        /Unhandled.*error.*event|emitted.*event.*on.*Server/i,
        `不应是 Node 默认的 Unhandled 'error' event 裸崩溃，实际输出：\n${output}`,
      );
      // 端口冲突时 worker 不得启动（否则两实例会重复消费同一队列）
      assert.doesNotMatch(output, /WorkerPool.*已启动/, `端口占用时不应启动 worker，实际输出：\n${output}`);
      t.diagnostic(`端口冲突退出：code=${code}`);

      // 已有实例不受影响
      assert.ok(await healthCheck(port), '端口冲突不应波及已就绪的实例');
    },
    { timeout: 30000 },
  );
});
