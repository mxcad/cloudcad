import { DatabaseService } from '../database/database.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
/**
 * 审计日志服务
 *
 * 功能：
 * 1. 记录所有权限变更操作
 * 2. 记录所有访问操作
 * 3. 提供审计日志查询
 * 4. 提供审计日志导出
 */
export declare class AuditLogService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: DatabaseService);
    /**
     * 记录审计日志
     *
     * @param action 操作类型
     * @param resourceType 资源类型
     * @param resourceId 资源 ID
     * @param userId 操作用户 ID
     * @param success 操作是否成功
     * @param errorMessage 错误信息（如果失败）
     * @param details 详细信息（JSON 格式）
     * @param ipAddress IP 地址
     * @param userAgent 用户代理
     */
    log(action: AuditAction, resourceType: ResourceType, resourceId: string | undefined, userId: string, success: boolean, errorMessage?: string, details?: string, ipAddress?: string, userAgent?: string): Promise<void>;
    /**
  
       * 查询审计日志
  
       *
  
       * @param filters 过滤条件
  
       * @param pagination 分页参数
  
       * @returns 审计日志列表和总数
  
       */
    findAll(filters: {
        userId?: string;
        action?: AuditAction;
        resourceType?: ResourceType;
        resourceId?: string;
        startDate?: Date;
        endDate?: Date;
        success?: boolean;
    }, pagination: {
        page: number;
        limit: number;
    }): Promise<{
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
    /**
  
       * 获取审计日志详情
  
       *
  
       * @param id 日志 ID
  
       * @returns 审计日志详情
  
       */
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
    /**
  
       * 获取审计统计信息
  
       *
  
       * @param filters 过滤条件
  
       * @returns 统计信息
  
       */
    getStatistics(filters: {
        startDate?: Date;
        endDate?: Date;
        userId?: string;
    }): Promise<{
        total: number;
        successCount: number;
        failureCount: number;
        successRate: number;
        actionStats: Record<string, number>;
    }>;
    /**
  
       * 清理旧审计日志
  
       *
  
       * @param daysToKeep 保留天数
  
       * @returns 删除的记录数
  
       */
    cleanupOldLogs(daysToKeep: number, userId?: string): Promise<number>;
}
//# sourceMappingURL=audit-log.service.d.ts.map