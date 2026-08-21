const http = require('http');
const { PORT, FILES_DATA_PATH } = require('./lib/constants');
const { log, sendJson } = require('./lib/utils');
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

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
