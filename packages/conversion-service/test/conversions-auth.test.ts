import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';

// 测试用假请求：Readable 承载请求体，叠加 headers/method/url（动态边界，用 any）
function makeReq(headers: Record<string, string>, body: any): any {
  const req: any = new Readable({ read() {} });
  if (body !== undefined) req.push(JSON.stringify(body));
  req.push(null);
  req.headers = headers;
  req.method = 'POST';
  req.url = '/v1/conversions/batchConvert';
  return req;
}

function makeRes(): any {
  const res: any = {
    status: null,
    body: null,
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status;
      this.headers = headers;
    },
    end(body: string) {
      this.body = body;
    },
  };
  return res;
}

function createRoutes(): any {
  const store = { get: () => null, list: () => [] };
  const pool = { enqueue: () => {} };
  return require('../routes/conversions').create(pool, store, {});
}

describe('batchConvert 鉴权', () => {
  beforeEach(() => {
    process.env.CONVERSION_SERVICE_SECRET = 'test-secret';
    delete process.env.INTERNAL_SERVICE_SECRET;
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

  it('#419 所有非 health 路由均校验：同步 convertFile 无密钥返回 401', async () => {
    const routes = createRoutes();
    const req = makeReq({}, { params: {} });
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/convertFile', 'POST');

    assert.equal(res.status, 401, '非 health 路由（convertFile）无密钥应被拦截');
  });

  it('#419 同步 convertFile 带正确 secret 时放行（非 401）', async () => {
    const routes = createRoutes();
    const req = makeReq(
      { 'x-conversion-service-secret': 'test-secret' },
      { params: {} }
    );
    const res = makeRes();

    // 带正确密钥应通过 checkSecret（后续因无真实任务存储可能 reject，但绝不是 401）
    try {
      await routes.handle(req, res, '/v1/conversions/convertFile', 'POST');
    } catch (err) {
      assert.doesNotMatch(String(err), /secret/i, '带正确密钥不应被 secret 拦截');
    }
    assert.notEqual(res.status, 401, '带正确密钥的 convertFile 不应返回 401');
  });
});

describe('#419 统一内网密钥 X-Internal-Service-Secret', () => {
  function reload() {
    for (const mod of ['../lib/constants', '../routes/conversions']) {
      delete require.cache[require.resolve(mod)];
    }
  }

  beforeEach(() => {
    // 确定性：每个用例前清空两密钥，由各用例显式设置所需组合
    delete process.env.INTERNAL_SERVICE_SECRET;
    delete process.env.CONVERSION_SERVICE_SECRET;
  });

  it('仅配置 INTERNAL_SERVICE_SECRET 时，统一密钥头放行', async () => {
    process.env.INTERNAL_SERVICE_SECRET = 'internal-secret';
    delete process.env.CONVERSION_SERVICE_SECRET;
    reload();
    const routes = createRoutes();
    const req = makeReq(
      { 'x-internal-service-secret': 'internal-secret' },
      { tasks: [{ srcPath: '/in/1.dwg' }] }
    );
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');
    assert.equal(res.status, 202, '统一密钥头应放行');
  });

  it('仅配置 INTERNAL_SERVICE_SECRET 时，旧密钥头不放行（401）', async () => {
    process.env.INTERNAL_SERVICE_SECRET = 'internal-secret';
    delete process.env.CONVERSION_SERVICE_SECRET;
    reload();
    const routes = createRoutes();
    const req = makeReq(
      { 'x-conversion-service-secret': 'internal-secret' },
      { tasks: [{ srcPath: '/in/1.dwg' }] }
    );
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');
    assert.equal(res.status, 401, '旧密钥头在仅配置统一密钥时应被拒');
  });

  it('同时配置两密钥时，任一匹配即放行（向后兼容）', async () => {
    process.env.INTERNAL_SERVICE_SECRET = 'internal-secret';
    process.env.CONVERSION_SERVICE_SECRET = 'legacy-secret';
    reload();
    const routes = createRoutes();
    const req = makeReq(
      { 'x-conversion-service-secret': 'legacy-secret' },
      { tasks: [{ srcPath: '/in/1.dwg' }] }
    );
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');
    assert.equal(res.status, 202, '旧密钥头在双密钥配置下应放行');
  });
});

describe('CONVERSION_SERVICE_REQUIRE_AUTH 门禁（S1-1 生产忘配密钥防裸奔）', () => {
  function reload() {
    for (const mod of ['../lib/constants', '../routes/conversions']) {
      delete require.cache[require.resolve(mod)];
    }
  }

  beforeEach(() => {
    // 确定性：清空两密钥 + REQUIRE_AUTH，由各用例显式设置
    delete process.env.INTERNAL_SERVICE_SECRET;
    delete process.env.CONVERSION_SERVICE_SECRET;
    delete process.env.CONVERSION_SERVICE_REQUIRE_AUTH;
    delete process.env.NODE_ENV;
  });

  it('两密钥均未配置 + REQUIRE_AUTH=true → 401（生产忘配密钥不再裸奔）', async () => {
    process.env.CONVERSION_SERVICE_REQUIRE_AUTH = 'true';
    reload();
    const routes = createRoutes();
    const req = makeReq({}, { tasks: [{ srcPath: '/in/1.dwg' }] });
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 401, '两密钥未配置且 REQUIRE_AUTH=true 时应拒绝');
    const payload = JSON.parse(res.body);
    assert.match(payload.error, /secret/i);
  });

  it('两密钥均未配置 + REQUIRE_AUTH=false → 放行（本地开发向后兼容）', async () => {
    process.env.CONVERSION_SERVICE_REQUIRE_AUTH = 'false';
    reload();
    const routes = createRoutes();
    const req = makeReq({}, { tasks: [{ srcPath: '/in/1.dwg' }] });
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 202, 'REQUIRE_AUTH=false 时两密钥未配置应放行');
  });

  it('两密钥均未配置 + REQUIRE_AUTH 未设 + 非生产环境 → 默认放行（向后兼容）', async () => {
    // NODE_ENV 未设（非 production）→ REQUIRE_AUTH 默认 false
    reload();
    const routes = createRoutes();
    const req = makeReq({}, { tasks: [{ srcPath: '/in/1.dwg' }] });
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 202, '非生产环境 REQUIRE_AUTH 默认 false，两密钥未配置应放行');
  });

  it('两密钥均未配置 + REQUIRE_AUTH 未设 + NODE_ENV=production → 默认拒绝（生产安全默认）', async () => {
    process.env.NODE_ENV = 'production';
    reload();
    const routes = createRoutes();
    const req = makeReq({}, { tasks: [{ srcPath: '/in/1.dwg' }] });
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 401, '生产环境 REQUIRE_AUTH 默认 true，两密钥未配置应拒绝');
  });

  it('已配置任一密钥时 REQUIRE_AUTH 不影响校验逻辑（密钥头不匹配仍 401）', async () => {
    process.env.CONVERSION_SERVICE_SECRET = 'test-secret';
    process.env.CONVERSION_SERVICE_REQUIRE_AUTH = 'true';
    reload();
    const routes = createRoutes();
    const req = makeReq(
      { 'x-conversion-service-secret': 'wrong' },
      { tasks: [{ srcPath: '/in/1.dwg' }] }
    );
    const res = makeRes();

    await routes.handle(req, res, '/v1/conversions/batchConvert', 'POST');

    assert.equal(res.status, 401, '已配置密钥时走正常校验，REQUIRE_AUTH 不改变密钥头匹配逻辑');
  });
});
