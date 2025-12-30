/**
 * 文件系统操作抽象接口
 * 解耦具体的文件系统实现（本地文件系统、网络文件系统等）
 */
export interface FileInfo {
  /** 文件名 */
  name: string;
  /** 文件大小 */
  size: number;
  /** 是否为目录 */
  isDirectory: boolean;
  /** 最后修改时间 */
  lastModified: Date;
}

export interface MergeOptions {
  /** 源文件列表 */
  sourceFiles: string[];
  /** 目标文件路径 */
  targetPath: string;
  /** 分片目录路径 */
  chunkDir: string;
}

export interface IFileSystemService {
  /**
   * 检查文件或目录是否存在
   * @param path 路径
   * @returns 是否存在
   */
  exists(path: string): Promise<boolean>;

  /**
   * 创建目录
   * @param dirPath 目录路径
   * @returns 是否创建成功
   */
  createDirectory(dirPath: string): Promise<boolean>;

  /**
   * 获取文件大小
   * @param filePath 文件路径
   * @returns 文件大小
   */
  getFileSize(filePath: string): Promise<number>;

  /**
   * 读取目录内容
   * @param dirPath 目录路径
   * @returns 文件列表
   */
  readDirectory(dirPath: string): Promise<string[]>;

  /**
   * 删除文件或目录
   * @param path 路径
   * @returns 是否删除成功
   */
  delete(path: string): Promise<boolean>;

  /**
   * 合并分片文件
   * @param options 合并选项
   * @returns 合并结果
   */
  mergeChunks(
    options: MergeOptions
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * 写入状态文件
   * @param name 文件名
   * @param size 文件大小
   * @param hash 文件哈希
   * @param targetPath 目标路径
   * @returns 是否写入成功
   */
  writeStatusFile(
    name: string,
    size: number,
    hash: string,
    targetPath: string
  ): Promise<boolean>;

  /**
   * 获取分片临时目录路径
   * @param fileHash 文件哈希
   * @returns 临时目录路径
   */
  getChunkTempDirPath(fileHash: string): string;

  /**
   * 获取文件存储路径
   * @param fileHash 文件哈希
   * @returns 存储路径
   */
  getMd5Path(fileHash: string): string;

  /**
   * 递归删除目录
   * @param dirPath 目录路径
   * @returns 是否删除成功
   */
  deleteDirectory(dirPath: string): Promise<boolean>;
}
