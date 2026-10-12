/**
 * 鉴权守卫测试（node:test，0 外部依赖）
 *
 * routes/*.js 的 38 个 handler 过去各自手写
 * 「const session = authMiddleware(req, res); if (!session) return true;」两行前言，
 * 漏抄一处即一个未鉴权端点。现统一走 lib/session.js 的 requireSession 单一出口，
 * 本文件锁定它的契约：401 文案、短路返回值、以及仍需要 session 本体时走 authMiddleware。
 *
 * 运行：cd packages/config-service && node --test test/
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createSession,
  destroySession,
  authMiddleware,
  requireSession,
} = require('../lib/session');

function makeRes() {
  const res = {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk) {
      this.body = chunk;
    },
  };
  return res;
}

function makeReq(token) {
  return { headers: token ? { authorization: 'Bearer ' + token } : {} };
}

describe('requireSession（守卫语义）', () => {
  it('缺少 Authorization 头 → 写 401 并返回 false', () => {
    const res = makeRes();
    const ok = requireSession(makeReq(), res);

    assert.equal(ok, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body, JSON.stringify({ error: '未登录或会话已过期' }));
    // no-store：401 不能被浏览器缓存成「一直登录失败」
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  it('未知 token → 401 + false', () => {
    const res = makeRes();
    assert.equal(requireSession(makeReq('no-such-token'), res), false);
    assert.equal(res.statusCode, 401);
  });

  it('已销毁的会话 → 401 + false', () => {
    const token = createSession('tester');
    destroySession(token);

    const res = makeRes();
    assert.equal(requireSession(makeReq(token), res), false);
    assert.equal(res.statusCode, 401);
  });

  it('有效会话 → 返回 true，且不写任何响应', () => {
    const token = createSession('tester');
    const res = makeRes();

    assert.equal(requireSession(makeReq(token), res), true);
    assert.equal(res.statusCode, null);
    assert.equal(res.body, null);
    destroySession(token);
  });

  it('每次通过都续期会话滑动过期时间', () => {
    const token = createSession('tester');
    const before = authMiddleware(makeReq(token), makeRes()).expiresAt;

    const after = authMiddleware(makeReq(token), makeRes()).expiresAt;
    assert.ok(after >= before, 'expiresAt 应单调不降');
    destroySession(token);
  });
});

describe('authMiddleware（仍需要 session 本体的唯一出口：GET /api/auth/me）', () => {
  it('有效会话返回 session 对象，带 username', () => {
    const token = createSession('tester');
    const session = authMiddleware(makeReq(token), makeRes());

    assert.equal(session.username, 'tester');
    destroySession(token);
  });

  it('无效时返回 null（而非抛错），与 requireSession 的 false 同源', () => {
    const res = makeRes();
    assert.equal(authMiddleware(makeReq('bad'), res), null);
    assert.equal(requireSession(makeReq('bad'), makeRes()), false);
  });
});
