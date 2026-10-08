/**
 * 配置资源路由工厂
 *
 * 5 个配置适配器（server / ui / theme / sketches / quick-command）× 5 个端点
 * （GET / PUT / reset / export / import）共用同一模板。工厂统一把适配器结果
 * 翻译成 HTTP 状态码，「reset 应该返回什么」的契约只在此处拥有：
 * 适配器 resetConfig() 只回一种形状 { ok, data, error, errors }，
 * 成功 → 200 { success: true, data }；失败 → 400 { success: false, error }。
 *
 * 适配器契约（唯一形状）：
 *   getConfig()          → config | null
 *   validateConfig(body) → errors[]（空数组 = 通过）
 *   updateConfig(body)   → config
 *   resetConfig()        → { ok: true, data } | { ok: false, error, errors? }
 */

const { parseBody, sendJson } = require('../lib/utils');
const { authMiddleware } = require('../lib/session');

function configResource(prefix, adapter, exportFilename) {
  const base = `/api/${prefix}`;

  // PUT 与 import 是同一操作（校验 body 后落盘），共用一个处理函数
  async function handleWrite(req, res) {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = adapter.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    sendJson(res, 200, { success: true, data: adapter.updateConfig(body) });
    return true;
  }

  async function handle(req, res, pathname, method) {
    if (pathname === base && method === 'GET') {
      const session = authMiddleware(req, res);
      if (!session) return true;

      sendJson(res, 200, { success: true, data: adapter.getConfig() });
      return true;
    }

    if (pathname === base && method === 'PUT') {
      return handleWrite(req, res);
    }

    if (pathname === `${base}/reset` && method === 'POST') {
      const session = authMiddleware(req, res);
      if (!session) return true;

      const result = adapter.resetConfig();

      if (!result.ok) {
        // 失败不得伪装成功：源配置缺失/还原失败一律 400，前端据此提示真实原因
        const payload = { success: false, error: result.error };
        if (result.errors) payload.errors = result.errors;
        sendJson(res, 400, payload);
        return true;
      }

      sendJson(res, 200, { success: true, data: result.data });
      return true;
    }

    if (pathname === `${base}/export` && method === 'GET') {
      const session = authMiddleware(req, res);
      if (!session) return true;

      const config = adapter.getConfig();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${exportFilename}"`,
      });
      res.end(JSON.stringify(config, null, 2));
      return true;
    }

    if (pathname === `${base}/import` && method === 'POST') {
      return handleWrite(req, res);
    }

    return false;
  }

  return { handle };
}

module.exports = { configResource };
