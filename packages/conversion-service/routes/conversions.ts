import { log, sendJson, parseBody, generateId, deriveContentKey } from '../lib/utils';
import type { RequestLike, ResponseLike } from '../lib/utils';
import type { IncomingHttpHeaders } from 'http';
import {
  CONVERSION_SERVICE_SECRET,
  INTERNAL_SERVICE_SECRET,
  CONVERSION_SERVICE_REQUIRE_AUTH,
} from '../lib/constants';
import type { TaskRecord, TaskInput, TaskFilter, TaskStats, DurationStats } from '../services/task-store';
import type { WorkerStats } from '../services/worker-pool';

// 路由层请求结构：IncomingMessage 与测试假对象（Readable + headers/method/url）均满足
interface RouteRequest extends RequestLike {
  url?: string;
  headers: IncomingHttpHeaders;
}

// 路由层依赖结构：真实 TaskStore/WorkerPool 与测试假对象均满足
interface RouteTaskStore {
  get(taskId: string): TaskRecord | null;
  list(filter?: TaskFilter): TaskRecord[];
  getStats(): TaskStats;
  getDurationStats(): DurationStats;
  findInFlightByContentKey(contentKey: string): TaskRecord | null;
  create(task: TaskInput): TaskRecord;
  updateStatus(taskId: string, status: string, extra?: Partial<TaskRecord>): TaskRecord | null;
}

interface RouteWorkerPool {
  enqueue(task: any): void;
  getStats(): WorkerStats;
  cancel(taskId: string): { ok: boolean; status?: string; reason?: string; killed: boolean };
  // 排队位置（S6-5）：仅排队中任务有意义，否则 null
  getQueuePosition(taskId: string): number | null;
}

interface RouteCallbackEngine {
  notify(taskId: string, result: { status: string; result: unknown; error?: unknown }): Promise<void>;
}

/**
 * 校验非 health 路由的共享密钥（#419 等保 8.1.2.2）。
 *
 * 可信内网隔离路线的鉴权层：后端对所有 /v1/conversions/* 路由带
 * X-Internal-Service-Secret 头。任一已配置密钥匹配即放行：
 * - X-Internal-Service-Secret == INTERNAL_SERVICE_SECRET（统一密钥，新）
 * - X-Conversion-Service-Secret == CONVERSION_SERVICE_SECRET（batchConvert 旧链路，向后兼容）
 *
 * 两者均未配置时：默认跳过校验（本地开发/内网部署向后兼容）；但生产忘配密钥会裸奔，
 * 故加 CONVERSION_SERVICE_REQUIRE_AUTH 门禁（默认生产 true / 其他环境 false）——
 * 两密钥均未配置且 REQUIRE_AUTH=true 时拒绝（401），防止生产忘配密钥裸奔。
 */
