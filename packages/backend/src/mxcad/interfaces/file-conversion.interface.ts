/**
 * MxCAD 转换结果
 */
export interface MxCadConversionResult {
  /** 返回码，0 表示成功 */
  code: number;
  /** 返回消息 */
  message?: string;
  /** 转换后的文件路径 */
  newpath?: string;
  /** 是否包含图纸数据 */
  tz?: boolean;
  /** 其他自定义字段 */
  [key: string]: unknown;
}

/**
 * 文件转换抽象接口
 * 解耦具体的转换工具实现（MxCAD、其他CAD转换工具等）
 */
export interface ConversionResult {
  /** 是否成功 */
  isOk: boolean;
  /** 转换结果数据 */
  ret: MxCadConversionResult;
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
  /** 输出文件名（用于 savedwg、savepdf、print_to_pdf、cut_dwg、cut_mxweb 等接口）
   * 支持的格式：
   * - .mxweb - MxCAD Web 格式（默认）
   * - .dwg - AutoCAD DWG 格式
   * - .dxf - AutoCAD DXF 格式
   * - .pdf - PDF 格式
   * 示例： "output.mxweb", "drawing.dwg", "preview.pdf"
   */
  outname?: string;
  /** 命令类型（用于特定转换操作）
   * 可选值：
   * - "print_to_pdf" - 打印为 PDF
   * - "cut_dwg" - 裁剪 DWG 文件
   * - "cut_mxweb" - 裁剪 MXWEB 文件
   */
  cmd?: string;
  /** PDF 输出宽度（像素）
   * 用于 print_to_pdf 和 savepdf 接口
   * 默认值： "2000"
   */
  width?: string;
  /** PDF 输出高度（像素）
   * 用于 print_to_pdf 和 savepdf 接口
   * 默认值： "2000"
   */
  height?: string;
  /** 颜色策略
   * 用于 print_to_pdf 和 savepdf 接口
   * 可选值：
   * - "mono" - 单色（黑白，默认）
   * - "color" - 彩色
   */
  colorPolicy?: string;
  /** JPG 输出参数（传递给 cadtojpg 工具）
   * 用于 /convert 接口，生成 JPG 预览图
   * 参数格式：命令行参数字符串，多个参数用空格分隔
   * 支持的参数（根据 cadtojpg 工具支持情况）：
   * - width - 输出宽度（像素）
   * - height - 输出高度（像素）
   * - quality - JPEG 质量（0-100）
   * 示例： "width=800 height=600 quality=90"
   * 注意：此参数仅用于调用 cadtojpg 工具，不影响主转换输出
   */
  outjpg?: string;
  /** 是否异步转换 */
  async?: string;
  /** 异步结果回调 URL */
  resultposturl?: string;
  /** 追踪 ID */
  traceid?: string;
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
