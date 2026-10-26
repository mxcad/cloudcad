import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    store = new TaskStore('local');
  });

  it('should create a task with PENDING status and defaults', () => {
    const record = store.create({ id: 't1', priority: 2, params: {} });

    assert.equal(record.status, 'PENDING');
    assert.equal(record.progress, 0);
    assert.equal(record.result, null);
    assert.equal(record.error, null);
    assert.ok(record.createdAt);
    assert.ok(record.updatedAt);
  });

  it('should keep the callbackUrl when provided', () => {
    const record = store.create({
      id: 't2',
      priority: 1,
      params: {},
      callbackUrl: 'http://backend/cb',
    });

    assert.equal(record.callbackUrl, 'http://backend/cb');
  });

  it('should get a task by id and null for unknown', () => {
    store.create({ id: 't3', priority: 2, params: {} });

    assert.equal(store.get('t3')!.id, 't3');
    assert.equal(store.get('missing'), null);
  });

  it('should update status with extra fields', () => {
    store.create({ id: 't4', priority: 2, params: {} });

    const updated = store.updateStatus('t4', 'COMPLETED', {
      result: { outputPath: '/out/a.mxweb' },
      progress: 100,
    })!;

    assert.equal(updated.status, 'COMPLETED');
    assert.equal((updated.result as { outputPath: string }).outputPath, '/out/a.mxweb');
    assert.equal(updated.progress, 100);
  });

  it('should ignore updates for unknown tasks', () => {
    assert.equal(store.updateStatus('nope', 'COMPLETED', {}), null);
  });

  it('should list tasks with status filter', () => {
    store.create({ id: 'a', priority: 1, params: {} });
    store.create({ id: 'b', priority: 2, params: {} });
    store.updateStatus('a', 'COMPLETED');

    assert.equal(store.list().length, 2);
    assert.equal(store.list({ status: 'COMPLETED' }).length, 1);
    assert.equal(store.list({ status: 'COMPLETED' })[0].id, 'a');
  });

  it('should delete a task', () => {
    store.create({ id: 'c', priority: 1, params: {} });

    assert.equal(store.delete('c'), true);
    assert.equal(store.get('c'), null);
    assert.equal(store.delete('c'), false);
  });

  it('should compute stats by status', () => {
    store.create({ id: 'a', priority: 1, params: {} });
    store.create({ id: 'b', priority: 2, params: {} });
    store.updateStatus('a', 'COMPLETED');
    store.updateStatus('b', 'PROCESSING');

    const stats = store.getStats();
    assert.deepEqual(stats, {
      total: 2,
      pending: 0,
      processing: 1,
      completed: 1,
      failed: 0,
      cancelled: 0,
    });
  });

  it('should record startedAt on PROCESSING and completedAt on terminal (each only once)', () => {
    store.create({ id: 't', priority: 2, params: {} });
    store.updateStatus('t', 'PROCESSING');
    const firstStartedAt = store.get('t')!.startedAt;
    store.updateStatus('t', 'PROCESSING', { progress: 50 });
    assert.equal(store.get('t')!.startedAt, firstStartedAt);
    assert.equal(store.get('t')!.completedAt, null);

    store.updateStatus('t', 'COMPLETED');
    assert.ok(store.get('t')!.completedAt);
  });

  it('should compute duration P50/P95 from terminal tasks with timestamps', () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mk = (id: string, durMs: number) => {
      store.create({ id, priority: 2, params: {} });
      const r = store.get(id)!;
      r.status = 'COMPLETED';
      r.startedAt = new Date(t0).toISOString();
      r.completedAt = new Date(t0 + durMs).toISOString();
    };
    // 10 个样本: 100,200,...,1000ms
    for (let i = 1; i <= 10; i += 1) mk(`d${i}`, i * 100);
    // 无 startedAt 的终态任务不计入样本
    store.create({ id: 'no-ts', priority: 2, params: {} });
    store.updateStatus('no-ts', 'FAILED');

    const stats = store.getDurationStats();
    assert.equal(stats.sampleCount, 10);
    // 最近邻: p50 = idx floor(0.5*9)=4 → 500ms; p95 = idx floor(0.95*9)=8 → 900ms
    assert.equal(stats.p50Ms, 500);
    assert.equal(stats.p95Ms, 900);
  });

  it('should return null percentiles with zero samples', () => {
    const stats = store.getDurationStats();
    assert.deepEqual(stats, { sampleCount: 0, p50Ms: null, p95Ms: null });
  });

  it('should evict oldest terminal records beyond the retention cap', () => {
    const cap = 500;
    for (let i = 0; i < cap + 5; i += 1) {
      const id = `t${i}`;
      store.create({ id, priority: 2, params: {} });
      store.updateStatus(id, 'COMPLETED');
    }
    // 最旧的 5 条被淘汰，其余终态保留
    assert.equal(store.get('t0'), null);
    assert.equal(store.get('t4'), null);
    assert.ok(store.get('t5'));
    assert.equal(store.list({ status: 'COMPLETED' }).length, cap);
    // 非终态任务不受淘汰影响
    store.create({ id: 'live', priority: 2, params: {} });
    store.updateStatus('live', 'PROCESSING');
    for (let i = cap + 5; i < cap + 10; i += 1) {
      const id = `t${i}`;
      store.create({ id, priority: 2, params: {} });
      store.updateStatus(id, 'FAILED');
    }
    assert.equal(store.get('live')!.status, 'PROCESSING');
    assert.equal(store.list({ status: 'FAILED' }).length, 5);
  });

  it('should evict oldest terminal records produced by cancel() beyond the retention cap', () => {
    const cap = 500;
    for (let i = 0; i < cap + 5; i += 1) {
      const id = `c${i}`;
      store.create({ id, priority: 2, params: {} });
      store.cancel(id);
    }
    // 取消是独立终态入口，同样须触发淘汰（此前 cancel 从不调 _evictTerminal，
    // 纯取消负载下终态集合无界增长）：最旧的 5 条被删
    assert.equal(store.get('c0'), null);
    assert.equal(store.get('c4'), null);
    assert.ok(store.get('c5'));
    assert.equal(store.list({ status: 'CANCELLED' }).length, cap);
  });

  it('should record completedAt when a task is cancelled via updateStatus', () => {
    store.create({ id: 'u1', priority: 2, params: {} });
    const rec = store.updateStatus('u1', 'CANCELLED');
    assert.equal(rec!.status, 'CANCELLED');
    assert.ok(rec!.completedAt, 'updateStatus CANCELLED must set completedAt');
  });

  describe('clientTaskId 别名协议（backend node.taskId ↔ 远端 fw_* id）', () => {
    it('should keep clientTaskIds and timeoutMs on the created record', () => {
      const record = store.create({
        id: 'fw_1',
        priority: 1,
        params: {},
        clientTaskIds: ['async_node_1_123'],
        timeoutMs: 90000,
      });

      assert.deepEqual(record.clientTaskIds, ['async_node_1_123']);
      assert.equal(record.timeoutMs, 90000);
    });

    it('should find a task by client task id', () => {
      store.create({
        id: 'fw_2',
        priority: 1,
        params: {},
        clientTaskIds: ['async_node_2_123'],
      });

      assert.equal(store.findByClientTaskId('async_node_2_123')!.id, 'fw_2');
      assert.equal(store.findByClientTaskId('unknown'), null);
    });

    it('should resolve an exact id first, then fall back to the alias', () => {
      store.create({
        id: 'fw_3',
        priority: 1,
        params: {},
        clientTaskIds: ['async_node_3_123'],
      });

      assert.equal(store.resolveTaskId('fw_3'), 'fw_3');
      assert.equal(store.resolveTaskId('async_node_3_123'), 'fw_3');
      assert.equal(store.resolveTaskId('missing'), null);
    });

    it('should add a client task id on dedup merge and stay idempotent', () => {
      store.create({
        id: 'fw_4',
        priority: 1,
        params: {},
        clientTaskIds: ['async_a'],
      });

      store.addClientTaskId('fw_4', 'async_b');
      store.addClientTaskId('fw_4', 'async_b'); // 重复登记幂等
      store.addClientTaskId('nope', 'async_c'); // 未知任务静默忽略

      assert.deepEqual(store.get('fw_4')!.clientTaskIds, ['async_a', 'async_b']);
      assert.equal(store.findByClientTaskId('async_c'), null);
    });
  });
});
