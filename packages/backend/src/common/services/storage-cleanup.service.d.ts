import { DatabaseService } from '../../database/database.service';
import { StorageManager } from './storage-manager.service';
import { ConfigService } from '@nestjs/config';
export interface CleanupResult {
    success: boolean;
    deletedNodes: number;
    deletedDirectories: number;
    freedSpace: number;
    errors: string[];
}
export declare class StorageCleanupService {
    private readonly prisma;
    private readonly storageManager;
    private readonly configService;
    private readonly logger;
    private readonly cleanupDelayDays;
    constructor(prisma: DatabaseService, storageManager: StorageManager, configService: ConfigService);
    private get trashCleanupDelayDays();
    /**
     * 清理过期的存储文件
     * @returns 清理结果
     */
    cleanupExpiredStorage(): Promise<CleanupResult>;
    /**
     * 清理指定节点的存储（立即删除）
     * @param nodeId 节点 ID
     * @param path 节点路径
     * @returns 是否成功
     */
    cleanupNodeStorage(nodeId: string, path: string): Promise<boolean>;
    /**
     * 获取待清理节点统计
     * @returns 统计信息
     */
    getPendingCleanupStats(): Promise<{
        total: number;
        expiryDate: Date;
        delayDays: number;
    }>;
    /**
     * 清理回收站过期文件
     * @returns 清理结果
     */
    cleanupExpiredTrash(): Promise<CleanupResult>;
    /**
     * 递归清理文件夹
     */
    private cleanupFolderRecursive;
    /**
     * 手动触发清理（管理员功能）
     * @param delayDays 延迟天数（覆盖默认值）
     * @returns 清理结果
     */
    manualCleanup(delayDays?: number): Promise<CleanupResult>;
}
//# sourceMappingURL=storage-cleanup.service.d.ts.map