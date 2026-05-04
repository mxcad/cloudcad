export declare class UserCleanupStatsResponseDto {
    pendingCleanup: number;
    expiryDate: Date;
    delayDays: number;
}
export declare class UserCleanupTriggerDto {
    delayDays?: number;
}
export declare class UserCleanupTriggerResponseDto {
    message: string;
    success: boolean;
    processedUsers: number;
    deletedMembers: number;
    deletedProjects: number;
    deletedAuditLogs: number;
    markedForStorageCleanup: number;
    errors: Array<{
        userId: string;
        message: string;
    }>;
}
//# sourceMappingURL=user-cleanup.dto.d.ts.map