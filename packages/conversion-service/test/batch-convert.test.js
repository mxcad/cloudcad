'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const TaskStore = require('../services/task-store');
const WorkerPool = require('../services/worker-pool');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitUntil(predicate, timeout = 5000, interval = 20) {
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
  let store;
  let calls;
  let runner;

  beforeEach(() => {
    store = new TaskStore('local');
    calls = [];
    runner = {
      execute: async (item) => {
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
    assert.equal(task.status, 'COMPLETED');
    assert.equal(task.progress, 100);
    assert.equal(task.result.results.length, 4);

    // outputPath 优先 runner 返回的 newpath
    assert.deepEqual(task.result.results[0], { id: 'f1', success: true, outputPath: '/out/f1.mxweb' });
    // 单文件失败不阻断整体
    assert.deepEqual(task.result.results[1], { id: 'f2', success: false, error: 'bad dwg' });
    // 无 newpath 时回落 outname
    assert.deepEqual(task.result.results[2], { id: 'f3', success: true, outputPath: '3.mxweb' });
    // 无 newpath 且无 outname 时省略 outputPath
    assert.equal(task.result.results[3].success, true);
    assert.equal('outputPath' in task.result.results[3], false);

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
    assert.equal(store.get('batch_empty').error, '批量任务没有可转换的文件');
    pool.stop();
  });

  it('批量任务完成后触发回调', async () => {
    const callbackCalls = [];
    const callbackEngine = {
      notify: async (taskId, result) => {
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
