/**
 * 服务器配置「还原默认」端点回归测试（node:test，0 外部依赖）
 *
 * 覆盖 routes/runtime-config.js 的 POST /api/server-config/reset：
 * - 鉴权（未登录一律 401，且不得触达 resetConfig）
 * - 成功路径透传 serverConfig.resetConfig() 的返回值
 * - 源配置文件缺失（返回 null）时不得伪装成功
 * - 路由边界：/reset 不会被同文件其它 server-config 分支误吞
 *
 * 运行：cd packages/config-service && npm test（或 node --test test/）
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { handle } = require('../routes/runtime-config');
const { createSession } = require('../lib/session');
const serverConfig = require('../server-config');

const SOURCE_CONFIG = { wasmConfig: { type: '2d' }, webgl1: false };

function makeReq(token) {
  return {
    headers: token ? { authorization: 'Bearer ' + token } : {},
  };
}

function makeRes() {
  const captured = { status: null, body: null };
  const res = {
    writeHead(status, headers) {
      captured.status = status;
      captured.headers = headers;
    },
    end(body) {
      captured.body = body === undefined ? null : JSON.parse(body);
      return res;
    },
  };
  return { res, captured };
}

describe('POST /api/server-config/reset', () => {
  let calls;
  const originalReset = serverConfig.resetConfig;

  beforeEach(() => {
    calls = [];
    serverConfig.resetConfig = (...args) => {
      calls.push(args);
      return SOURCE_CONFIG;
    };
  });

  afterEach(() => {
    serverConfig.resetConfig = originalReset;
  });

  it('未登录返回 401，且不调用 resetConfig', async () => {
    const { res, captured } = makeRes();

    const handled = await handle(
      makeReq(null),
      res,
      '/api/server-config/reset',
      'POST'
    );

    assert.equal(handled, true);
    assert.equal(captured.status, 401);
    assert.deepEqual(captured.body, { error: '未登录或会话已过期' });
    assert.equal(calls.length, 0, '未鉴权不得触达配置模块');
  });

  it('已登录返回 200 并透传 resetConfig 的结果', async () => {
    const token = createSession('tester');
    const { res, captured } = makeRes();

    const handled = await handle(
      makeReq(token),
      res,
      '/api/server-config/reset',
      'POST'
    );

    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    assert.deepEqual(captured.body, { success: true, data: SOURCE_CONFIG });
    assert.equal(calls.length, 1);
  });

  it('源配置文件缺失（resetConfig 返回 null）时报 400，不伪装成功', async () => {
    serverConfig.resetConfig = () => null;
    const token = createSession('tester');
    const { res, captured } = makeRes();

    const handled = await handle(
      makeReq(token),
      res,
      '/api/server-config/reset',
      'POST'
    );

    assert.equal(handled, true);
    assert.equal(captured.status, 400);
    assert.equal(captured.body.success, false);
    assert.match(captured.body.error, /默认配置文件不存在/);
  });

  it('GET /api/server-config/reset 不被任何分支吞掉（交给上层 404）', async () => {
    const { res, captured } = makeRes();

    const handled = await handle(
      makeReq(createSession('tester')),
      res,
      '/api/server-config/reset',
      'GET'
    );

    assert.equal(handled, false);
    assert.equal(captured.status, null, '不应写出任何响应');
  });

  it('POST /api/server-config 与 POST /api/server-config/export 同样不被吞', async () => {
    const token = createSession('tester');
    const res1 = makeRes();
    const res2 = makeRes();

    assert.equal(await handle(makeReq(token), res1.res, '/api/server-config', 'POST'), false);
    assert.equal(
      await handle(makeReq(token), res2.res, '/api/server-config/export', 'POST'),
      false
    );
    assert.equal(res1.captured.status, null);
    assert.equal(res2.captured.status, null);
  });

  it('GET /api/server-config 原分支不受影响', async () => {
    const originalGet = serverConfig.getConfig;
    serverConfig.getConfig = () => SOURCE_CONFIG;
    try {
      const { res, captured } = makeRes();
      const handled = await handle(
        makeReq(createSession('tester')),
        res,
        '/api/server-config',
        'GET'
      );
      assert.equal(handled, true);
      assert.equal(captured.status, 200);
      assert.deepEqual(captured.body, { success: true, data: SOURCE_CONFIG });
    } finally {
      serverConfig.getConfig = originalGet;
    }
  });
});
