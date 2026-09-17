const http = require('http');
const { PORT, FILES_DATA_PATH, INTERNAL_SERVICE_SECRET } = require('./lib/constants');
const { log, resolveRequestId, runWithRequest, sendJson } = require('./lib/utils');
const FileHandler = require('./services/file-handler');
const StorageRouter = require('./services/router');
const SvnAgent = require('./services/svn-agent');
const TokenValidator = require('./services/token');

const fileHandler = new FileHandler();
const storageRouter = new StorageRouter();
const svnAgent = new SvnAgent();
const tokenValidator = new TokenValidator();

const fileRoutes = require('./routes/files').create(fileHandler, tokenValidator);
const svnRoutes = require('./routes/svn').create(svnAgent);
const cacheRoutes = require('./routes/cache').create(fileHandler);

/**
 * #419：校验后端内部路由的共享密钥（可信内网隔离路线的鉴权层）。
 * 仅当配置了 INTERNAL_SERVICE_SECRET 时生效（空值=本地开发/未启用，向后兼容）。
 *
 * 豁免两类路由：
 * - /health：只读探测端点（部署健康检查/监控探活）。
 * - POST /v1/files/upload：客户端直传路由（JWT 上传令牌鉴权，见 UploadTokenService），
 *   属客户端面向路由而非内部服务间调用，客户端不持有内部密钥，故不校验内部密钥。
 */
function isSecretExempt(pathname, method) {
  if (pathname === '/health' && method === 'GET') return true;
  if (pathname === '/v1/files/upload' && method === 'POST') return true;
  return false;
}

function checkSecret(req, res, pathname, method) {
  if (isSecretExempt(pathname, method)) return true;
  if (
    INTERNAL_SERVICE_SECRET &&
    req.headers['x-internal-service-secret'] !== INTERNAL_SERVICE_SECRET
  ) {
    sendJson(res, 401, { error: 'Unauthorized: invalid internal service secret' });
    return false;
  }
  return true;
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // Health
    if (pathname === '/health' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'storage-service',
        filesDataPath: FILES_DATA_PATH,
        timestamp: new Date().toISOString(),
        cache: fileHandler.getCacheStats(),
        nodes: storageRouter.getNodes(),
      });
    }

    // #419：后端内部路由统一校验共享密钥（豁免 /health 与客户端直传 /v1/files/upload）
    if (!checkSecret(req, res, pathname, method)) return;

    // File routes
    if (pathname.startsWith('/v1/files')) {
      const handled = await fileRoutes.handle(req, res, pathname, method);
      if (handled) return;
    }

    // SVN routes
    if (pathname.startsWith('/v1/svn')) {
      const handled = await svnRoutes.handle(req, res, pathname, method);
      if (handled) return;
    }

    // Cache routes
    if (pathname.startsWith('/v1/cache')) {
      const handled = await cacheRoutes.handle(req, res, pathname, method);
      if (handled) return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    log(`[Error] ${err.message}`);
    sendJson(res, 500, { error: 'Internal server error', message: err.message });
  }
}

const server = http.createServer(async (req, res) => {
  // X-Request-Id 透传（ticket #308/#309）：入站缺失/非法时自生成，并回传响应头
  const requestId = resolveRequestId(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Request-Id'
  );
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');

  return runWithRequest(requestId, () => {
    // 轻量访问日志（排除健康检查与 OPTIONS 预检）
    if (req.method !== 'OPTIONS' && req.url.split('?')[0] !== '/health') {
      const pathname = req.url.split('?')[0];
      const start = Date.now();
      res.on('finish', () => {
        log(`[http] ${req.method} ${pathname} ${res.statusCode} ${Date.now() - start}ms`);
      });
    }
    return handleRequest(req, res);
  });
});

server.listen(PORT, () => {
  log(`[server] Storage Service 启动, port=${PORT}`);
  log(`[server] FILES_DATA_PATH=${FILES_DATA_PATH}`);
  log(`[server] 端点:`);
  log(`  GET|PUT|DELETE /v1/files/:path`);
  log(`  POST /v1/files/upload`);
  log(`  POST /v1/svn/commit`);
  log(`  GET  /v1/svn/history`);
  log(`  GET  /v1/svn/cat`);
  log(`  GET  /health`);
});

process.on('SIGTERM', () => { log('[server] SIGTERM, 关闭...'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { log('[server] SIGINT, 关闭...'); server.close(() => process.exit(0)); });
