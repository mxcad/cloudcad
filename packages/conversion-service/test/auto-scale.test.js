'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const TaskStore = require('../services/task-store');
const WorkerPool = require('../services/worker-pool');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitUntil(predicate, timeout = 10000, interval = 20) {
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

function makeSlowRunner(holdMs) {
  let concurrent = 0;
  let maxConcurrent = 0;
  const runner = {
    execute: async (params) => {
      concurrent += 1;
      if (concurrent > maxConcurrent) maxConcurrent = concurrent;
      await sleep(params.delay || holdMs);
      concurrent -= 1;
      return { code: 0, newpath: `/out/${params.name}.mxweb` };
    },
    getMaxConcurrent: () => maxConcurrent,
  };
  return runner;
}

describe('WorkerPool 自动扩容', () => {
  let store;

  beforeEach(() => {
    store = new TaskStore('local');
  });

  it('SemaphorePool.setMax 可提升并回落并发上限', async () => {
    const pool = new WorkerPool(store, makeSlowRunner(100));
    const sem = pool.pools['1'];
    assert.equal(sem.max, 2);
    sem.setMax(6);
    assert.equal(sem.max, 6);
    sem.setMax(0);
    assert.equal(sem.max, 1);
    pool.stop();
  });

  it('积压持续超过阈值后提升并发, 真实并发随之增加, 完成后回落', async () => {
    const runner = makeSlowRunner(300);
    const pool = new WorkerPool(store, runner, null, {
      autoScale: true,
      backlogThreshold: 2,
      backlogWindowMs: 30,
      maxMultiplier: 2,
      maxConcurrent: 8,
    });
    pool.start();

    for (let i = 0; i < 8; i++) {
      pool.enqueue({
        id: `t${i}`,
        priority: 1,
        params: { name: String(i) },
        createdAt: new Date().toISOString(),
      });
    }

    // baseline=2, cap=min(2*2, 8)=4
    await waitUntil(() => pool.pools['1'].max === 4, 5000);
    assert.equal(pool.getStats()[1].currentMax, 4);

    // 真实并发应到达 4（不只是 max 数值变化）
    await waitUntil(() => runner.getMaxConcurrent() >= 4, 5000);

    // 全部完成且并发上限回落到 baseline=2
    const ids = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];
    await waitUntil(() => {
      const allDone = ids.every((id) => store.get(id)?.status === 'COMPLETED');
      return allDone && pool.pools['1'].max === 2;
    }, 15000);
    assert.equal(pool.getStats()[1].currentMax, 2);
    pool.stop();
  });

  it('超过全局上限时按全局上限封顶', async () => {
    const runner = makeSlowRunner(300);
    const pool = new WorkerPool(store, runner, null, {
      autoScale: true,
      backlogThreshold: 1,
      backlogWindowMs: 30,
      maxMultiplier: 8,
      maxConcurrent: 3,
    });
    pool.start();

    for (let i = 0; i < 8; i++) {
      pool.enqueue({
        id: `cap${i}`,
        priority: 1,
        params: { name: String(i) },
        createdAt: new Date().toISOString(),
      });
    }

    // baseline=2, cap=min(2*8, 3)=3
    await waitUntil(() => pool.pools['1'].max === 3, 5000);
    assert.equal(pool.getStats()[1].currentMax, 3);
    pool.stop();
  });

  it('autoScale=false 时不调整并发上限', async () => {
    const pool = new WorkerPool(store, makeSlowRunner(300), null, {
      autoScale: false,
    });
    pool.start();

    for (let i = 0; i < 6; i++) {
      pool.enqueue({
        id: `off${i}`,
        priority: 1,
        params: { name: String(i) },
        createdAt: new Date().toISOString(),
      });
    }

    await sleep(400);
    assert.equal(pool.pools['1'].max, 2);
    pool.stop();
  });

  it('stats 暴露 currentMax / autoScale 字段', () => {
    const pool = new WorkerPool(store, makeSlowRunner(100));
    const stats = pool.getStats();
    assert.equal(Object.keys(stats).length, 3);
    for (let level = 1; level <= 3; level++) {
      assert.equal(stats[level].currentMax, stats[level].maxConcurrent);
      assert.equal(typeof stats[level].autoScale, 'boolean');
    }
    pool.stop();
  });
});
