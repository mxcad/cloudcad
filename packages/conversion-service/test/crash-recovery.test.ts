import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';

describe('崩溃恢复（#431 门禁4）', () => {
  it('残留 PROCESSING 任务重置为 PENDING 并清 startedAt', () => {
    const store = new TaskStore('local');
    const a = store.create({ id: 'a', params: { srcPath: '/in/a.dwg' } });
    store.updateStatus('a', 'PROCESSING');
    const b = store.create({ id: 'b', params: { srcPath: '/in/b.dwg' } });
    // b 保持 PENDING，c 已完成
    const c = store.create({ id: 'c', params: { srcPath: '/in/c.dwg' } });
    store.updateStatus('c', 'COMPLETED', { result: { newpath: '/out/c.mxweb' } });

    const reset = store.recoverStuckProcessing();

    assert.equal(reset, 1, '只重置 1 个 PROCESSING 任务');
    assert.equal(store.get('a')!.status, 'PENDING', 'PROCESSING → PENDING');
    assert.equal(store.get('a')!.startedAt, null, '清 startedAt 使重跑重新计时');
    assert.equal(store.get('b')!.status, 'PENDING', 'PENDING 不受影响');
    assert.equal(store.get('c')!.status, 'COMPLETED', 'COMPLETED 不受影响');
  });

  it('无残留 PROCESSING 时返回 0', () => {
    const store = new TaskStore('local');
    store.create({ id: 'a', params: { srcPath: '/in/a.dwg' } });
    assert.equal(store.recoverStuckProcessing(), 0);
  });
});
