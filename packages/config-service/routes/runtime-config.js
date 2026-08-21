const { log, parseBody, sendJson } = require('../lib/utils');
const { authMiddleware } = require('../lib/session');
const serverConfig = require('../server-config');
const sketchesConfig = require('../sketches-config');
const quickCommandConfig = require('../quick-command-config');

async function handle(req, res, pathname, method) {
  if (pathname === '/api/server-config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = serverConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/server-config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = serverConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = serverConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/server-config/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = serverConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="myServerConfig.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return true;
  }

  if (pathname === '/api/server-config/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = serverConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = serverConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/sketches-config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = sketchesConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/sketches-config' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = sketchesConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = sketchesConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/sketches-config/reset' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = sketchesConfig.resetConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/sketches-config/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = sketchesConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition':
        'attachment; filename="mySketchesAndNotesUiConfig.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return true;
  }

  if (pathname === '/api/sketches-config/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = sketchesConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = sketchesConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/quick-command' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = quickCommandConfig.getConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/quick-command' && method === 'PUT') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = quickCommandConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = quickCommandConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/quick-command/reset' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = quickCommandConfig.resetConfig();
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  if (pathname === '/api/quick-command/export' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const config = quickCommandConfig.getConfig();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="myQuickCommand.json"',
    });
    res.end(JSON.stringify(config, null, 2));
    return true;
  }

  if (pathname === '/api/quick-command/import' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const errors = quickCommandConfig.validateConfig(body);

    if (errors && errors.length > 0) {
      sendJson(res, 400, { success: false, error: '校验失败', errors });
      return true;
    }

    const config = quickCommandConfig.updateConfig(body);
    sendJson(res, 200, { success: true, data: config });
    return true;
  }

  return false;
}

module.exports = { handle };
