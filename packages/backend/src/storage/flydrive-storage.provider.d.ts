import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import type { IStorageProvider } from './interfaces/storage-provider.interface';
/**
 * Flydrive 存储提供者
 *
 * 使用 flydrive 的 FSDriver 实现本地文件系统存储。
 * 文件根目录由环境变量 FILES_DATA_PATH 决定，默认 data/files。
 */
export declare class FlydriveStorageProvider implements IStorageProvider {
    private readonly configService;
    private readonly logger;
    private readonly disk;
    constructor(configService: ConfigService);
    exists(key: string): Promise<boolean>;
    existsSync(key: string): boolean;
    get(key: string): Promise<string>;
    getBytes(key: string): Promise<Uint8Array>;
    getStream(key: string): Promise<Readable>;
    getMetaData(key: string): Promise<{
        contentLength: number;
        contentType: string;
        lastModified: Date;
        etag: string;
    }>;
    put(key: string, contents: string | Uint8Array): Promise<void>;
    putStream(key: string, contents: Readable): Promise<void>;
    copy(source: string, destination: string): Promise<void>;
    move(source: string, destination: string): Promise<void>;
    delete(key: string): Promise<void>;
    deleteAll(prefix: string): Promise<void>;
    getUrl(key: string): Promise<string>;
    listAll(prefix: string, options?: {
        recursive?: boolean;
    }): Promise<{
        objects: Array<{
            name: string;
            isFile: boolean;
        }>;
    }>;
    /**
     * 从根目录外部复制文件到存储（用于上传场景）
     */
    copyFromFs(sourcePath: string, destinationKey: string): Promise<void>;
}
//# sourceMappingURL=flydrive-storage.provider.d.ts.map