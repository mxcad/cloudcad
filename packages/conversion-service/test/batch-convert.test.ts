import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';
import type { NegativeCacheLike } from '../services/worker-pool';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

describe('WorkerPool 批量转换聚合 (batchConvert)', () => {
  let store: TaskStore;
  let calls: any[];
  let runner: any;

  beforeEach(() => {
    store = new TaskStore('local');
    calls = [];
    runner = {
      execute: async (item: any) => {
        calls.push(item.id);
        if (item.fail) throw new Error(item.fail);
        if (item.noNewpath) return { code: 0 };
        return { code: 0, newpath: `/out/${item.id}.mxweb` };
      },
    };
  });

  it('逐个转换子任务并聚合结果, 单文件失败不阻断整体', async () => {
    const pool = new WorkerPool(store, runner);
    pool.start();

    pool.enqueue({
      id: 'batch_ok',
      priority: 2,
      type: 'batch',
      params: {
        tasks: [
          { id: 'f1', srcPath: '/in/1.dwg' },
          { id: 'f2', srcPath: '/in/2.dwg', fail: 'bad dwg' },
          { id: 'f3', srcPath: '/in/3.dwg', noNewpath: true, outname: '3.mxweb' },
          { id: 'f4', srcPath: '/in/4.dwg', noNewpath: true },
        ],
      },
      callbackUrl: null,
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_ok')?.status === 'COMPLETED');

    const task = store.get('batch_ok');
    assert.equal(task!.status, 'COMPLETED');
    assert.equal(task!.progress, 100);
    const results: any[] = (task!.result as { results: any[] }).results;
    assert.equal(results.length, 4);

    // outputPath 优先 runner 返回的 newpath
    assert.deepEqual(results[0], { id: 'f1', success: true, outputPath: '/out/f1.mxweb' });
    // 单文件失败不阻断整体
    assert.deepEqual(results[1], { id: 'f2', success: false, error: 'bad dwg' });
    // 无 newpath 时回落 outname
    assert.deepEqual(results[2], { id: 'f3', success: true, outputPath: '3.mxweb' });
    // 无 newpath 且无 outname 时省略 outputPath
    assert.equal(results[3].success, true);
    assert.equal('outputPath' in results[3], false);

    // 子任务按序逐个执行
    assert.deepEqual(calls, ['f1', 'f2', 'f3', 'f4']);
    pool.stop();
  });

  it('空 tasks 置为 FAILED', async () => {
    const pool = new WorkerPool(store, runner);
    pool.start();

    pool.enqueue({
      id: 'batch_empty',
      priority: 2,
      type: 'batch',
      params: { tasks: [] },
      callbackUrl: null,
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_empty')?.status === 'FAILED');
    assert.equal(store.get('batch_empty')!.error, '批量任务没有可转换的文件');
    pool.stop();
  });

  it('批量任务完成后触发回调', async () => {
    const callbackCalls: any[] = [];
    const callbackEngine = {
      notify: async (taskId: string, result: any) => {
        callbackCalls.push({ taskId, result });
      },
    };
    const pool = new WorkerPool(store, runner, callbackEngine);
    pool.start();

    pool.enqueue({
      id: 'batch_cb',
      priority: 2,
      type: 'batch',
      params: { tasks: [{ id: 'x', srcPath: '/x' }] },
      callbackUrl: 'http://127.0.0.1:1/cb',
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_cb')?.status === 'COMPLETED');
    await sleep(50);
    assert.equal(callbackCalls.length, 1);
    assert.equal(callbackCalls[0].result.status, 'COMPLETED');
    assert.deepEqual(callbackCalls[0].result.result.results, [
      { id: 'x', success: true, outputPath: '/out/x.mxweb' },
    ]);
    pool.stop();
  });

  it('子任务命中 known-bad → fail-fast 不 spawn，结果标 permanent', async () => {
    const { deriveContentKey } = await import('../lib/utils');
    const badKey = deriveContentKey({ srcPath: '/in/1.dwg', fileHash: 'bad1' });
    const negativeCache: NegativeCacheLike = {
      markBad: () => {},
      get: (key: string) => key === badKey ? { contentKey: key, reason: '格式损坏', markedAt: new Date().toISOString() } : null,
      isBad: (key: string) => key === badKey,
    };
    const pool = new WorkerPool(store, runner, null, { negativeCache });
    pool.start();

    // 预先 markBad 一个 contentKey（通过 negativeCache 直接设置）
    // 使用带 fileHash 的子任务使 deriveContentKey 产生确定性 key
    pool.enqueue({
      id: 'batch_failfast',
      priority: 2,
      type: 'batch',
      params: {
        tasks: [
          { id: 'f1', srcPath: '/in/1.dwg', fileHash: 'bad1' },
          { id: 'f2', srcPath: '/in/2.dwg' },
        ],
      },
      callbackUrl: null,
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_failfast')?.status === 'COMPLETED');

    const task = store.get('batch_failfast');
    const results: any[] = (task!.result as { results: any[] }).results;
    assert.equal(results.length, 2);

    // f1 命中 known-bad → fail-fast
    assert.equal(results[0].success, false);
    assert.equal(results[0].permanent, true);
    assert.match(results[0].error, /永久失败/);
    // f1 不应被 runner 执行
    assert.ok(!calls.includes('f1'));

    // f2 正常执行
    assert.equal(results[1].success, true);
    assert.ok(calls.includes('f2'));

    pool.stop();
  });

  it('子任务确定性内容失败 → 派生 contentKey 并 markBad，结果标 permanent', async () => {
    const marked: { key: string; reason: string }[] = [];
    const negativeCache: NegativeCacheLike = {
      markBad: (key: string, reason: string) => marked.push({ key, reason }),
      get: () => null,
      isBad: () => false,
    };

    // runner 对 f2 抛确定性错误
    const failRunner = {
      execute: async (item: any) => {
        calls.push(item.id);
        if (item.id === 'f2') {
          const err = new Error('DWG 格式损坏');
          (err as any).deterministic = true;
          throw err;
        }
        return { code: 0, newpath: `/out/${item.id}.mxweb` };
      },
    };

    const pool = new WorkerPool(store, failRunner, null, { negativeCache });
    pool.start();

    pool.enqueue({
      id: 'batch_markbad',
      priority: 2,
      type: 'batch',
      params: {
        tasks: [
          { id: 'f1', srcPath: '/in/1.dwg', fileHash: 'hash_aaa' },
          { id: 'f2', srcPath: '/in/2.dwg', fileHash: 'hash_bbb' },
        ],
      },
      callbackUrl: null,
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_markbad')?.status === 'COMPLETED');

    const task = store.get('batch_markbad');
    const results: any[] = (task!.result as { results: any[] }).results;

    // f1 成功
    assert.equal(results[0].success, true);

    // f2 确定性失败 → permanent + markBad
    assert.equal(results[1].success, false);
    assert.equal(results[1].permanent, true);

    // markBad 被调用了一次（f2 的 contentKey）
    assert.equal(marked.length, 1);
    assert.ok(marked[0].key.startsWith('ck_'));
    assert.match(marked[0].reason, /DWG 格式损坏/);

    pool.stop();
  });

  it('子任务瞬时失败（deterministic=false）→ 不 markBad，结果不标 permanent', async () => {
    const marked: string[] = [];
    const negativeCache: NegativeCacheLike = {
      markBad: (key: string) => marked.push(key),
      get: () => null,
      isBad: () => false,
    };

    // runner 对 f2 抛瞬时错误（超时/进程被杀，无 deterministic 标记）
    const timeoutRunner = {
      execute: async (item: any) => {
        calls.push(item.id);
        if (item.id === 'f2') throw new Error('timeout');
        return { code: 0, newpath: `/out/${item.id}.mxweb` };
      },
    };

    const pool = new WorkerPool(store, timeoutRunner, null, { negativeCache });
    pool.start();

    pool.enqueue({
      id: 'batch_transient',
      priority: 2,
      type: 'batch',
      params: {
        tasks: [
          { id: 'f1', srcPath: '/in/1.dwg', fileHash: 'hash_ccc' },
          { id: 'f2', srcPath: '/in/2.dwg', fileHash: 'hash_ddd' },
        ],
      },
      callbackUrl: null,
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_transient')?.status === 'COMPLETED');

    const task = store.get('batch_transient');
    const results: any[] = (task!.result as { results: any[] }).results;

    // f1 成功
    assert.equal(results[0].success, true);

    // f2 瞬时失败 → 不标 permanent
    assert.equal(results[1].success, false);
    assert.equal(results[1].permanent, undefined);

    // 不应调用 markBad
    assert.equal(marked.length, 0);

    pool.stop();
  });
});
