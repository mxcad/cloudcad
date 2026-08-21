const { log, sendJson, parseBody, generateId } = require('../lib/utils');
const { CONVERSION_SERVICE_SECRET } = require('../lib/constants');

/**
 * 校验管理类路由的共享密钥（仅配置了 CONVERSION_SERVICE_SECRET 时生效）
 */
function checkSecret(req, res) {
  if (
    CONVERSION_SERVICE_SECRET &&
    req.headers['x-conversion-service-secret'] !== CONVERSION_SERVICE_SECRET
  ) {
    sendJson(res, 401, { error: 'Unauthorized: invalid conversion service secret' });
    return false;
  }
  return true;
}

/**
 * HTTP 路由: /v1/conversions/*
 *
 * - POST /v1/conversions/convertFile        — 同步转换（等待结果）
 * - POST /v1/conversions/async/convertFile  — 异步转换（返回 taskId）
 * - POST /v1/conversions/batchConvert       — 批量转换（聚合任务，返回 taskId）
 * - GET  /v1/conversions/tasks/:taskId      — 查询任务状态
 * - GET  /v1/conversions/tasks              — 列出任务（可选 ?status=）
 * - GET  /v1/conversions/stats              — 工作池统计
 */
function create(workerPool, taskStore, callbackEngine) {

  async function handle(req, res, pathname, method) {
    const base = '/v1/conversions';

    // POST /v1/conversions/convertFile — sync
    if (method === 'POST' && pathname === `${base}/convertFile`) {
      const body = await parseBody(req);
      const taskId = generateId();
      const task = {
        id: taskId,
        priority: body.priority || 2,
        params: body.params || body,
        callbackUrl: null,
        createdAt: new Date().toISOString(),
      };

      workerPool.enqueue(task);
      log(`[Sync] 等待转换完成: ${taskId}`);

      const result = await waitForTask(taskId, taskStore, 180000);
      return sendJson(res, result.status === 'COMPLETED' ? 200 : 500, result);
    }

    // POST /v1/conversions/async/convertFile — async
    if (method === 'POST' && pathname === `${base}/async/convertFile`) {
      const body = await parseBody(req);
      const taskId = generateId();
      const task = {
        id: taskId,
        priority: body.priority || 2,
        params: body.params || body,
        callbackUrl: body.callbackUrl || null,
        createdAt: new Date().toISOString(),
      };

      workerPool.enqueue(task);
      log(`[Async] 任务已提交: ${taskId}`);

      return sendJson(res, 202, {
        taskId,
        status: 'PENDING',
        message: '任务已提交，可通过 GET /v1/conversions/tasks/{taskId} 查询状态',
      });
    }

    // POST /v1/conversions/batchConvert — batch 批量转换（聚合任务）
    if (method === 'POST' && pathname === `${base}/batchConvert`) {
      if (!checkSecret(req, res)) return;
      const body = await parseBody(req);
      if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
        return sendJson(res, 400, { error: 'tasks 必须是非空数组' });
      }
      for (const t of body.tasks) {
        if (!t || !t.srcPath) {
          return sendJson(res, 400, {
            error: '每个子任务必须包含 srcPath',
            task: t && t.id,
          });
        }
      }

      const taskId = generateId();
      const task = {
        id: taskId,
        priority: body.priority || 2,
        type: 'batch',
        params: { tasks: body.tasks },
        callbackUrl: body.callbackUrl || null,
        createdAt: new Date().toISOString(),
      };

      workerPool.enqueue(task);
      log(`[Batch] 批量转换已提交: ${taskId} (${body.tasks.length} 个文件)`);

      return sendJson(res, 202, { taskId, status: 'PENDING' });
    }

    // GET /v1/conversions/tasks/:taskId
    const taskMatch = pathname.match(new RegExp(`^${base}/tasks/([^/]+)$`));
    if (method === 'GET' && taskMatch) {
      const taskId = taskMatch[1];
      const task = taskStore.get(taskId);
      if (!task) return sendJson(res, 404, { error: 'Task not found', taskId });
      return sendJson(res, 200, {
        taskId: task.id,
        status: task.status,
        progress: task.progress,
        result: task.result,
        error: task.error,
        priority: task.priority,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    }

    // GET /v1/conversions/tasks
    if (method === 'GET' && pathname === `${base}/tasks`) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const status = url.searchParams.get('status') || undefined;
      const filter = status ? { status } : {};
      const tasks = taskStore.list(filter);
      return sendJson(res, 200, { tasks, total: tasks.length });
    }

    // GET /v1/conversions/stats
    if (method === 'GET' && pathname === `${base}/stats`) {
      return sendJson(res, 200, {
        tasks: taskStore.getStats(),
        workers: workerPool.getStats(),
      });
    }

    return false;
  }

  return { handle };
}

function waitForTask(taskId, taskStore, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const task = taskStore.get(taskId);
      if (!task) {
        clearInterval(interval);
        return reject(new Error('Task not found'));
      }
      if (task.status === 'COMPLETED') {
        clearInterval(interval);
        return resolve({ taskId, status: 'COMPLETED', result: task.result });
      }
      if (task.status === 'FAILED') {
        clearInterval(interval);
        return resolve({ taskId, status: 'FAILED', error: task.error });
      }
      if (Date.now() - start > timeout) {
        clearInterval(interval);
        return resolve({ taskId, status: 'TIMEOUT', error: 'Sync wait timeout' });
      }
    }, 200);
  });
}

module.exports = { create };
