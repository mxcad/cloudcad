import { ConfigService } from '@nestjs/config';
export interface CopyResult {
    success: boolean;
    copiedFiles: string[];
    error?: string;
}
export declare class FileCopyService {
    private configService;
    private readonly logger;
    private readonly uploadsPath;
    constructor(configService: ConfigService);
    /**
     * 从 uploads 拷贝文件到目标目录
     * @param fileHash 文件哈希
     * @param targetDir 目标目录（完整路径）
     * @returns 拷贝结果
     */
    copyFilesByHash(fileHash: string, targetDir: string): Promise<CopyResult>;
    /**
     * 查找 uploads 中所有包含指定 hash 的文件
     * @param fileHash 文件哈希
     * @returns 文件路径列表
     */
    private findFilesByHash;
    /**
     * 拷贝单个文件
     * @param sourcePath 源文件路径
     * @param targetPath 目标文件路径
     * @returns 是否成功
     */
    copyFile(sourcePath: string, targetPath: string): Promise<boolean>;
    /**
     * 拷贝目录（递归）
     * @param sourceDir 源目录路径
     * @param targetDir 目标目录路径
     * @returns 是否成功
     */
    copyDirectory(sourceDir: string, targetDir: string): Promise<boolean>;
    /**
     * 删除目录（递归）
     * @param dirPath 目录路径
     * @returns 是否成功
     */
    deleteDirectory(dirPath: string): Promise<boolean>;
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
     * 获取目录大小（递归）
     * @param dirPath 目录路径
     * @returns 目录大小（字节）
     */
    getDirectorySize(dirPath: string): Promise<number>;
}
//# sourceMappingURL=file-copy.service.d.ts.map