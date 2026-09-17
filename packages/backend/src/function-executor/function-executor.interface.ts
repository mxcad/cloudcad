
/**
 * 转换任务优先级
 * 1 = 上传转换（最高），2 = 导出/PDF，3 = 缩略图/批处理（最低）
 */
export type TaskPriority = 1 | 2 | 3;

/**
 * 转换任务类型
 */
export type ConversionTaskType =
  | 'convertFile'
  | 'convertBinToMxweb'
  | 'generateBinFiles'
  | 'printToPdf';

/**
 * 转换任务
 */
export interface ConversionTask {
  id: string;
  type: ConversionTaskType;
  params: Record<string, unknown>;
  priority: TaskPriority;
  createdAt: Date;
}

/**
 * 转换结果
 */
export interface ConversionResult {
  taskId: string;
  status: 'COMPLETED' | 'FAILED';
  outputPath?: string;
  error?: string;
  metadata?: Record<string, unknown>;
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
  /**
   * 永久失败标记（#465 负缓存命中 / 确定性内容失败，S6-7）。
   * true 表示该任务终态 FAILED 且重试注定再失败（内容不可转换）；
   * 面板据此展示「永久失败」区别于普通「转换失败」。仅 conversion-service 模式透传。
   */
  permanent?: boolean;
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
