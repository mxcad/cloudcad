import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
export interface UserCleanupResult {
    success: boolean;
    processedUsers: number;
    deletedMembers: number;
    deletedProjects: number;
    deletedAuditLogs: number;
    deletedRefreshTokens: number;
    deletedUploadSessions: number;
    deletedConfigLogs: number;
    markedForStorageCleanup: number;
    errors: Array<{
        userId: string;
        message: string;
    }>;
}
export interface PendingCleanupStats {
    pendingCleanup: number;
    expiryDate: Date;
    delayDays: number;
}
export declare class UserCleanupService {
    private readonly prisma;
    private readonly configService;
    private readonly logger;
    private readonly cleanupDelayDays;
    constructor(prisma: DatabaseService, configService: ConfigService);
    /**
     * 清理所有过期的已注销用户数据
     */
    cleanupExpiredUsers(): Promise<UserCleanupResult>;
    /**
     * 清理指定用户的数据（立即执行，不等待冷静期）
     * @param userId 用户 ID
     */
    cleanupUser(userId: string): Promise<{
        deletedMembers: number;
        deletedProjects: number;
        deletedAuditLogs: number;
        deletedRefreshTokens: number;
        deletedUploadSessions: number;
        deletedConfigLogs: number;
        markedForStorageCleanup: number;
    }>;
    /**
     * 查询过期的已注销用户
     */
    private findExpiredUsers;
    /**
     * 获取待清理用户统计
     */
    getPendingCleanupStats(): Promise<PendingCleanupStats>;
    /**
     * 手动触发清理（管理员功能）
     * @param delayDays 延迟天数（覆盖默认值）
     */
    manualCleanup(delayDays?: number): Promise<UserCleanupResult>;
}
//# sourceMappingURL=user-cleanup.service.d.ts.map