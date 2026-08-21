const { sendJson } = require('../lib/utils');
const { authMiddleware } = require('../lib/session');
const {
  getAllServicesStatus,
  restartService,
  stopService,
  startService,
} = require('../lib/pm2');

async function handle(req, res, pathname, method) {
  if (pathname === '/api/service/status' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const result = getAllServicesStatus();
    sendJson(res, result.success ? 200 : 500, result);
    return true;
  }

  if (pathname.match(/^\/api\/service\/[^/]+\/restart$/) && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const serviceName = pathname.split('/')[3];
    const result = restartService(serviceName);
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  if (pathname.match(/^\/api\/service\/[^/]+\/stop$/) && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const serviceName = pathname.split('/')[3];
    const result = stopService(serviceName);
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  if (pathname.match(/^\/api\/service\/[^/]+\/start$/) && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const serviceName = pathname.split('/')[3];
    const result = startService(serviceName);
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  return false;
}

module.exports = { handle };
