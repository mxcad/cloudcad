import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';

// 测试用假请求：Readable 承载请求体（cancel 无 body），叠加 headers/method/url
function makeReq(url: string): any {
  const req: any = new Readable({ read() {} });
  req.push(null);
  req.headers = {};
  req.method = 'POST';
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

describe('POST /v1/conversions/tasks/:taskId/cancel 路由（#431 取消机制）', () => {
  beforeEach(() => {
    // 确定性：清空共享密钥，使 checkSecret 放行（本地开发向后兼容）
    delete process.env.CONVERSION_SERVICE_SECRET;
    delete process.env.INTERNAL_SERVICE_SECRET;
    for (const mod of ['../lib/constants', '../routes/conversions']) {
      delete require.cache[require.resolve(mod)];
    }
  });

  function createRoutes(pool: WorkerPool, store: TaskStore): any {
    return require('../routes/conversions').create(pool, store, {});
  }

  it('排队中任务取消 → 200 CANCELLED（killed=false）', async () => {
    const store = new TaskStore('local');
    const runner = { execute: async () => ({ newpath: '/out/x.mxweb' }) };
    const pool = new WorkerPool(store, runner, null, { autoScale: false });
    // 不 start（避免自动执行），手动建一个 PENDING 任务
    store.create({ id: 't1', priority: 3, params: {}, createdAt: new Date().toISOString() });
    assert.equal(store.get('t1')!.status, 'PENDING');

    const routes = createRoutes(pool, store);
    const req = makeReq('/v1/conversions/tasks/t1/cancel');
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/tasks/t1/cancel', 'POST');

    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.status, 'CANCELLED');
    assert.equal(payload.killed, false, '排队中任务无进程组可杀');
    assert.equal(store.get('t1')!.status, 'CANCELLED');
  });

  it('不存在的任务取消 → 404', async () => {
    const store = new TaskStore('local');
    const runner = { execute: async () => ({}) };
    const pool = new WorkerPool(store, runner, null, { autoScale: false });
    const routes = createRoutes(pool, store);
    const req = makeReq('/v1/conversions/tasks/nope/cancel');
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/tasks/nope/cancel', 'POST');
    assert.equal(res.status, 404);
  });

  it('已终态任务取消 → 409（不可取消）', async () => {
    const store = new TaskStore('local');
    const runner = { execute: async () => ({}) };
    const pool = new WorkerPool(store, runner, null, { autoScale: false });
    store.create({ id: 't2', priority: 1, params: {}, createdAt: new Date().toISOString() });
    store.updateStatus('t2', 'COMPLETED', { result: {} });
    const routes = createRoutes(pool, store);
    const req = makeReq('/v1/conversions/tasks/t2/cancel');
    const res = makeRes();
    await routes.handle(req, res, '/v1/conversions/tasks/t2/cancel', 'POST');
    assert.equal(res.status, 409);
    const payload = JSON.parse(res.body);
    assert.equal(payload.status, 'COMPLETED');
  });
});
