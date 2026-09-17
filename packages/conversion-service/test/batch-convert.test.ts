import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';
import { deriveContentKey } from '../lib/utils';

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
});

describe('WorkerPool 批量转换 + 永久失败负缓存 (S1-4)', () => {
  let store: TaskStore;
  let bad: Map<string, { reason: string; markedAt: string }>;
  let markBadCalls: Array<[string, string]>;
  let runner: any;
  let negativeCache: any;

  beforeEach(() => {
    store = new TaskStore('local');
    bad = new Map();
    markBadCalls = [];
    negativeCache = {
      get: (contentKey: string) =>
        bad.has(contentKey) ? { contentKey, ...bad.get(contentKey)! } : null,
      markBad: (contentKey: string, reason: string) => {
        markBadCalls.push([contentKey, reason]);
        bad.set(contentKey, { reason, markedAt: new Date().toISOString() });
      },
    };
    // runner 按 item 配置决定：deterministicFail=确定性内容失败 / transientFail=瞬时失败 / 否则成功
    runner = {
      execute: async (item: any) => {
        if (item.deterministicFail) {
          const e = new Error(item.deterministicFail) as Error & { deterministic?: boolean };
          e.deterministic = true;
          throw e;
        }
        if (item.transientFail) {
          const e = new Error(item.transientFail) as Error & { deterministic?: boolean };
          e.deterministic = false;
          throw e;
        }
        return { code: 0, newpath: `/out/${item.id}.mxweb` };
      },
    };
  });

  it('子任务命中 known-bad → fail-fast 不 spawn，结果标 permanent', async () => {
    const pool = new WorkerPool(store, runner, null, { negativeCache });
    pool.start();

    // 预标记某内容身份为 known-bad（模拟历史确定性失败）
    const badKey = deriveContentKey({ srcPath: '/in/bad.dwg' })!;
    negativeCache.markBad(badKey, '解析失败 code=12');

    pool.enqueue({
      id: 'batch_nf',
      priority: 2,
      type: 'batch',
      params: {
        tasks: [
          { id: 'good', srcPath: '/in/good.dwg' },
          { id: 'bad', srcPath: '/in/bad.dwg' },
        ],
      },
      callbackUrl: null,
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_nf')?.status === 'COMPLETED');
    const results: any[] = (store.get('batch_nf')!.result as { results: any[] }).results;
    assert.equal(results.length, 2);
    // 未命中的子任务正常转换
    assert.equal(results[0].success, true);
    // 命中 known-bad 的子任务：不 spawn、标 permanent、带原因
    assert.equal(results[1].success, false);
    assert.equal(results[1].permanent, true);
    assert.match(String(results[1].error), /解析失败 code=12/);
    pool.stop();
  });

  it('子任务确定性内容失败 → 派生 contentKey 并 markBad，结果标 permanent', async () => {
    const pool = new WorkerPool(store, runner, null, { negativeCache });
    pool.start();

    pool.enqueue({
      id: 'batch_det',
      priority: 2,
      type: 'batch',
      params: {
        tasks: [{ id: 'det', srcPath: '/in/det.dwg', deterministicFail: '格式错 code=8' }],
      },
      callbackUrl: null,
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_det')?.status === 'COMPLETED');
    const results: any[] = (store.get('batch_det')!.result as { results: any[] }).results;
    assert.equal(results[0].success, false);
    assert.equal(results[0].permanent, true);
    // 标记的 contentKey 与子任务派生一致
    const expectedKey = deriveContentKey({ id: 'det', srcPath: '/in/det.dwg' })!;
    assert.deepEqual(markBadCalls, [[expectedKey, '格式错 code=8']]);
    // 标记后可被 fail-fast 命中
    assert.ok(negativeCache.get(expectedKey));
    pool.stop();
  });

  it('子任务瞬时失败（deterministic=false）→ 不 markBad，结果不标 permanent', async () => {
    const pool = new WorkerPool(store, runner, null, { negativeCache });
    pool.start();

    pool.enqueue({
      id: 'batch_tr',
      priority: 2,
      type: 'batch',
      params: {
        tasks: [{ id: 'tr', srcPath: '/in/tr.dwg', transientFail: '超时' }],
      },
      callbackUrl: null,
      createdAt: new Date().toISOString(),
    });

    await waitUntil(() => store.get('batch_tr')?.status === 'COMPLETED');
    const results: any[] = (store.get('batch_tr')!.result as { results: any[] }).results;
    assert.equal(results[0].success, false);
    assert.equal('permanent' in results[0], false);
    // 瞬时失败不污染负缓存
    assert.equal(markBadCalls.length, 0);
    pool.stop();
  });
});
