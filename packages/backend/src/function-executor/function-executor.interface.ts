
import type { ConversionFailureCategory } from '@cloudcad/contracts';
import type { ConversionOptions } from '../mxcad/interfaces/file-conversion.interface';

/**
 * 转换任务优先级
 * 1 = 上传转换（最高），2 = 导出/PDF，3 = 缩略图/批处理（最低）
 */
export type TaskPriority = 1 | 2 | 3;

/**
 * 转换任务
 *
 * 按 type 判别：params 不再是 Record<string, unknown>，各任务类型有自己的参数形状，
 * 拼错字段名会直接编译失败（此前 convertBinToMxweb 的三参曾与转换服务约定长期不一致）。
 * convertFile 的 params 用 backend 的 ConversionOptions（比契约的 ConversionRequest 多
 * 编排字段 userId/priority/skipExportGate/debugNodeId 等，多出的字段转发时被按契约字段集挑选）。
 */
export type ConversionTask = {
  id: string;
  priority: TaskPriority;
  createdAt: Date;
} & (
  | { type: 'convertFile'; params: ConversionOptions }
  | {
      type: 'convertBinToMxweb';
      params: { srcPath: string; outpath: string; outname: string };
    }
  | { type: 'generateBinFiles'; params: { mxwebPath: string; nodeName: string } }
);

/**
 * 转换任务类型
 */
export type ConversionTaskType = ConversionTask['type'];

/**
 * 转换结果
 */
export interface ConversionResult {
  taskId: string;
  status: 'COMPLETED' | 'FAILED';
  outputPath?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  /**
   * 失败性质分类（仅 FAILED 有意义，结构契约见 @cloudcad/contracts）。
   *
   * 结构化过线，替代按 error 文案反推分类：此前 backend 用 4 个中文字符串
   * 匹配 conversion-service 的错误文案（且靠子串侥幸命中），改文案即静默翻转
   * transient 语义，上层「可重试 vs 确定性失败」分支随之失效。
   */
  errorCategory?: ConversionFailureCategory;
  /** 引擎返回码（仅 content-error 时为非 0） */
  errorCode?: number;
}

/**
 * 任务执行状态
 */
export interface TaskStatus {
  taskId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress?: number;
  result?: ConversionResult;
  error?: string;
  /** 失败性质分类，与 ConversionResult.errorCategory 同源（conversion-service 透传） */
  errorCategory?: ConversionFailureCategory;
  /** 引擎返回码（仅 content-error 时为非 0） */
  errorCode?: number;
  /**
   * 排队位置（S6-5）：任务在其优先级池 acquire 队列中的 1-based 序号。
   * 仅排队中（PENDING 且已入队）任务有意义，运行中/未入队/终态为 undefined。
   * 仅 conversion-service 模式透传（独立服务有真实排队队列）。
   */
  queuePosition?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 函数执行器接口
 *
 * 抽象转换任务执行能力，支持三种部署模式：
 * - ProcessPoolExecutor（嵌入式）
 * - HttpConversionExecutor（独立服务）
 * - CloudFaaSExecutor（云函数）
 */
/**
 * 优先级排队执行器（嵌入式 process-pool）的队列统计。
 *
 * 字段名同时是监控 API（ConversionMonitorStats.processPool）的对外契约：
 * 词汇表由 seam 拥有，监控模块不再逐字镜像 RateLimiter 的内部字段名。
 */
export interface PriorityQueueStats {
  queueLength: number;
  criticalPriorityQueueLength: number;
  highPriorityQueueLength: number;
  lowPriorityQueueLength: number;
  runningCount: number;
  maxConcurrent: number;
  timeout: number;
}

/** 工作池执行器（独立 conversion-service）的单级工作池统计 */
export interface WorkerPoolLevelStats {
  label: string;
  maxConcurrent: number;
  currentMax: number;
  running: number;
  waiting: number;
  autoScale: boolean;
  backlogSince: number | null;
}

/** 工作池执行器的任务计数 */
export interface WorkerPoolTaskCounts {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

/**
 * 队列统计，按执行器形态判别：
 * - priority-queue：进程内三级优先级队列（queueLength = 三级之和）
 * - worker-pool：独立服务的单级工作池 + 任务计数
 */
export type ExecutorQueueStats =
  | { kind: 'priority-queue'; stats: PriorityQueueStats }
  | {
      kind: 'worker-pool';
      tasks: WorkerPoolTaskCounts;
      workers: Record<string, WorkerPoolLevelStats>;
    };

/** 优先级排队执行器的耗时/等待时长样本（有界） */
export interface PriorityQueueDurationStats {
  sampleCount: number;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  p50WaitMs: number | null;
  p95WaitMs: number | null;
}

/** 工作池执行器的终态任务执行耗时样本（有界；无排队等待时长语义） */
export interface TaskDurationStats {
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

/** 耗时统计，按执行器形态判别（样本语义与队列形态一一对应） */
export type ExecutorDurationStats =
  | { kind: 'priority-queue'; stats: PriorityQueueDurationStats }
  | { kind: 'task'; stats: TaskDurationStats };

/**
 * 执行器侧任务明细记录（conversion-service 的 TaskRecord 子集）。
 * 字段名同时是监控 API（/conversion-monitor/tasks）的对外契约。
 */
export interface ExecutorTaskRecord {
  id: string;
  type?: string;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error?: string;
  contentKey?: string;
}

export const IFunctionExecutor = 'IFunctionExecutor';

export interface IFunctionExecutor {
  /**
   * 提交并执行转换任务
   * 在嵌入式模式下同步等待完成；在异步模式下返回 COMPLETED 或 FAILED
   */
  invoke(task: ConversionTask): Promise<ConversionResult>;

  /**
   * 查询任务执行状态
   */
  getTaskStatus(taskId: string): Promise<TaskStatus>;

  /**
   * 取消任务（可选，#463）。
   * 仅 conversion-service 模式支持（独立服务有进程组可杀 / 排队中可出队）；
   * process-pool / cloud-faas 模式不实现（undefined），调用方据此隐藏取消入口。
   */
  cancelTask?(taskId: string): Promise<{ ok: boolean; status?: string; reason?: string }>;

  /**
   * 队列统计。无排队队列的执行器返回 null（cloud-faas 无队列语义）。
   * 监控/健康检查只依赖本方法，不再按 FUNCTION_EXECUTOR 字符串分支。
   */
  queueStats(): Promise<ExecutorQueueStats | null>;

  /** 耗时/等待时长统计（有界样本）。无采样来源返回 null。 */
  durationStats(): Promise<ExecutorDurationStats | null>;

  /**
   * 逐任务明细（可选）。无独立任务存储的执行器不实现（process-pool 的任务簿记
   * 随进程生命周期，仅供 getTaskStatus 查询）；调用方按 undefined 返回空列表。
   */
  listTasks?(status?: string): Promise<ExecutorTaskRecord[]>;

  /** 清空排队中任务，返回被取消数（可选；无排队队列的执行器不实现）。 */
  clearQueue?(): number;
}
