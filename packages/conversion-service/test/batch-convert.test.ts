import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';

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
        if (item.fail) {
          const err = new Error(item.fail);
          // 模拟 ConversionExecutionError 携带结构化分类（runner 抛出的形状）
          if (item.category) {
            (err as any).category = item.category;
            (err as any).code = item.code;
          }
          throw err;
        }
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
          { id: 'f5', srcPath: '/in/5.dwg', fail: 'param error', category: 'content-error', code: 12 },
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
    assert.equal(results.length, 5);

    // outputPath 优先 runner 返回的 newpath
    assert.deepEqual(results[0], { id: 'f1', success: true, outputPath: '/out/f1.mxweb' });
    // 单文件失败不阻断整体；未归类异常（普通 Error）归 'unknown'，按瞬态处理
    assert.deepEqual(results[1], {
      id: 'f2',
      success: false,
      error: 'bad dwg',
      errorCategory: 'unknown',
    });
    // 无 newpath 时回落 outname
    assert.deepEqual(results[2], { id: 'f3', success: true, outputPath: '3.mxweb' });
    // 无 newpath 且无 outname 时省略 outputPath
    assert.equal(results[3].success, true);
    assert.equal('outputPath' in results[3], false);
    // 已分类异常（ConversionExecutionError 形状）的分类与引擎返回码一并聚合，
    // 批量消费方据此按字段判定「可重试 vs 确定性失败」，无需匹配文案
    assert.deepEqual(results[4], {
      id: 'f5',
      success: false,
      error: 'param error',
      errorCategory: 'content-error',
      errorCode: 12,
    });

    // 子任务按序逐个执行
    assert.deepEqual(calls, ['f1', 'f2', 'f3', 'f4', 'f5']);
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
