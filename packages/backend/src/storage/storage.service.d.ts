import { ConfigService } from '@nestjs/config';
import { IStorageProvider } from './interfaces/storage-provider.interface';
import type { Readable } from 'node:stream';
import { AppConfig } from '../config/app.config';
export declare class StorageService {
    private readonly storageProvider;
    private configService;
    private readonly logger;
    private readonly filesDataPath;
    constructor(storageProvider: IStorageProvider, configService: ConfigService<AppConfig>);
    /**
     * 检查文件是否存在
     */
    fileExists(key: string): Promise<boolean>;
    /**
     * 获取文件流
     */
    getFileStream(key: string): Promise<NodeJS.ReadableStream>;
    /**
     * 获取文件信息
     */
    getFileInfo(key: string): Promise<{
        contentType: string;
        contentLength: number;
    } | null>;
    healthCheck(): Promise<{
        status: string;
        message: string;
    }>;
    /**
     * 列出指定路径下的文件
     */
    listFiles(prefix: string, startsWith?: string): Promise<string[]>;
    /**
     * 删除文件
     */
    deleteFile(key: string): Promise<void>;
    /**
     * 递归删除目录及内容
     */
    deleteAll(prefix: string): Promise<void>;
    /**
     * 复制文件（存储内）
     */
    copyFile(source: string, destination: string): Promise<void>;
    /**
     * 移动文件（存储内）
     */
    moveFile(source: string, destination: string): Promise<void>;
    /**
     * 写入文件（字符串或字节）
     */
    writeFile(key: string, contents: string | Uint8Array): Promise<void>;
    /**
     * 写入文件（流）
     */
    writeStream(key: string, contents: Readable): Promise<void>;
    /**
     * 从外部文件系统复制文件到存储
     */
    copyFromFs(sourcePath: string, destinationKey: string): Promise<void>;
    /**
     * 获取文件内容（字符串）
     */
    getFile(key: string): Promise<string>;
    /**
     * 获取文件内容（字节数组）
     */
    getFileBytes(key: string): Promise<Uint8Array>;
    /**
     * 获取文件公开 URL
     */
    getUrl(key: string): Promise<string>;
    /**
     * 获取 IStorageProvider 原始实例（用于需要直接调用的场景）
     */
    getProvider(): IStorageProvider;
}
//# sourceMappingURL=storage.service.d.ts.map