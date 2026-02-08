/**
 * 分片上传选项接口
 * 用于配置单次分片上传的参数
 */
export interface ChunkUploadOptions {
  /**
   * 上传会话唯一标识符
   */
  uploadId: string;

  /**
   * 分片索引（从0开始）
   */
  chunkIndex: number;

  /**
   * 分片数据（Buffer 或文件路径）
   */
  chunkData: Buffer | string;

  /**
   * 文件总大小（字节）
   */
  fileSize: number;

  /**
   * 分片总数量
   */
  totalChunks: number;

  /**
   * 原始文件名
   */
  fileName: string;

  /**
   * 文件 SHA-256 哈希值
   */
  fileHash: string;

  /**
   * 文件 MIME 类型
   */
  mimeType?: string;

  /**
   * 是否为最后一个分片
   */
  isLastChunk?: boolean;
}

/**
 * 文件上传选项接口
 * 用于配置完整的文件上传流程
 */
export interface FileUploadOptions {
  /**
   * 上传会话唯一标识符
   */
  uploadId: string;

  /**
   * 原始文件名
   */
  fileName: string;

  /**
   * 文件总大小（字节）
   */
  fileSize: number;

  /**
   * 文件 SHA-256 哈希值
   */
  fileHash: string;

  /**
   * 文件 MIME 类型
   */
  mimeType?: string;

  /**
   * 父节点 ID（可选，用于关联到文件系统）
   */
  parentNodeId?: string;

  /**
   * 所有者用户 ID
   */
  ownerId: string;

  /**
   * 自定义元数据
   */
  metadata?: Record<string, unknown>;

  /**
   * 是否启用分片上传（大文件自动启用）
   */
  enableChunkedUpload?: boolean;

  /**
   * 分片大小（字节），默认 5MB
   */
  chunkSize?: number;

  /**
   * 上传超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 上传回调函数（用于进度报告）
   */
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * 合并选项接口
 * 用于配置分片合并和文件后处理
 */
export interface MergeOptions {
  /**
   * 上传会话唯一标识符
   */
  uploadId: string;

  /**
   * 目标存储键名
   */
  storageKey: string;

  /**
   * 分片总数量
   */
  totalChunks: number;

  /**
   * 文件 SHA-256 哈希值（用于验证）
   */
  fileHash: string;

  /**
   * 文件 MIME 类型
   */
  mimeType?: string;

  /**
   * 原始文件名
   */
  fileName: string;

  /**
   * 文件总大小（字节）
   */
  fileSize: number;

  /**
   * 父节点 ID（可选，用于关联到文件系统）
   */
  parentNodeId?: string;

  /**
   * 所有者用户 ID
   */
  ownerId: string;

  /**
   * 合并完成后是否立即转换为 MXWEB 格式
   */
  convertToMxweb?: boolean;

  /**
   * 自定义元数据
   */
  metadata?: Record<string, unknown>;

  /**
   * 是否跳过重复文件检查
   */
  skipDuplicateCheck?: boolean;
}

/**
 * 上传结果接口
 * 返回上传操作的结果信息
 */
export interface UploadResult {
  /**
   * 操作是否成功
   */
  success: boolean;

  /**
   * 上传会话 ID
   */
  uploadId: string;

  /**
   * 文件哈希值
   */
  fileHash?: string;

  /**
   * 存储键名
   */
  storageKey?: string;

  /**
   * 节点 ID（如果已关联到文件系统）
   */
  nodeId?: string;

  /**
   * 转换结果（如果进行了 MXWEB 转换）
   */
  conversionResult?: ConversionResult;

  /**
   * 操作耗时（毫秒）
   */
  duration?: number;

  /**
   * 结果消息
   */
  message?: string;

  /**
   * 错误信息（如果失败）
   */
  error?: string;
}

/**
 * 转换结果接口
 * MXWEB 格式转换的结果信息
 */
export interface ConversionResult {
  /**
   * 转换是否成功
   */
  success: boolean;

  /**
   * MXWEB 文件存储键名
   */
  mxwebKey?: string;

  /**
   * 预加载数据
   */
  preloadingData?: PreloadingData;

  /**
   * 转换耗时（毫秒）
   */
  duration?: number;

  /**
   * 错误信息（如果失败）
   */
  error?: string;
}

/**
 * 预加载数据接口
 * MxCAD 编辑器所需的预加载信息
 */
export interface PreloadingData {
  /**
   * 外部参照列表
   */
  externalReferences: ExternalReference[];

