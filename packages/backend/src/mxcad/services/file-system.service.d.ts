import { ConfigService } from '@nestjs/config';
import type { IFileSystemService, MergeOptions } from '../interfaces/file-system.interface';
import { AppConfig } from '../../config/app.config';
export declare class FileSystemService implements IFileSystemService {
    private readonly configService;
    private readonly logger;
    private readonly uploadPath;
    private readonly tempPath;
    constructor(configService: ConfigService<AppConfig>);
    exists(path: string): Promise<boolean>;
    createDirectory(dirPath: string): Promise<boolean>;
    getFileSize(filePath: string): Promise<number>;
    readDirectory(dirPath: string): Promise<string[]>;
    /**
     * 查找目录中以指定前缀开头的文件
     * @param dirPath 目录路径
     * @param prefix 文件名前缀
     * @returns 匹配的文件名列表
     */
    findFilesByPrefix(dirPath: string, prefix: string): Promise<string[]>;
    delete(path: string): Promise<boolean>;
    mergeChunks(options: MergeOptions): Promise<{
        success: boolean;
        error?: string;
    }>;
    writeStatusFile(name: string, size: number, hash: string, targetPath: string): Promise<boolean>;
    getChunkTempDirPath(fileHash: string): string;
    getMd5Path(fileHash: string): string;
    deleteDirectory(dirPath: string): Promise<boolean>;
    private streamMergeRecursive;
}
//# sourceMappingURL=file-system.service.d.ts.map