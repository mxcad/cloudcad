import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
export declare class AuditLogUserDto {
    id: string;
    email: string;
    username: string;
    nickname?: string;
}
export declare class AuditLogDto {
    id: string;
    action: AuditAction;
    resourceType: ResourceType;
    resourceId?: string;
    userId: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
    createdAt: Date;
    user: AuditLogUserDto;
}
export declare class AuditLogListResponseDto {
    logs: AuditLogDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export declare class AuditStatisticsResponseDto {
    total: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    actionStats: Record<string, number>;
}
export declare class CleanupResponseDto {
    message: string;
    deletedCount: number;
}
//# sourceMappingURL=audit-log.dto.d.ts.map