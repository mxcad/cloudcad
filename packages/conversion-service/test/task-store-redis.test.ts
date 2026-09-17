import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';
import { startMockRedis } from '../test-utils/mock-redis';

describe('TaskStore (redis driver)', () => {
  let mock: Awaited<ReturnType<typeof startMockRedis>>;
  let stores: TaskStore[];

  beforeEach(async () => {
    mock = await startMockRedis();
    stores = [];
  });

  afterEach(async () => {
    for (const s of stores) s.close();
    await new Promise((r) => mock.server.close(r));
  });

  async function makeStore() {
    const store = new TaskStore('redis', { redisUrl: `redis://127.0.0.1:${mock.port}` });
    await store.init();
    stores.push(store);
    return store;
  }

  it('create/get/updateStatus/list/delete/getStats 全流程并持久化', async () => {
    const store = await makeStore();
    assert.equal(store.isRedis(), true);

    store.create({ id: 'r1', priority: 1, params: {} });
    store.updateStatus('r1', 'COMPLETED', {
      result: { outputPath: '/out/a.mxweb' },
      progress: 100,
    });

    assert.equal(store.get('r1')!.status, 'COMPLETED');
    assert.equal((store.get('r1')!.result as { outputPath: string }).outputPath, '/out/a.mxweb');
    assert.deepEqual(store.list({ status: 'COMPLETED' })[0].id, 'r1');
    assert.deepEqual(store.getStats(), {
      total: 1,
      pending: 0,
      processing: 0,
      completed: 1,
      failed: 0,
      cancelled: 0,
    });

    await store.flush();
    assert.ok(
      mock.state.commands.some((c) => c[0] === 'HSET' && c[1] === 'fworkflow:tasks'),
      '应写入 Redis Hash',
    );

    assert.equal(store.delete('r1'), true);
    await store.flush();
    assert.equal(store.get('r1'), null);
    assert.ok(mock.state.commands.some((c) => c[0] === 'HDEL' && c[1] === 'fworkflow:tasks'));
  });

  it('重启后任务不丢失（从 Redis 恢复）', async () => {
    const store = await makeStore();
    store.create({ id: 'persist1', priority: 2, params: { srcPath: '/in/a.dwg' } });
    store.updateStatus('persist1', 'PROCESSING');
    await store.flush();

    // 模拟服务重启: 新的 store 实例从 Redis 恢复
    const store2 = await makeStore();
    const restored = store2.get('persist1');
    assert.ok(restored, '任务应从 Redis 恢复');
    assert.equal(restored!.status, 'PROCESSING');
    assert.equal((restored!.params as { srcPath: string }).srcPath, '/in/a.dwg');
  });

  it('Redis 不可用时回退内存模式并保持可用', async () => {
    const store = new TaskStore('redis', {
      redisUrl: 'redis://127.0.0.1:1',
      connectTimeoutMs: 300,
    });
    await store.init();
    assert.equal(store.isFallback(), true);
    assert.equal(store.isRedis(), false);
    // 回退后读写仍可用
    store.create({ id: 'fb1', priority: 1, params: {} });
    assert.equal(store.get('fb1')!.id, 'fb1');
    assert.equal(store.delete('fb1'), true);
  });

  it('local driver 不尝试连接 Redis', async () => {
    const store = new TaskStore('local');
    await store.init();
    assert.equal(store.isRedis(), false);
    assert.equal(store.isFallback(), false);
    store.create({ id: 'l1', priority: 1, params: {} });
    assert.equal(store.get('l1')!.id, 'l1');
  });
});