  /**
   * 字体信息
   */
  fonts?: FontInfo[];
}

/**
 * 外部参照接口
 * CAD 图纸的外部参照文件信息
 */
export interface ExternalReference {
  /**
   * 参照文件名
   */
  filename: string;

  /**
   * 参照文件路径
   */
  path: string;

  /**
   * 是否缺失
   */
  isMissing: boolean;

  /**
   * 参照类型（DWG 或 Image）
   */
  type: 'dwg' | 'image';
}

/**
 * 字体信息接口
 * CAD 图纸使用的字体信息
 */
export interface FontInfo {
  /**
   * 字体名称
   */
  name: string;

  /**
   * 字体类型
   */
  type: 'ttf' | 'shx' | 'otf';

  /**
   * 是否可用
   */
  isAvailable: boolean;
}

/**
 * 上传上下文接口
 * 用于在上传过程中传递上下文信息
 */
export interface UploadContext {
  /**
   * 上传会话 ID
   */
  uploadId: string;

  /**
   * 当前阶段
   */
  stage: UploadStage;

  /**
   * 开始时间
   */
  startTime: Date;

  /**
   * 当前节点 ID
   */
  currentNodeId?: string;

  /**
   * 所有者用户 ID
   */
  ownerId: string;

  /**
   * 上传选项
   */
  options: FileUploadOptions;

  /**
   * 临时数据存储
   */
  tempData?: Map<string, unknown>;

  /**
   * 取消令牌（用于取消上传）
   */
  cancelToken?: CancelToken;
}

/**
 * 上传阶段枚举
 */
export type UploadStage =
  | 'initializing' // 初始化阶段
  | 'checking' // 检查阶段
  | 'uploading' // 上传阶段
  | 'merging' // 合并阶段
  | 'converting' // 转换阶段
  | 'finalizing' // 完成阶段
  | 'failed' // 失败状态
  | 'completed'; // 完成状态

/**
 * 取消令牌接口
 * 用于取消正在进行的上传操作
 */
export interface CancelToken {
  /**
   * 是否已取消
   */
  cancelled: boolean;

  /**
   * 取消原因
   */
  reason?: string;

  /**
   * 取消上传
   */
  cancel(reason?: string): void;
}

/**
 * 上传进度接口
 * 用于报告上传进度
 */
export interface UploadProgress {
  /**
   * 上传会话 ID
   */
  uploadId: string;

  /**
   * 当前阶段
   */
  stage: UploadStage;

  /**
   * 已上传字节数
   */
  uploadedBytes: number;

  /**
   * 总字节数
   */
  totalBytes: number;

  /**
   * 已上传分片数
   */
  uploadedChunks: number;

  /**
   * 总分片数
   */
  totalChunks: number;

  /**
   * 上传进度百分比（0-100）
   */
  progress: number;

  /**
   * 上传速度（字节/秒）
   */
  speed?: number;

  /**
   * 预计剩余时间（毫秒）
   */
  estimatedTimeRemaining?: number;
}

/**
 * 检查结果接口
 * 用于返回文件检查的结果
 */
export interface CheckResult {
  /**
   * 检查是否通过
   */
  passed: boolean;

  /**
   * 文件是否已存在
   */
  exists?: boolean;

  /**
   * 分片是否已存在
   */
  chunkExists?: boolean;

  /**
   * 现有文件的节点 ID（如果存在）
   */
  existingNodeId?: string;

  /**
   * 现有文件的存储键名（如果存在）
   */
  existingStorageKey?: string;

  /**
   * 跳过的分片索引列表
   */
  skippedChunks?: number[];

  /**
   * 检查消息
   */
  message?: string;

  /**
   * 警告信息列表
   */
  warnings?: string[];

  /**
   * 检查耗时（毫秒）
   */
  duration?: number;
}

/**
 * 文件验证结果接口
 * 用于返回文件验证的结果
 */
export interface FileValidationResult {
  /**
   * 验证是否通过
   */
  valid: boolean;

  /**
   * 文件名是否有效
   */
  fileNameValid?: boolean;

  /**
   * 文件大小是否有效
   */
  fileSizeValid?: boolean;

  /**
   * 文件扩展名是否有效
   */
  extensionValid?: boolean;

  /**
   * 文件类型是否有效
   */
  mimeTypeValid?: boolean;

  /**
   * 错误消息
   */
  error?: string;

  /**
   * 验证消息
   */
  message?: string;
}