import { StorageCleanupService } from '../services/storage-cleanup.service';
import { DiskMonitorService } from '../services/disk-monitor.service';
import { FileLockService } from '../services/file-lock.service';
export declare class StorageCleanupScheduler {
    private readonly storageCleanupService;
    private readonly diskMonitorService;
    private readonly fileLockService;
    private readonly logger;
    constructor(storageCleanupService: StorageCleanupService, diskMonitorService: DiskMonitorService, fileLockService: FileLockService);
    /**
     * 每天凌晨 3 点执行清理任务
     */
    handleCleanup(): Promise<void>;
    /**
     * 每天凌晨 4 点执行回收站清理任务
     */
    handleTrashCleanup(): Promise<void>;
    /**
     * 每周清理一次过期锁文件
     */
    handleLockCleanup(): Promise<void>;
    /**
     * 每小时检查一次磁盘状态（仅在警告状态下记录）
     */
    handleDiskMonitor(): Promise<void>;
}
//# sourceMappingURL=storage-cleanup.scheduler.d.ts.map