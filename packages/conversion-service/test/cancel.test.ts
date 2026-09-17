import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 可控 runner：execute 被调用时通过 onChild 注册 kill 句柄，
 * 子进程（模拟）保持 PROCESSING 直到 kill 句柄被调用（模拟杀 mxcadassembly 进程组）。
 */
function makeControllableRunner() {
  const state: { killed: boolean; resolve: (() => void) | null } = { killed: false, resolve: null };
  const runner = {
    execute(_params: any, _timeout?: number, onChild?: (kill: () => void) => void) {
      if (onChild) {
        onChild(() => {
          state.killed = true;
          if (state.resolve) state.resolve();
        });
      }
      return new Promise<void>((resolve) => {
        state.resolve = resolve;
      });
    },
  };
  return { runner, state };
}

describe('取消机制（#431）', () => {
  describe('TaskStore.cancel 语义', () => {
    it('PENDING → CANCELLED（排队中出队）', () => {
      const store = new TaskStore('local');
      store.create({ id: 'a', params: { srcPath: '/in/a.dwg' } });
      const r = store.cancel('a');
      assert.equal(r.ok, true);
      assert.equal(r.status, 'CANCELLED');
      assert.equal(store.get('a')!.status, 'CANCELLED');
      assert.ok(store.get('a')!.completedAt, '记 completedAt（有界终态）');
    });

    it('PROCESSING → CANCELLED（运行中可取消）', () => {
      const store = new TaskStore('local');
      store.create({ id: 'a', params: { srcPath: '/in/a.dwg' } });
      store.updateStatus('a', 'PROCESSING');
      const r = store.cancel('a');
      assert.equal(r.ok, true);
      assert.equal(store.get('a')!.status, 'CANCELLED');
    });

    it('已终态（COMPLETED）不可取消', () => {
      const store = new TaskStore('local');
      store.create({ id: 'a', params: { srcPath: '/in/a.dwg' } });
      store.updateStatus('a', 'COMPLETED', { result: { newpath: '/out/a.mxweb' } });
      const r = store.cancel('a');
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'terminal');
      assert.equal(r.status, 'COMPLETED');
      assert.equal(store.get('a')!.status, 'COMPLETED', '状态不变');
    });

    it('不存在的任务返回 not_found', () => {
      const store = new TaskStore('local');
      const r = store.cancel('nope');
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'not_found');
      assert.equal(r.status, null);
    });
  });

  describe('终态不可逆（updateStatus 守卫）', () => {
    it('已 CANCELLED 的任务不被迟到的 COMPLETED 覆盖', () => {
      const store = new TaskStore('local');
      store.create({ id: 'a', params: { srcPath: '/in/a.dwg' } });
      store.updateStatus('a', 'PROCESSING');
      store.cancel('a');
      // runner 迟到的结算试图覆盖为 COMPLETED
      store.updateStatus('a', 'COMPLETED', { result: { newpath: '/out/a.mxweb' } });
      assert.equal(store.get('a')!.status, 'CANCELLED', '终态不可逆');
    });
  });

  describe('WorkerPool.cancel 集成', () => {
    it('运行中任务取消：杀进程组 + 状态 CANCELLED + 不覆盖为 COMPLETED', async () => {
      const store = new TaskStore('local');
      const { runner, state } = makeControllableRunner();
      const pool = new WorkerPool(store, runner, null, { autoScale: false });
      pool.start();

      pool.enqueue({ id: 'a', priority: 1, params: { srcPath: '/in/a.dwg' }, createdAt: new Date().toISOString() });
      await sleep(150); // 等待进入 PROCESSING（runner 已注册 kill 句柄）
      assert.equal(store.get('a')!.status, 'PROCESSING');

      const r = pool.cancel('a');
      assert.equal(r.ok, true);
      assert.equal(r.status, 'CANCELLED');
      assert.equal(r.killed, true, '触发了进程组终止');
      assert.equal(state.killed, true, 'kill 句柄被调用（杀 mxcadassembly 进程组）');
      assert.equal(store.get('a')!.status, 'CANCELLED');

      await sleep(100); // 等待 _executeTask 结算
      assert.equal(store.get('a')!.status, 'CANCELLED', '不被迟到的结算覆盖为 COMPLETED');
      pool.stop();
    });

    it('排队中任务取消：出队不再执行', async () => {
      const store = new TaskStore('local');
      // runner 永不完成（占满 level 3 池，max=1），使后续任务排队
      const runner = { execute: () => new Promise<void>(() => {}) };
      const pool = new WorkerPool(store, runner, null, { autoScale: false });
      pool.start();

      pool.enqueue({ id: 'busy', priority: 3, params: {}, createdAt: new Date().toISOString() });
      await sleep(150); // busy 占满 level 3 池
      assert.equal(store.get('busy')!.status, 'PROCESSING');

      // queued 排队（level 3 池已满）
      pool.enqueue({ id: 'queued', priority: 3, params: {}, createdAt: new Date().toISOString() });
      await sleep(150);
      assert.equal(store.get('queued')!.status, 'PENDING', '排队中');

      const r = pool.cancel('queued');
      assert.equal(r.ok, true);
      assert.equal(r.status, 'CANCELLED');
      assert.equal(r.killed, false, '排队中任务无进程组可杀');
      assert.equal(store.get('queued')!.status, 'CANCELLED');
      pool.stop();
    });

    it('已终态任务取消：透传 terminal（killed=false）', async () => {
      const store = new TaskStore('local');
      const runner = { execute: async () => ({ newpath: '/out/a.mxweb' }) };
      const pool = new WorkerPool(store, runner, null, { autoScale: false });
      pool.start();

      pool.enqueue({ id: 'a', priority: 1, params: { srcPath: '/in/a.dwg' }, createdAt: new Date().toISOString() });
      await sleep(150);
      assert.equal(store.get('a')!.status, 'COMPLETED');

      const r = pool.cancel('a');
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'terminal');
      assert.equal(r.status, 'COMPLETED');
      assert.equal(r.killed, false);
      pool.stop();
    });

    it('不存在任务取消：not_found', () => {
      const store = new TaskStore('local');
      const runner = { execute: async () => ({}) };
      const pool = new WorkerPool(store, runner, null, { autoScale: false });
      const r = pool.cancel('nope');
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'not_found');
      assert.equal(r.killed, false);
    });

    it('stop() 清空 acquire 队列悬空计时器（优雅退出，#431）', async () => {
      const store = new TaskStore('local');
      // 永不完成的 runner：占满 level 3 池（max=1），使后续任务进入 acquire 队列
      const runner = { execute: () => new Promise<void>(() => {}) };
      const pool = new WorkerPool(store, runner, null, { autoScale: false });
      pool.start();

      pool.enqueue({ id: 'busy', priority: 3, params: {}, createdAt: new Date().toISOString() });
      await sleep(150); // busy 占满 level 3 池
      pool.enqueue({ id: 'queued', priority: 3, params: {}, createdAt: new Date().toISOString() });
      await sleep(150); // queued 进入 acquire 队列（带 40s acquireTimeout 计时器）

      assert.ok(pool.pools['3'].queue.length >= 1, 'stop 前应有排队任务在 acquire 队列');
      pool.stop();
      assert.equal(pool.pools['3'].queue.length, 0, 'stop 后 acquire 队列应清空（悬空计时器清除）');
    });
  });
});
