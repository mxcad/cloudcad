const { sendJson, parseBody } = require('../lib/utils');

function create(svnAgent) {

  async function handle(req, res, pathname, method) {
    const base = '/v1/svn';

    // POST /v1/svn/commit
    if (method === 'POST' && pathname === `${base}/commit`) {
      const body = await parseBody(req);
      if (!body.path) return sendJson(res, 400, { error: 'path required' });
      const result = await svnAgent.commit(body.path, body.message || '');
      return sendJson(res, result.success ? 200 : 500, result);
    }

    // GET /v1/svn/history?path=...
    if (method === 'GET' && pathname === `${base}/history`) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const filePath = url.searchParams.get('path');
      if (!filePath) return sendJson(res, 400, { error: 'path query param required' });
      const entries = await svnAgent.history(filePath);
      return sendJson(res, 200, { path: filePath, entries });
    }

    // GET /v1/svn/cat?path=...&revision=...
    if (method === 'GET' && pathname === `${base}/cat`) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const filePath = url.searchParams.get('path');
      const revision = parseInt(url.searchParams.get('revision') || '0', 10);
      if (!filePath) return sendJson(res, 400, { error: 'path query param required' });
      try {
        const data = await svnAgent.cat(filePath, revision);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.length,
        });
        res.end(data);
        return true;
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    return false;
  }

  return { handle };
}

module.exports = { create };
