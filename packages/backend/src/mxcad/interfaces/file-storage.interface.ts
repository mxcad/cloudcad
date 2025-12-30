/**
 * 文件存储抽象接口
 * 解耦具体的存储实现（本地文件系统、MinIO、云存储等）
 */
export interface IFileStorageService {
  /**
   * 检查文件是否存在
   * @param filePath 文件路径
   * @returns 是否存在
   */
  fileExists(filePath: string): Promise<boolean>;

  /**
   * 获取文件大小
   * @param filePath 文件路径
   * @returns 文件大小（字节）
   */
  getFileSize(filePath: string): Promise<number>;

  /**
   * 上传文件
   * @param filePath 目标路径
   * @param buffer 文件内容
   * @returns 上传是否成功
   */
  uploadFile(filePath: string, buffer: Buffer): Promise<boolean>;

  /**
   * 同步本地文件到存储
   * @param localPath 本地文件路径
   * @param storagePath 存储路径
   * @returns 同步是否成功
   */
  syncFile(localPath: string, storagePath: string): Promise<boolean>;

  /**
   * 获取文件访问URL
   * @param filePath 文件路径
   * @param expiry 过期时间（秒）
   * @returns 文件URL
   */
  getFileUrl(filePath: string, expiry?: number): Promise<string | null>;

  /**
   * 删除文件
   * @param filePath 文件路径
   * @returns 删除是否成功
   */
  deleteFile(filePath: string): Promise<boolean>;
}
