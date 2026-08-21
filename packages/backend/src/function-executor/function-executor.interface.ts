
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
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  result?: ConversionResult;
  error?: string;
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
}
