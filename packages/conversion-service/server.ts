import http from 'http';
import {
  PORT,
  QUEUE_DRIVER,
  REDIS_URL,
  CONVERSION_SERVICE_SECRET,
  INTERNAL_SERVICE_SECRET,
  CONVERSION_SERVICE_REQUIRE_AUTH,
} from './lib/constants';
import { log, resolveRequestId, runWithRequest, sendJson } from './lib/utils';
import TaskStore from './services/task-store';
import WorkerPool from './services/worker-pool';
import CallbackEngine from './services/callback';
import MxcadRunner from './mxcad/runner';
import { create as createConversions } from './routes/conversions';

async function bootstrap(): Promise<void> {
  const taskStore = new TaskStore(QUEUE_DRIVER, { redisUrl: REDIS_URL });
  const runner = new MxcadRunner();
  const callbackEngine = new CallbackEngine(taskStore);
  const workerPool = new WorkerPool(taskStore, runner, callbackEngine);

  await taskStore.init();
  // 崩溃恢复（#431 门禁4）：重启后残留的 PROCESSING 任务重置为 PENDING 重新调度
  // （须在 worker 开始 tick 前，避免竞态）
  taskStore.recoverStuckProcessing();
  workerPool.start();

  const functionRoutes = createConversions(workerPool, taskStore, callbackEngine);

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url!, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;

    try {
      // Health check
      if (pathname === '/health' && method === 'GET') {
        sendJson(res, 200, {
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
        return;
      }

      // Function routes
      const handled = await functionRoutes.handle(req, res, pathname, method);
      if (handled) return;

      sendJson(res, 404, { error: 'Not found', pathname, method });
    } catch (err) {
      log(`[Error] ${(err as Error).message}`);
      sendJson(res, 500, { error: 'Internal server error', message: (err as Error).message });
    }
  }

  const server = http.createServer(async (req, res) => {
    // X-Request-Id 透传（ticket #308/#309）：入站缺失/非法时自生成，并回传响应头
    const requestId = resolveRequestId(req, res);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Conversion-Service-Secret, X-Internal-Service-Secret, X-Request-Id'
    );
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');

    return runWithRequest(requestId, () => {
      // 轻量访问日志（排除健康检查与 OPTIONS 预检）
      if (req.method !== 'OPTIONS' && req.url!.split('?')[0] !== '/health') {
        const pathname = req.url!.split('?')[0];
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

    // 鉴权门禁大声信号（S1-1）：两密钥均未配置时，明确告知当前鉴权状态，
    // 防止生产忘配密钥裸奔（REQUIRE_AUTH=false 时所有非 health 路由无密钥防护）。
    const hasAnySecret = !!(CONVERSION_SERVICE_SECRET || INTERNAL_SERVICE_SECRET);
    if (!hasAnySecret) {
      if (CONVERSION_SERVICE_REQUIRE_AUTH) {
        log('[server] [WARN] 未配置 INTERNAL_SERVICE_SECRET/CONVERSION_SERVICE_SECRET 且 REQUIRE_AUTH=true：所有非 health 路由将拒绝（401）。生产环境请配置密钥。');
      } else {
        log('[server] [WARN] 未配置 INTERNAL_SERVICE_SECRET/CONVERSION_SERVICE_SECRET 且 REQUIRE_AUTH=false：所有非 health 路由无密钥防护（裸奔）。生产环境务必配置密钥或设 CONVERSION_SERVICE_REQUIRE_AUTH=true。');
      }
    }
  });

  const shutdown = () => {
    log('[server] 收到退出信号, 优雅关闭...');
    workerPool.stop();
    taskStore.flush().finally(() => {
      server.close(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  log(`[server] 启动失败: ${(err as Error).message}`);
  process.exit(1);
});
