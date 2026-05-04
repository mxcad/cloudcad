import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { StorageCleanupService } from '../common/services/storage-cleanup.service';
export declare class AdminController {
    private readonly permissionService;
    private readonly cacheService;
    private readonly storageCleanupService;
    constructor(permissionService: PermissionService, cacheService: PermissionCacheService, storageCleanupService: StorageCleanupService);
    getAdminStats(): Promise<{
        message: string;
        timestamp: string;
    }>;
    cleanupStorage(delayDays?: number): Promise<{
        message: string;
        data: {
            deletedNodes: number;
            deletedDirectories: number;
            freedSpace: number;
            errors: string[];
        };
    }>;
    getCleanupStats(): Promise<{
        message: string;
        data: {
            total: number;
            expiryDate: Date;
            delayDays: number;
        };
    }>;
}
//# sourceMappingURL=admin.controller.d.ts.map