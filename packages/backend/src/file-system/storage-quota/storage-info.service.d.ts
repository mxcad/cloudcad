import { FileSystemNode } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { ConfigService } from '@nestjs/config';
import { StorageQuotaService, StorageQuotaType } from './storage-quota.service';
export { StorageQuotaType };
export interface StorageQuotaInfo {
    type: StorageQuotaType;
    used: number;
    total: number;
    remaining: number;
    usagePercent: number;
}
export declare class StorageInfoService {
    private readonly prisma;
    private readonly configService;
    private readonly storageQuotaService;
    private readonly logger;
    private readonly quotaCache;
    private readonly cacheTTL;
    constructor(prisma: DatabaseService, configService: ConfigService, storageQuotaService: StorageQuotaService);
    determineQuotaType(node: Partial<FileSystemNode>): StorageQuotaType;
    getStorageQuotaLimit(node?: Partial<FileSystemNode>): Promise<number>;
    getStorageQuota(userId: string, nodeId?: string, node?: Partial<FileSystemNode>): Promise<StorageQuotaInfo>;
    /**
     * 计算存储配额（内部方法）
     * 使用数据库聚合查询优化性能，避免传输大量数据到内存
     */
    private calculateStorageQuota;
    /**
     * 清除配额缓存
     */
    invalidateQuotaCache(userId: string, nodeId?: string): Promise<void>;
    getUserStorageInfo(userId: string): Promise<StorageQuotaInfo>;
    deleteMxCadFilesFromUploads(fileHash: string): Promise<number>;
    deleteMxCadFilesFromUploadsBatch(fileHashes: string[]): Promise<number>;
}
//# sourceMappingURL=storage-info.service.d.ts.map