import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';
import NegativeCache from '../services/negative-cache';
import { deriveContentKey } from '../lib/utils';

function makeReq(url: string, body?: unknown): any {
  const req: any = new Readable({ read() {} });
  if (body !== undefined) {
    req.push(JSON.stringify(body));
  }
  req.push(null);
  req.headers = {};
  req.method = body === undefined ? 'GET' : 'POST';
  req.url = url;
  return req;
}

function makeRes(): any {
  const res: any = {
    status: null,
    body: null,
    writeHead(status: number, _headers: Record<string, string>) {
      this.status = status;
    },
    end(body: string) {
      this.body = body;
    },
  };
  return res;
}

describe('永久失败负缓存路由（#465）', () => {
  beforeEach(() => {
    delete process.env.CONVERSION_SERVICE_SECRET;
    delete process.env.INTERNAL_SERVICE_SECRET;
    for (const mod of ['../lib/constants', '../routes/conversions']) {
      delete require.cache[require.resolve(mod)];
    }
  });

  const params = { srcPath: '/data/x.dwg', fileHash: 'h1' };
  const contentKey = deriveContentKey(params)!;

  function setup() {
    const store = new TaskStore('local');
    const runner = { execute: async () => ({ newpath: '/out/x.mxweb' }) };
    const pool = new WorkerPool(store, runner, null, { autoScale: false });
    const cache = new NegativeCache();
    const routes = require('../routes/conversions').create(pool, store, {}, cache);
    return { store, cache, routes };
  }

  it('提交命中 known-bad → 200 + status FAILED + permanent=true，不 spawn', async () => {
    const { store, cache, routes } = setup();
    cache.markBad(contentKey, '解析失败 code=12');

    const req = makeReq('/v1/conversions/async/convertFile', { params });
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/async/convertFile', 'POST');

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.status, 'FAILED');
    assert.equal(payload.permanent, true);
    assert.equal(payload.reason, '解析失败 code=12');
    // 失败任务已落库（供状态查询/面板展示永久失败）
    const task = store.get(payload.taskId)!;
    assert.equal(task.status, 'FAILED');
    // S6-7：permanent 落到任务记录（非仅提交响应一次性信号），供 GET /tasks/:taskId 透传
    assert.equal(task.permanent, true);
  });

  it('GET /tasks/:taskId 对 known-bad 命中任务返回 permanent=true（S6-7）', async () => {
    const { store, cache, routes } = setup();
    cache.markBad(contentKey, '解析失败 code=12');

    // 提交命中 known-bad → 落一条 FAILED + permanent 任务
    const submitReq = makeReq('/v1/conversions/async/convertFile', { params });
    const submitRes = makeRes();
    await routes.handle(submitReq, submitRes, '/v1/conversions/async/convertFile', 'POST');
    const taskId = JSON.parse(submitRes.body).taskId;

    // 状态查询透传 permanent（backend listTasks 据此对 FAILED 节点展示「永久失败」）
    const getReq = makeReq(`/v1/conversions/tasks/${taskId}`);
    const getRes = makeRes();
    await routes.handle(getReq, getRes, `/v1/conversions/tasks/${taskId}`, 'GET');

    assert.equal(getRes.status, 200);
    const payload = JSON.parse(getRes.body);
    assert.equal(payload.status, 'FAILED');
    assert.equal(payload.permanent, true);
    // 任务记录仍在（未被淘汰），供后续面板轮询
    assert.equal(store.get(taskId)?.permanent, true);
  });

  it('GET /tasks/:taskId 对普通任务（未命中 known-bad）返回 permanent=false（S6-7）', async () => {
    const { store, routes } = setup();
    // 直接建一条非 known-bad 的失败任务（无 permanent 标记）
    store.create({ id: 't-plain', params });
    store.updateStatus('t-plain', 'FAILED', { error: '瞬时失败' });

    const req = makeReq('/v1/conversions/tasks/t-plain');
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/tasks/t-plain', 'GET');

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.status, 'FAILED');
    assert.equal(payload.permanent, false);
  });

  it('未命中 known-bad → 202 + status PENDING + permanent=false', async () => {
    const { cache, routes } = setup();
    assert.equal(cache.isBad(contentKey), false);

    const req = makeReq('/v1/conversions/async/convertFile', { params });
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/async/convertFile', 'POST');

    assert.equal(res.status, 202);
    const payload = JSON.parse(res.body);
    assert.equal(payload.status, 'PENDING');
    assert.equal(payload.permanent, false);
  });

  it('GET /known-bad 列出 known-bad 条目', async () => {
    const { cache, routes } = setup();
    cache.markBad(contentKey, 'x');
    cache.markBad('ck_other', 'y');

    const req = makeReq('/v1/conversions/known-bad');
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/known-bad', 'GET');

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.total, 2);
    const keys = payload.items.map((i: any) => i.contentKey).sort();
    assert.deepEqual(keys, [contentKey, 'ck_other'].sort());
  });

  it('POST /known-bad/reset 复位单个', async () => {
    const { cache, routes } = setup();
    cache.markBad(contentKey, 'x');

    const req = makeReq('/v1/conversions/known-bad/reset', { contentKey });
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/known-bad/reset', 'POST');

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.reset, 1);
    assert.equal(cache.isBad(contentKey), false);
  });

  it('POST /known-bad/reset 缺省 contentKey → 复位全部', async () => {
    const { cache, routes } = setup();
    cache.markBad(contentKey, 'x');
    cache.markBad('ck_other', 'y');

    const req = makeReq('/v1/conversions/known-bad/reset', {});
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/known-bad/reset', 'POST');

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.reset, 2);
    assert.equal(payload.all, true);
    assert.equal(cache.size(), 0);
  });

  it('复位不存在的 known-bad → 404', async () => {
    const { routes } = setup();
    const req = makeReq('/v1/conversions/known-bad/reset', {
      contentKey: 'ck_missing',
    });
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/known-bad/reset', 'POST');
    assert.equal(res.status, 404);
  });
});
