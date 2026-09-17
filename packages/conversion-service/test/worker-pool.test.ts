import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';

function waitUntil(predicate: () => boolean, timeout = 5000, interval = 20): Promise<void> {
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

describe('WorkerPool', () => {
  let store: TaskStore;
  let runner: any;

  beforeEach(() => {
    store = new TaskStore('local');
    runner = {
      execute: async (params: any) => {
        if (params.fail) throw new Error(params.fail);
        return { code: 0, newpath: `/out/${params.name}.mxweb` };
      },
    };
  });

  it('should complete a task and store the result', async () => {
    const pool = new WorkerPool(store, runner);
    pool.start();

    pool.enqueue({
      id: 'task_a',
      priority: 1,
      params: { name: 'a' },
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('task_a')?.status === 'COMPLETED');

    const task = store.get('task_a');
    assert.equal(task!.status, 'COMPLETED');
    assert.equal((task!.result as { newpath: string }).newpath, '/out/a.mxweb');
    pool.stop();
  });

  it('should mark a task FAILED when the runner throws', async () => {
    const pool = new WorkerPool(store, runner);
    pool.start();

    pool.enqueue({
      id: 'task_bad',
      priority: 2,
      params: { name: 'b', fail: 'mxcad exploded' },
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('task_bad')?.status === 'FAILED');

    assert.equal(store.get('task_bad')!.error, 'mxcad exploded');
    pool.stop();
  });

  it('should let a priority-1 task run while a priority-3 pool is busy', async () => {
    const order: string[] = [];
    const slowRunner = {
      execute: (params: any) =>
        new Promise((resolve) => {
          order.push(`start:${params.name}`);
          const delay = params.name === 'slow3' ? 400 : 20;
          setTimeout(() => {
            order.push(`done:${params.name}`);
            resolve({ code: 0 });
          }, delay);
        }),
    };
    const pool = new WorkerPool(store, slowRunner);
    pool.start();

    // A slow thumbnail task occupies the priority-3 pool.
    pool.enqueue({
      id: 'thumb',
      priority: 3,
      params: { name: 'slow3' },
      createdAt: new Date().toISOString(),
    });
    // Then an interactive upload conversion arrives.
    pool.enqueue({
      id: 'upload',
      priority: 1,
      params: { name: 'fast1' },
      createdAt: new Date().toISOString(),
    });

    await waitUntil(
      () =>
        store.get('upload')?.status === 'COMPLETED' &&
        store.get('thumb')?.status === 'COMPLETED',
    );

    // The upload task starts on its own pool even though priority-3 is busy.
    assert.ok(order.indexOf('start:fast1') !== -1);
    assert.ok(order.indexOf('start:slow3') !== -1);
    pool.stop();
  });

  it('should expose per-level stats', () => {
    const pool = new WorkerPool(store, runner);
    const stats = pool.getStats();

    assert.equal(Object.keys(stats).length, 3);
    for (let level = 1; level <= 3; level++) {
      assert.ok(stats[level].maxConcurrent > 0);
      assert.equal(typeof stats[level].waiting, 'number');
    }
    pool.stop();
  });

  it('should not execute tasks when stopped', async () => {
    const pool = new WorkerPool(store, runner);

    pool.enqueue({
      id: 'never',
      priority: 1,
      params: { name: 'x' },
      createdAt: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 300));
    assert.equal(store.get('never')!.status, 'PENDING');
  });

  it('should fire the callback engine on terminal states', async () => {
    const calls: any[] = [];
    const callbackEngine = {
      notify: async (taskId: string, result: any) => {
        calls.push({ taskId, result });
        return Promise.resolve();
      },
    };
    const pool = new WorkerPool(store, runner, callbackEngine);
    pool.start();

    pool.enqueue({
      id: 'cb_ok',
      priority: 1,
      params: { name: 'a' },
      callbackUrl: 'http://127.0.0.1:1/cb',
      createdAt: new Date().toISOString(),
    });
    pool.enqueue({
      id: 'cb_fail',
      priority: 1,
      params: { name: 'b', fail: 'boom' },
      callbackUrl: 'http://127.0.0.1:1/cb',
      createdAt: new Date().toISOString(),
    });

    await waitUntil(
      () =>
        store.get('cb_ok')?.status === 'COMPLETED' &&
        store.get('cb_fail')?.status === 'FAILED',
    );

    assert.equal(calls.length, 2);
    const ok = calls.find((c: any) => c.taskId === 'cb_ok');
    const fail = calls.find((c: any) => c.taskId === 'cb_fail');
    assert.equal(ok.result.status, 'COMPLETED');
    assert.equal(ok.result.result.newpath, '/out/a.mxweb');
    assert.equal(fail.result.status, 'FAILED');
    assert.equal(fail.result.error, 'boom');
    pool.stop();
  });

  it('should be a no-op when no callback engine is wired', async () => {
    const pool = new WorkerPool(store, runner);
    pool.start();

    pool.enqueue({
      id: 'no_cb',
      priority: 1,
      params: { name: 'a' },
      callbackUrl: 'http://127.0.0.1:1/cb',
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('no_cb')?.status === 'COMPLETED');
    assert.equal((store.get('no_cb')!.result as { newpath: string }).newpath, '/out/a.mxweb');
    pool.stop();
  });

  it('should expose queue position for waiting tasks (S6-5)', async () => {
    // 阻塞 runner：首个任务占住 priority-3 池的唯一槽位（maxConcurrent=1），后续任务排队
    const blockingRunner = {
      execute: () => new Promise(() => {}), // 永不 resolve
    };
    const pool = new WorkerPool(store, blockingRunner);
    pool.start();

    pool.enqueue({ id: 'q_a', priority: 3, params: { name: 'a' }, createdAt: new Date().toISOString() });
    pool.enqueue({ id: 'q_b', priority: 3, params: { name: 'b' }, createdAt: new Date().toISOString() });
    pool.enqueue({ id: 'q_c', priority: 3, params: { name: 'c' }, createdAt: new Date().toISOString() });

    // 等待 b、c 入队（a 占槽位运行中，b/c 排队）
    await waitUntil(
      () => pool.getQueuePosition('q_b') !== null && pool.getQueuePosition('q_c') !== null,
    );

    assert.equal(pool.getQueuePosition('q_a'), null); // a 运行中（非排队）
    assert.equal(pool.getQueuePosition('q_b'), 1);
    assert.equal(pool.getQueuePosition('q_c'), 2);
    pool.stop();
  });
});
