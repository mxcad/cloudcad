
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
}
