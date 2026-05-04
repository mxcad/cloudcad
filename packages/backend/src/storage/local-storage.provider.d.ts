import { ConfigService } from '@nestjs/config';
import { StorageProvider, UploadResult } from './storage.interface';
import { AppConfig } from '../config/app.config';
export declare class LocalStorageProvider implements StorageProvider {
    private configService;
    private readonly logger;
    private readonly basePath;
    constructor(configService: ConfigService<AppConfig>);
    /**
     * 确保基础目录存在
     */
    private ensureBasePath;
    /**
     * 验证路径安全性，防止路径遍历攻击
     * @param key 要验证的路径键
     * @throws BadRequestException 如果路径不安全
     */
    private validatePath;
    /**
     * 获取文件的绝对路径
     */
    private getAbsolutePath;
    uploadFile(key: string, data: Buffer): Promise<UploadResult>;
    downloadFile(key: string): Promise<Buffer>;
    deleteFile(key: string): Promise<void>;
    fileExists(key: string): Promise<boolean>;
    getFileStream(key: string): Promise<NodeJS.ReadableStream>;
    getPresignedPutUrl(key: string, expiry?: number): Promise<string>;
    /**
     * 列出指定路径下的文件
     */
    listFiles(prefix: string, startsWith?: string): Promise<string[]>;
    /**
     * 拷贝文件
     */
    copyFile(sourceKey: string, destKey: string): Promise<boolean>;
    /**
     * 删除目录（递归）
     */
    deleteDirectory(dirKey: string): Promise<void>;
    /**
     * 检查目录是否存在
     */
    directoryExists(dirKey: string): Promise<boolean>;
    /**
     * 创建目录
     */
    createDirectory(dirKey: string): Promise<void>;
    /**
     * 获取目录下的子目录数量（用于计算节点数量）
     */
    getSubdirectoryCount(dirKey: string): Promise<number>;
}
//# sourceMappingURL=local-storage.provider.d.ts.map