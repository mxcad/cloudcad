import { UserCleanupService } from '../services/user-cleanup.service';
export declare class UserCleanupScheduler {
    private readonly userCleanupService;
    private readonly logger;
    constructor(userCleanupService: UserCleanupService);
    /**
     * 每天凌晨 4 点执行用户数据清理任务
     * 在 StorageCleanupScheduler 之后执行，避免竞争
     */
    handleCleanup(): Promise<void>;
}
//# sourceMappingURL=user-cleanup.scheduler.d.ts.map