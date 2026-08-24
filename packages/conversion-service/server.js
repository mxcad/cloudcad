const http = require('http');
const { PORT, QUEUE_DRIVER, REDIS_URL } = require('./lib/constants');
const { log, resolveRequestId, runWithRequest, sendJson } = require('./lib/utils');
const TaskStore = require('./services/task-store');
const WorkerPool = require('./services/worker-pool');
const CallbackEngine = require('./services/callback');
const MxcadRunner = require('./mxcad/runner');

async function bootstrap() {
  const taskStore = new TaskStore(QUEUE_DRIVER, { redisUrl: REDIS_URL });
  const runner = new MxcadRunner();
  const callbackEngine = new CallbackEngine(taskStore);
  const workerPool = new WorkerPool(taskStore, runner, callbackEngine);

  await taskStore.init();
  workerPool.start();

  const functionRoutes = require('./routes/conversions').create(workerPool, taskStore, callbackEngine);

  async function handleRequest(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;

    try {
      // Health check
      if (pathname === '/health' && method === 'GET') {
        return sendJson(res, 200, {
          status: 'ok',
          service: 'conversion-service',
          driver: taskStore.getDriver(),
          redis: taskStore.isRedis(),
          redisFallback: taskStore.isFallback(),
          timestamp: new Date().toISOString(),
          stats: {
            tasks: taskStore.getStats(),
            workers: workerPool.getStats(),
          },
        });
      }

      // Function routes
      const handled = await functionRoutes.handle(req, res, pathname, method);
      if (handled) return;

      sendJson(res, 404, { error: 'Not found', pathname, method });
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
      'Content-Type, Authorization, X-Conversion-Service-Secret, X-Request-Id'
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
    log(`[server] Conversion Service 启动, port=${PORT}, driver=${taskStore.getDriver()}${taskStore.isFallback() ? ' (redis 不可用, 已回退内存)' : ''}`);
    log(`[server] 端点:`);
    log(`  POST /v1/conversions/convertFile`);
    log(`  POST /v1/conversions/async/convertFile`);
    log(`  POST /v1/conversions/batchConvert`);
    log(`  GET  /v1/conversions/tasks/:taskId`);
    log(`  GET  /v1/conversions/tasks`);
    log(`  GET  /v1/conversions/stats`);
    log(`  GET  /health`);
  });

  const shutdown = () => {
    log('[server] 收到退出信号, 优雅关闭...');
    workerPool.stop();
    taskStore.flush().finally(() => server.close(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  log(`[server] 启动失败: ${err.message}`);
  process.exit(1);
});
