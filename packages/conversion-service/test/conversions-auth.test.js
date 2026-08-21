'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');

function makeReq(headers, body) {
  const req = new Readable({ read() {} });
  if (body !== undefined) req.push(JSON.stringify(body));
  req.push(null);
  req.headers = headers;
  req.method = 'POST';
  req.url = '/v1/conversions/batchConvert';
  return req;
}

function makeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
  return res;
}

function createRoutes() {
  const store = { get: () => null, list: () => [] };
  const pool = { enqueue: () => {} };
  return require('../routes/conversions').create(pool, store, {});
}

describe('batchConvert 鉴权', () => {
  beforeEach(() => {
    process.env.CONVERSION_SERVICE_SECRET = 'test-secret';
    // 重新加载 constants/routes，捕获最新 env
    for (const mod of ['../lib/constants', '../routes/conversions']) {
      delete require.cache[require.resolve(mod)];
    }
  });

  it('未配置 CONVERSION_SERVICE_SECRET 时放行（向后兼容本地开发）', async () => {
    delete process.env.CONVERSION_SERVICE_SECRET;
    for (const mod of ['../lib/constants', '../routes/conversions']) {
      delete require.cache[require.resolve(mod)];
    }
    const routes = createRoutes();
    const req = makeReq({}, { tasks: [{ srcPath: '/in/1.dwg' }] });
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 202, '无 secret 配置时应正常提交');
  });

  it('缺少 secret 请求头返回 401', async () => {
    const routes = createRoutes();
    const req = makeReq({}, { tasks: [{ srcPath: '/in/1.dwg' }] });
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 401);
    const payload = JSON.parse(res.body);
    assert.match(payload.error, /secret/i);
  });

  it('secret 请求头不匹配返回 401', async () => {
    const routes = createRoutes();
    const req = makeReq(
      { 'x-conversion-service-secret': 'wrong-secret' },
      { tasks: [{ srcPath: '/in/1.dwg' }] }
    );
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 401);
  });

  it('secret 请求头匹配时放行', async () => {
    const routes = createRoutes();
    const req = makeReq(
      { 'x-conversion-service-secret': 'test-secret' },
      { tasks: [{ srcPath: '/in/1.dwg' }] }
    );
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 202);
    const payload = JSON.parse(res.body);
    assert.ok(payload.taskId);
  });

  it('批量转换其他路由（同步 convertFile）不受 secret 校验影响', async () => {
    const routes = createRoutes();
    const req = makeReq({}, { params: {} });
    const res = makeRes();

    // 同步 convertFile 路径：因无真实任务存储而最终 reject（Task not found），
    // 关键断言：错误与 secret 无关，且响应不是 401
    try {
      await routes.handle(req, res, '/v1/conversions/convertFile', 'POST');
    } catch (err) {
      assert.doesNotMatch(String(err), /secret/i, 'convertFile 不应被 secret 拦截');
    }
    assert.notEqual(res.status, 401, '非 batch 路由不应被 secret 拦截');
  });
});
