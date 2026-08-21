'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const TaskStore = require('../services/task-store');

describe('TaskStore', () => {
  let store;

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

    assert.equal(store.get('t3').id, 't3');
    assert.equal(store.get('missing'), null);
  });

  it('should update status with extra fields', () => {
    store.create({ id: 't4', priority: 2, params: {} });

    const updated = store.updateStatus('t4', 'COMPLETED', {
      result: { outputPath: '/out/a.mxweb' },
      progress: 100,
    });

    assert.equal(updated.status, 'COMPLETED');
    assert.equal(updated.result.outputPath, '/out/a.mxweb');
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
    });
  });
});
