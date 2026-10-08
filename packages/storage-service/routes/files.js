const { sendJson, parseBody, log } = require('../lib/utils');

function create(fileHandler, tokenValidator) {

  async function handle(req, res, pathname, method) {
    const base = '/v1/files';

    // POST /v1/files/upload — 需 token
    if (method === 'POST' && pathname === `${base}/upload`) {
      const tokenData = tokenValidator.middleware(req, res);
      if (!tokenData) return sendJson(res, 401, { error: 'Invalid or missing upload token' });

      const body = await parseBody(req);
      // 写入路径只信令牌（后端签发前已做权限校验的权威值）；body.path 不得覆盖，
      // 否则持有效令牌的客户端可借 body.path 写任意路径（ADR-0015）
      const filePath = tokenData.path;
      if (!filePath) return sendJson(res, 400, { error: 'path required' });

      const data = Buffer.isBuffer(body.contents)
        ? body.contents
        : Buffer.from(body.contents || '', 'base64');

      await fileHandler.write(filePath, data);
      // 审计：谁（userId 由后端签进令牌）写了哪个路径。nodeId 已编码在 path（YYYYMM/nodeId/file），
      // 记全 path 即含节点，无需冗余字段（ADR-0015）
      log(`[Upload] 写入 path=${filePath} userId=${tokenData.userId ?? 'anonymous'} size=${data.length}`);
      return sendJson(res, 200, { path: filePath, size: data.length });
    }

    // The path parameter is part of the URL path after /v1/files/
    const fileMatch = pathname.match(new RegExp(`^${base}/(.+)$`));
    if (!fileMatch) return false;

    const filePath = decodeURIComponent(fileMatch[1]);

    switch (method) {
      case 'GET': {
        if (!(await fileHandler.exists(filePath))) {
          return sendJson(res, 404, { error: 'File not found', path: filePath });
        }
        const data = await fileHandler.read(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.length,
          'Cache-Control': 'public, max-age=3600',
        });
        res.end(data);
        return true;
      }

      case 'PUT': {
        const body = await parseBody(req);
        const data = Buffer.isBuffer(body.contents)
          ? body.contents
          : Buffer.from(body.contents || '', 'base64');
        await fileHandler.write(filePath, data);
        return sendJson(res, 200, { path: filePath, size: data.length });
      }

      case 'DELETE': {
        if (!(await fileHandler.exists(filePath))) {
          return sendJson(res, 404, { error: 'File not found', path: filePath });
        }
        await fileHandler.delete(filePath);
        return sendJson(res, 200, { deleted: true, path: filePath });
      }
    }

    return false;
  }

  return { handle };
}

module.exports = { create };
