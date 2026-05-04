import { ConfigService } from '@nestjs/config';
import { ConcurrencyManager } from '../../common/concurrency/concurrency-manager';
import { AppConfig } from '../../config/app.config';
/**
 * 分片上传选项
 */
export interface ChunkUploadOptions {
    /** 文件哈希值 */
    hash: string;
    /** 分片索引 */
    chunk: number;
    /** 分片数据路径 */
    chunkData: string;
    /** 分片大小（字节） */
    size: number;
}
/**
 * 合并分片选项
 */
export interface MergeChunksOptions {
    /** 文件哈希值 */
    hash: string;
    /** 文件名 */
    name: string;
    /** 文件大小（字节） */
    size: number;
    /** 总分片数 */
    chunks: number;
    /** 目标文件路径 */
    targetPath: string;
}
/**
 * 分片上传服务
 * 负责分片文件的上传、检查、合并和临时目录清理
 */
export declare class ChunkUploadService {
    private readonly configService;
    private readonly concurrencyManager;
    private readonly logger;
    private readonly tempPath;
    constructor(configService: ConfigService<AppConfig>, concurrencyManager: ConcurrencyManager);
    /**
     * 检查分片是否存在
     * @param hash 文件哈希值
     * @param chunk 分片索引
     * @returns 是否存在
     */
    checkChunkExists(hash: string, chunk: number): Promise<boolean>;
    /**
     * 上传分片文件
     * @param chunkData 分片数据路径
     * @returns 是否成功
     */
    uploadChunk(chunkData: string): Promise<boolean>;
    /**
     * 合并分片文件
     * @param options 合并选项
     * @returns 是否成功
     */
    mergeChunks(options: MergeChunksOptions): Promise<boolean>;
    /**
     * 获取分片临时目录路径
     * @param hash 文件哈希值
     * @returns 临时目录路径
     */
    getChunkTempDirPath(hash: string): string;
    /**
     * 清理临时目录
     * 增强版本：增加重试机制
     * @param hash 文件哈希值
     * @returns 是否成功
     */
    cleanupTempDirectory(hash: string): Promise<boolean>;
    /**
     * 清理所有过期的临时文件
     * 定时任务调用，清理超过指定时间的临时文件
     * @param maxAge 最大文件年龄（毫秒），默认 24 小时
     * @returns 清理的目录数量
     */
    cleanupExpiredTempFiles(maxAge?: number): Promise<number>;
    /**
     * 检查磁盘空间
     * @param requiredSpace 需要的磁盘空间（字节），默认 1GB
     * @returns 磁盘空间是否足够
     */
    checkDiskSpace(requiredSpace?: number): Promise<boolean>;
    /**
     * 延迟函数
     * @param ms 延迟毫秒数
     * @returns Promise
     */
    private sleep;
    /**
     * 执行实际的合并操作
     * @param chunkDir 分片目录
     * @param targetPath 目标文件路径
     * @param hash 文件哈希值
     * @param chunks 分片总数
     * @returns 是否成功
     */
    private performMerge;
}
//# sourceMappingURL=chunk-upload.service.d.ts.map