function checkSecret(req: RouteRequest, res: ResponseLike): boolean {
  const hasAnySecret = !!(CONVERSION_SERVICE_SECRET || INTERNAL_SERVICE_SECRET);
  if (!hasAnySecret) {
    if (CONVERSION_SERVICE_REQUIRE_AUTH) {
      sendJson(res, 401, {
        error:
          'Unauthorized: no secret configured. Set INTERNAL_SERVICE_SECRET or CONVERSION_SERVICE_SECRET, or set CONVERSION_SERVICE_REQUIRE_AUTH=false to allow open access.',
      });
      return false;
    }
    return true;
  }

  const internalOk =
    INTERNAL_SERVICE_SECRET &&
    req.headers['x-internal-service-secret'] === INTERNAL_SERVICE_SECRET;
  const legacyOk =
    CONVERSION_SERVICE_SECRET &&
    req.headers['x-conversion-service-secret'] === CONVERSION_SERVICE_SECRET;

  if (!internalOk && !legacyOk) {
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
 * - POST /v1/conversions/tasks/:taskId/cancel — 取消任务（排队中出队 / 运行中杀进程组）
 * - GET  /v1/conversions/tasks/:taskId      — 查询任务状态
 * - GET  /v1/conversions/tasks              — 列出任务（可选 ?status=）
 * - GET  /v1/conversions/stats              — 工作池统计
 */
function create(
  workerPool: RouteWorkerPool,
  taskStore: RouteTaskStore,
  callbackEngine: RouteCallbackEngine
) {

  /**
   * 提交单个转换任务（同步/异步共用）。
   * 同内容身份在途合并去重（#431 门禁3）：已有 PENDING/PROCESSING 同 key 任务则挂上去。
   */
  function submitConvertTask(body: Record<string, unknown>, callbackUrl: string | null): {
    taskId: string;
    status: string;
    merged: boolean;
    contentKey: string | null;
  } {
    const params: Record<string, unknown> = (body.params as Record<string, unknown>) || body;
    const contentKey = deriveContentKey(params);
    if (contentKey) {
      const inFlight = taskStore.findInFlightByContentKey(contentKey);
      if (inFlight) {
        log(`[Dedup] 同内容身份合并到在途任务: ${inFlight.id} (contentKey=${contentKey})`);
        return { taskId: inFlight.id, status: inFlight.status, merged: true, contentKey };
      }
    }
    const taskId = generateId();
    workerPool.enqueue({
      id: taskId,
      priority: body.priority || 2,
      params,
      callbackUrl,
      createdAt: new Date().toISOString(),
      contentKey,
    });
    return { taskId, status: 'PENDING', merged: false, contentKey };
  }

  async function handle(req: RouteRequest, res: ResponseLike, pathname: string, method: string | undefined): Promise<boolean> {
    const base = '/v1/conversions';

    // #419：所有非 health 路由统一校验共享密钥（health 由 server.js 先行处理）
    if (!checkSecret(req, res)) return true;

    // POST /v1/conversions/convertFile — sync
    if (method === 'POST' && pathname === `${base}/convertFile`) {
      const body = await parseBody(req);
      const { taskId, merged } = submitConvertTask(body, null);
      log(`[Sync] 等待转换完成: ${taskId}${merged ? ' (合并到在途任务)' : ''}`);

      // S1-3：客户端断开（req 'close'）时 abort 轮询，避免 interval 跑到 180s 超时浪费 CPU。
      // 180s waitForTask 超时仍是有界的服务端兜底（客户端不断开时）。
      const controller = new AbortController();
      const onClientClose = () => {
        if (!controller.signal.aborted) {
          controller.abort();
          log(`[Sync] 客户端断开，停止等待: ${taskId}`);
        }
      };
      req.on('close', onClientClose);
      try {
        const result = await waitForTask(taskId, taskStore, 180000, controller.signal);
        return sendJson(res, result.status === 'COMPLETED' ? 200 : 500, result);
      } catch (err) {
        // 客户端断开导致的 abort：响应已无意义（客户端已走），不再发送
        log(`[Sync] 等待中断: ${taskId} (${(err as Error).message})`);
        return true;
      }
    }

    // POST /v1/conversions/async/convertFile — async
    if (method === 'POST' && pathname === `${base}/async/convertFile`) {
      const body = await parseBody(req);
      const { taskId, status, merged, contentKey } = submitConvertTask(
        body,
        (body.callbackUrl as string | undefined) || null
      );
      log(`[Async] 任务已提交: ${taskId}${merged ? ' (合并到在途任务)' : ''}`);

      return sendJson(res, 202, {
        taskId,
        status,
        merged,
        // 内容身份（#441）：前端队列面板按内容派生身份展示/去重感知；无识别字段时为 null
        contentKey,
        message: '任务已提交，可通过 GET /v1/conversions/tasks/{taskId} 查询状态',
      });
    }

    // POST /v1/conversions/batchConvert — batch 批量转换（聚合任务）
    if (method === 'POST' && pathname === `${base}/batchConvert`) {
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

    // POST /v1/conversions/tasks/:taskId/cancel — 取消任务（#431 取消机制）
    // 排队中（PENDING）→ 出队不再执行；运行中（PROCESSING）→ 杀 mxcadassembly 进程组
    const cancelMatch = pathname.match(new RegExp(`^${base}/tasks/([^/]+)/cancel$`));
    if (method === 'POST' && cancelMatch) {
      const taskId = cancelMatch[1];
      const result = workerPool.cancel(taskId);
      if (result.reason === 'not_found') {
        return sendJson(res, 404, { error: 'Task not found', taskId });
      }
      if (!result.ok) {
        // 已终态（COMPLETED/FAILED/CANCELLED）：不可取消
        return sendJson(res, 409, {
          taskId,
          status: result.status,
          error: `任务已处于终态 ${result.status}，不可取消`,
        });
      }
      return sendJson(res, 200, {
        taskId,
        status: 'CANCELLED',
        killed: result.killed,
        message: result.killed
          ? '任务已取消，转换进程已终止'
          : '任务已取消（已从排队中移除）',
      });
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
        // 失败性质分类与引擎返回码：结构化过线，backend 据此判定「可重试 vs 确定性失败」，
        // 不再按 error 文案反推（此前两侧靠中文字符串匹配，改文案即静默翻转语义）。
        errorCategory: task.errorCategory ?? null,
        errorCode: task.errorCode ?? null,
        // 排队位置（S6-5）：仅排队中任务有意义，运行中/未入队/终态为 null
        queuePosition: workerPool.getQueuePosition(taskId),
        priority: task.priority,
        createdAt: task.createdAt,
        startedAt: task.startedAt || null,
        completedAt: task.completedAt || null,
        updatedAt: task.updatedAt,
      });
    }

    // GET /v1/conversions/tasks
    if (method === 'GET' && pathname === `${base}/tasks`) {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const status = url.searchParams.get('status') || undefined;
      const filter = status ? { status } : {};
      const tasks = taskStore.list(filter);
      return sendJson(res, 200, { tasks, total: tasks.length });
    }

    // GET /v1/conversions/stats
    if (method === 'GET' && pathname === `${base}/stats`) {
      return sendJson(res, 200, {
        tasks: taskStore.getStats(),
        // 终态任务耗时 P50/P95（样本=保留的终态任务，见 TaskStore.MAX_TERMINAL_RETAIN）
        duration: taskStore.getDurationStats(),
        workers: workerPool.getStats(),
      });
    }

    return false;
  }

  return { handle };
}

// S1-3：可选 signal（AbortSignal）——客户端断开时 abort 提前终止轮询，避免 interval 跑到
// 超时（最长 180s）浪费 CPU + 占连接。signal 缺省时向后兼容（仅靠 timeout 终止）。
function waitForTask(
  taskId: string,
  taskStore: RouteTaskStore,
  timeout: number,
  signal?: AbortSignal
): Promise<
  { taskId: string; status: string; result?: unknown; error?: unknown } &
    Partial<Pick<TaskRecord, 'errorCategory' | 'errorCode'>>
> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const cleanup = () => {
      if (interval !== undefined) clearInterval(interval);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Aborted'));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }
    interval = setInterval(() => {
      const task = taskStore.get(taskId);
      if (!task) {
        if (settled) return;
        settled = true;
        cleanup();
        return reject(new Error('Task not found'));
      }
      if (task.status === 'COMPLETED') {
        if (settled) return;
        settled = true;
        cleanup();
        return resolve({ taskId, status: 'COMPLETED', result: task.result });
      }
      if (task.status === 'FAILED') {
        if (settled) return;
        settled = true;
        cleanup();
        return resolve({
          taskId,
          status: 'FAILED',
          error: task.error,
          errorCategory: task.errorCategory ?? null,
          errorCode: task.errorCode ?? null,
        });
      }
      if (Date.now() - start > timeout) {
        if (settled) return;
        settled = true;
        cleanup();
        return resolve({ taskId, status: 'TIMEOUT', error: 'Sync wait timeout' });
      }
    }, 200);
  });
}

export { create, waitForTask };
