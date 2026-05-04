import { AuditLogService } from './audit-log.service';
export declare class AuditLogController {
    private readonly auditLogService;
    constructor(auditLogService: AuditLogService);
    findAll(userId?: string, action?: string, resourceType?: string, resourceId?: string, startDate?: string, endDate?: string, success?: string, page?: string, limit?: string): Promise<{
        logs: ({
            user: {
                id: string;
                email: string | null;
                username: string;
            };
        } & {
            success: boolean;
            id: string;
            createdAt: Date;
            action: import("@prisma/client").$Enums.AuditAction;
            resourceType: import("@prisma/client").$Enums.ResourceType;
            resourceId: string | null;
            userId: string;
            details: string | null;
            ipAddress: string | null;
            userAgent: string | null;
            errorMessage: string | null;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findOne(id: string): Promise<{
        user: {
            id: string;
            email: string | null;
            username: string;
            nickname: string | null;
        };
    } & {
        success: boolean;
        id: string;
        createdAt: Date;
        action: import("@prisma/client").$Enums.AuditAction;
        resourceType: import("@prisma/client").$Enums.ResourceType;
        resourceId: string | null;
        userId: string;
        details: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        errorMessage: string | null;
    }>;
    getStatistics(startDate?: string, endDate?: string, userId?: string): Promise<{
        total: number;
        successCount: number;
        failureCount: number;
        successRate: number;
        actionStats: Record<string, number>;
    }>;
    cleanupOldLogs(req: any, body: {
        daysToKeep: number;
    }): Promise<{
        message: string;
        deletedCount: number;
    }>;
}
//# sourceMappingURL=audit-log.controller.d.ts.map