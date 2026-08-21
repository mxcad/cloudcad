const { log, parseBody, sendJson } = require('../lib/utils');
const { authMiddleware } = require('../lib/session');
const uiConfig = require('../ui-config');
const themeConfig = require('../theme-config');

async function handle(req, res, pathname, method) {
  if (pathname === '/api/ui-config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;
    const config = uiConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/ui-config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = uiConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = uiConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/ui-config/reset' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = uiConfig.resetConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/ui-config/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = uiConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="myUiConfig.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return true;
  }

  if (pathname === '/api/ui-config/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = uiConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = uiConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/theme-config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = themeConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/theme-config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = themeConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = themeConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/theme-config/reset' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = themeConfig.resetConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/theme-config/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = themeConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="myVuetifyThemeConfig.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return true;
  }

  if (pathname === '/api/theme-config/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = themeConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = themeConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  return false;
}

module.exports = { handle };
