/**
 * 配置资源路由工厂测试（node:test，0 外部依赖）
 *
 * 覆盖 routes/config-resource.js 的 5 端点 × 统一适配器契约：
 * - GET / PUT / import 的校验失败 → 400 带 errors
 * - reset 的 4 种语义：成功 / 报 error / 报 errors / 未登录
 * - export 的 Content-Disposition
 * - 路由边界：方法或路径不匹配时 handled=false 且不写出响应
 *
 * 运行：cd packages/config-service && node --test test/
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { configResource } = require('../routes/config-resource');
const { createSession } = require('../lib/session');

const CONFIG = { a: 1 };
const RESET_DATA = { reset: true };

function makeFakeAdapter(overrides = {}) {
  return {
    getConfig: () => CONFIG,
    validateConfig: () => [],
    updateConfig: (body) => body,
    resetConfig: () => ({ ok: true, data: RESET_DATA }),
    ...overrides,
  };
}

function makeRoute(adapter) {
  return configResource('fake-config', adapter, 'myFakeConfig.json');
}

function makeReq(token) {
  return {
    headers: token ? { authorization: 'Bearer ' + token } : {},
  };
}

// 带请求体的假请求：parseBody 依赖 data/end 事件
function makeBodyReq(token, body) {
  return {
    headers: token ? { authorization: 'Bearer ' + token } : {},
    on(event, cb) {
      if (event === 'data') cb(JSON.stringify(body));
      if (event === 'end') cb();
    },
  };
}

function makeRes() {
  const captured = { status: null, headers: null, body: null };
  const res = {
    writeHead(status, headers) {
      captured.status = status;
      captured.headers = headers;
    },
    end(body) {
      captured.body =
        body === undefined ? null : JSON.parse(body.toString());
      return res;
    },
  };
  return { res, captured };
}

describe('configResource 工厂', () => {
  it('GET 返回 200 { success: true, data }', async () => {
    const { res, captured } = makeRes();
    const handled = await makeRoute(makeFakeAdapter()).handle(
      makeReq(createSession('tester')),
      res,
      '/api/fake-config',
      'GET'
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    assert.deepEqual(captured.body, { success: true, data: CONFIG });
  });

  it('PUT 校验通过 → 200 回显 updateConfig 结果', async () => {
    const { res, captured } = makeRes();
    const handled = await makeRoute(makeFakeAdapter()).handle(
      makeBodyReq(createSession('tester'), { a: 2 }),
      res,
      '/api/fake-config',
      'PUT'
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    assert.deepEqual(captured.body, { success: true, data: { a: 2 } });
  });

  it('PUT 校验失败 → 400 带 errors', async () => {
    const adapter = makeFakeAdapter({
      validateConfig: () => [{ path: 'x', error: '必须是对象' }],
    });
    const { res, captured } = makeRes();
    const handled = await makeRoute(adapter).handle(
      makeBodyReq(createSession('tester'), { x: 1 }),
      res,
      '/api/fake-config',
      'PUT'
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 400);
    assert.equal(captured.body.success, false);
    assert.equal(captured.body.error, '校验失败');
    assert.deepEqual(captured.body.errors, [{ path: 'x', error: '必须是对象' }]);
  });

  it('reset 成功 → 200 { success: true, data }', async () => {
    const { res, captured } = makeRes();
    const handled = await makeRoute(makeFakeAdapter()).handle(
      makeReq(createSession('tester')),
      res,
      '/api/fake-config/reset',
      'POST'
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    assert.deepEqual(captured.body, { success: true, data: RESET_DATA });
  });

  it('reset 报 error → 400，不伪装成功', async () => {
    const adapter = makeFakeAdapter({
      resetConfig: () => ({ ok: false, error: '默认配置文件不存在，无法还原' }),
    });
    const { res, captured } = makeRes();
    const handled = await makeRoute(adapter).handle(
      makeReq(createSession('tester')),
      res,
      '/api/fake-config/reset',
      'POST'
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 400);
    assert.equal(captured.body.success, false);
    assert.equal(captured.body.error, '默认配置文件不存在，无法还原');
  });

  it('reset 报 errors（默认配置自身校验失败）→ 400 带 errors', async () => {
    const adapter = makeFakeAdapter({
      resetConfig: () => ({ ok: false, errors: [{ path: 'y', error: '坏' }] }),
    });
    const { res, captured } = makeRes();
    const handled = await makeRoute(adapter).handle(
      makeReq(createSession('tester')),
      res,
      '/api/fake-config/reset',
      'POST'
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 400);
    assert.equal(captured.body.success, false);
    assert.deepEqual(captured.body.errors, [{ path: 'y', error: '坏' }]);
  });

  it('export → 200 且带 Content-Disposition 附件头', async () => {
    const { res, captured } = makeRes();
    const handled = await makeRoute(makeFakeAdapter()).handle(
      makeReq(createSession('tester')),
      res,
      '/api/fake-config/export',
      'GET'
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    assert.equal(
      captured.headers['Content-Disposition'],
      'attachment; filename="myFakeConfig.json"'
    );
    assert.deepEqual(captured.body, CONFIG);
  });

  it('import 校验失败 → 400 带 errors', async () => {
    const adapter = makeFakeAdapter({
      validateConfig: () => [{ path: 'z', error: '坏' }],
    });
    const { res, captured } = makeRes();
    const handled = await makeRoute(adapter).handle(
      makeBodyReq(createSession('tester'), { z: 1 }),
      res,
      '/api/fake-config/import',
      'POST'
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 400);
    assert.equal(captured.body.success, false);
    assert.deepEqual(captured.body.errors, [{ path: 'z', error: '坏' }]);
  });

  it('未登录时 5 个端点一律 401，且不得触达适配器', async () => {
    let touched = false;
    const adapter = makeFakeAdapter({
      getConfig: () => {
        touched = true;
        return CONFIG;
      },
      validateConfig: () => {
        touched = true;
        return [];
      },
      resetConfig: () => {
        touched = true;
        return { ok: true, data: RESET_DATA };
      },
    });
    const route = makeRoute(adapter);
    const cases = [
      ['/api/fake-config', 'GET'],
      ['/api/fake-config', 'PUT'],
      ['/api/fake-config/reset', 'POST'],
      ['/api/fake-config/export', 'GET'],
      ['/api/fake-config/import', 'POST'],
    ];
    for (const [pathname, method] of cases) {
      const { res, captured } = makeRes();
      const handled = await route.handle(makeReq(null), res, pathname, method);
      assert.equal(handled, true, `${method} ${pathname} 应被本路由接管`);
      assert.equal(captured.status, 401, `${method} ${pathname} 应 401`);
      assert.deepEqual(captured.body, { error: '未登录或会话已过期' });
    }
    assert.equal(touched, false, '未鉴权不得触达配置模块');
  });

  it('方法或路径不匹配 → handled=false 且不写出响应', async () => {
    const route = makeRoute(makeFakeAdapter());
    const cases = [
      ['/api/fake-config', 'POST'],
      ['/api/fake-config/reset', 'GET'],
      ['/api/fake-config/export', 'POST'],
      ['/api/fake-config/import', 'GET'],
      ['/api/other-config', 'GET'],
    ];
    for (const [pathname, method] of cases) {
      const { res, captured } = makeRes();
      const handled = await route.handle(
        makeReq(createSession('tester')),
        res,
        pathname,
        method
      );
      assert.equal(handled, false, `${method} ${pathname} 不应被接管`);
      assert.equal(captured.status, null, `${method} ${pathname} 不应写出响应`);
    }
  });
});
