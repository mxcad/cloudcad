const { sendJson } = require('../lib/utils');

function create(fileHandler) {

  async function handle(req, res, pathname, method) {
    const base = '/v1/cache';

    // GET /v1/cache/stats
    if (method === 'GET' && pathname === `${base}/stats`) {
      return sendJson(res, 200, {
        cache: fileHandler.getCacheStats(),
        timestamp: new Date().toISOString(),
      });
    }

    // DELETE /v1/cache — 清空缓存
    if (method === 'DELETE' && pathname === base) {
      fileHandler.clearCache();
      return sendJson(res, 200, { purged: true, timestamp: new Date().toISOString() });
    }

    return false;
  }

  return { handle };
}

module.exports = { create };
