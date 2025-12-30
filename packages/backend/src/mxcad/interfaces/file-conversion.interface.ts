/**
 * 文件转换抽象接口
 * 解耦具体的转换工具实现（MxCAD、其他CAD转换工具等）
 */
export interface ConversionResult {
  /** 是否成功 */
  isOk: boolean;
  /** 转换结果数据 */
  ret: any;
  /** 错误信息 */
  error?: string;
}

export interface ConversionOptions {
  /** 源文件路径 */
  srcPath: string;
  /** 文件哈希 */
  fileHash: string;
  /** 是否创建预加载数据 */
  createPreloadingData?: boolean;
  /** 压缩选项 */
  compression?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
}

export interface IFileConversionService {
  /**
   * 转换CAD文件
   * @param options 转换选项
   * @returns 转换结果
   */
  convertFile(options: ConversionOptions): Promise<ConversionResult>;

  /**
   * 异步转换文件
   * @param options 转换选项
   * @param callbackUrl 回调URL
   * @returns 转换任务ID
   */
  convertFileAsync(
    options: ConversionOptions,
    callbackUrl?: string
  ): Promise<string>;

  /**
   * 检查转换状态
   * @param taskId 任务ID
   * @returns 转换状态
   */
  checkConversionStatus(
    taskId: string
  ): Promise<{ code: number; status?: string }>;

  /**
   * 获取转换后的文件扩展名
   * @param originalFilename 原始文件名
   * @returns 转换后扩展名
   */
  getConvertedExtension(originalFilename: string): string;

  /**
   * 检查文件是否需要转换
   * @param filename 文件名
   * @returns 是否需要转换
   */
  needsConversion(filename: string): boolean;
}
