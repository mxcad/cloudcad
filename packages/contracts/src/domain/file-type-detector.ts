// 文件类型分类的唯一事实源（纯函数、零依赖、过 scan:purity 门禁，ADR-0069）：
//
// 历史上「某扩展名算不算 CAD / 图片 / 文档 / 压缩包」被手写散落在多处，且已漂移：
// - 外部参照服务（external-reference-update / public-file / mxcad-file-handler）
//   各自内联一份 dwg 列表与图片列表，图片列表一份含 .jfif 不含 .svg、另一份相反；
// - 转换 / 版本历史走 needsConversion 判断是否 CAD。
// 代价：同一扩展名在不同出口被归为不同类型（.svg 与 .jfif 的归属互相矛盾）。
//
// 本文件把扩展名 → 类型 的判定写成一次，backend 各出口都是它的调用方。
// 纯 TypeScript、无 IO、无副作用。需要 IO/框架时迁独立包，勿就地扩展（ADR-0069）。

/**
 * 文件类型检测工具（静态纯函数集合）
 */
export class FileTypeDetector {
  /**
   * CAD文件扩展名
   */
  private static readonly CAD_EXTENSIONS = ['.dwg', '.dxf'];

  /**
   * MXWeb文件扩展名
   */
  private static readonly MXWEB_EXTENSION = '.mxweb';

  /**
   * 图片文件扩展名
   * 取各消费方内联列表的并集（.svg 与 .jfif 都收），作为唯一事实源
   */
  private static readonly IMAGE_EXTENSIONS = [
    '.png',
    '.jpg',
    '.jpeg',
    '.jfif',
    '.gif',
    '.bmp',
    '.svg',
    '.webp',
  ];

  /**
   * 文档文件扩展名
   */
  private static readonly DOCUMENT_EXTENSIONS = [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
  ];

  /**
   * 压缩文件扩展名
   */
  private static readonly ARCHIVE_EXTENSIONS = [
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.gz',
  ];

  /**
   * 检查是否为CAD文件
   * @param fileName 文件名
   * @returns 是否为CAD文件
   */
  static isCadFile(fileName: string): boolean {
    const ext = this.getFileExtension(fileName);
    return this.CAD_EXTENSIONS.includes(ext);
  }

  /**
   * 检查是否为MXWeb文件
   * @param fileName 文件名
   * @returns 是否为MXWeb文件
   */
  static isMxwebFile(fileName: string): boolean {
    const ext = this.getFileExtension(fileName);
    return ext === this.MXWEB_EXTENSION;
  }

  /**
   * 检查是否为图片文件
   * @param fileName 文件名
   * @returns 是否为图片文件
   */
  static isImageFile(fileName: string): boolean {
    const ext = this.getFileExtension(fileName);
    return this.IMAGE_EXTENSIONS.includes(ext);
  }

  /**
   * 检查是否为文档文件
   * @param fileName 文件名
   * @returns 是否为文档文件
   */
  static isDocumentFile(fileName: string): boolean {
    const ext = this.getFileExtension(fileName);
    return this.DOCUMENT_EXTENSIONS.includes(ext);
  }

  /**
   * 检查是否为压缩文件
   * @param fileName 文件名
   * @returns 是否为压缩文件
   */
  static isArchiveFile(fileName: string): boolean {
    const ext = this.getFileExtension(fileName);
    return this.ARCHIVE_EXTENSIONS.includes(ext);
  }

  /**
   * 检查是否需要转换（CAD文件）
   * @param fileName 文件名
   * @returns 是否需要转换
   */
  static needsConversion(fileName: string): boolean {
    return this.isCadFile(fileName);
  }

  /**
   * 检查是否可以直接上传（非CAD文件）
   * @param fileName 文件名
   * @returns 是否可以直接上传
   */
  static canDirectUpload(fileName: string): boolean {
    return !this.isCadFile(fileName);
  }

  /**
   * 获取文件类型分类
   * @param fileName 文件名
   * @returns 文件类型分类
   */
  static getFileCategory(
    fileName: string
  ): 'cad' | 'image' | 'document' | 'archive' | 'other' {
    if (this.isCadFile(fileName)) return 'cad';
    if (this.isImageFile(fileName)) return 'image';
    if (this.isDocumentFile(fileName)) return 'document';
    if (this.isArchiveFile(fileName)) return 'archive';
    return 'other';
  }

  /**
   * 获取文件扩展名（小写）
   * @param fileName 文件名
   * @returns 文件扩展名
   */
  private static getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) return '';
    return fileName.substring(lastDotIndex).toLowerCase();
  }

  /**
   * 获取支持的文件扩展名列表
   * @returns 支持的文件扩展名列表
   */
  static getSupportedExtensions(): string[] {
    return [
      ...this.CAD_EXTENSIONS,
      ...this.IMAGE_EXTENSIONS,
      ...this.DOCUMENT_EXTENSIONS,
      ...this.ARCHIVE_EXTENSIONS,
    ];
  }

  /**
   * 检查文件是否支持
   * @param fileName 文件名
   * @returns 是否支持
   */
  static isSupported(fileName: string): boolean {
    const ext = this.getFileExtension(fileName);
    return this.getSupportedExtensions().includes(ext);
  }
}
