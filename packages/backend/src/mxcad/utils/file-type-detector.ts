/**
 * 文件类型检测工具
 */

export class FileTypeDetector {
  /**
   * CAD文件扩展名
   */
  private static readonly CAD_EXTENSIONS = ['.dwg', '.dxf'];
  
  /**
   * 图片文件扩展名
   */
  private static readonly IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];
  
  /**
   * 文档文件扩展名
   */
  private static readonly DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
  
  /**
   * 压缩文件扩展名
   */
  private static readonly ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.tar', '.gz'];

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
  static getFileCategory(fileName: string): 'cad' | 'image' | 'document' | 'archive' | 'other' {
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