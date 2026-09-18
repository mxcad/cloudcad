import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { waitForTask } from '../routes/conversions';

// 假任务存储：get 始终返回指定状态（永不完成），用于验证 abort 提前终止轮询
function makeStore(status: string) {
  return {
    get: () => ({ taskId: 't1', status, result: undefined, error: undefined }),
    list: () => [],
    getStats: () => ({}),
    getDurationStats: () => ({}),
    findInFlightByContentKey: () => null,
    create: () => ({ taskId: 't1', status: 'PENDING' }),
    updateStatus: () => null,
  } as any;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('S1-3 同步 convertFile 客户端断开 abort', () => {
  it('signal abort 时提前终止轮询（不等到超时）', async () => {
    const store = makeStore('PROCESSING'); // 永不完成
    const controller = new AbortController();
    const promise = waitForTask('t1', store, 60000, controller.signal);
    await sleep(100); // 让轮询启动
    const t0 = Date.now();
    controller.abort();
    await assert.rejects(promise, /Aborted/);
    assert.ok(Date.now() - t0 < 5000, `abort 后应快速终止，实际耗时 ${Date.now() - t0}ms`);
  });

  it('传入已 abort 的 signal 时立即 reject', async () => {
    const store = makeStore('PROCESSING');
    const controller = new AbortController();
    controller.abort();
    const promise = waitForTask('t1', store, 60000, controller.signal);
    await assert.rejects(promise, /Aborted/);
  });

  it('无 signal 时向后兼容：任务完成正常 resolve', async () => {
    const store = makeStore('COMPLETED');
    const result = await waitForTask('t1', store, 5000);
    assert.equal(result.status, 'COMPLETED');
  });

  it('无 signal 时向后兼容：超时 resolve TIMEOUT', async () => {
    const store = makeStore('PROCESSING');
    const result = await waitForTask('t1', store, 300);
    assert.equal(result.status, 'TIMEOUT');
  });

  it('CANCELLED 是终态：立即 resolve CANCELLED，不再空转到超时谎报 TIMEOUT', async () => {
    const store = makeStore('CANCELLED');
    const t0 = Date.now();
    const result = await waitForTask('t1', store, 60000);
    assert.equal(result.status, 'CANCELLED');
    assert.ok(
      Date.now() - t0 < 5000,
      `CANCELLED 应快速 resolve，实际耗时 ${Date.now() - t0}ms`
    );
  });
});
