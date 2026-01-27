import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditAction, ResourceType } from '@prisma/client';

/**
 * 审计日志服务
 *
 * 功能：
 * 1. 记录所有权限变更操作
 * 2. 记录所有访问操作
 * 3. 提供审计日志查询
 * 4. 提供审计日志导出
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: DatabaseService) {}

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
  async log(
    action: AuditAction,
    resourceType: ResourceType,
    resourceId: string | undefined,
    userId: string,
    success: boolean,
    errorMessage?: string,
    details?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          resourceType,
          resourceId,
          userId,
          details,
          ipAddress,
          userAgent,
          success,
          errorMessage,
        },
      });

      this.logger.debug(
        `审计日志记录: ${action} - ${resourceType} - ${resourceId} - ${userId} - ${success ? '成功' : '失败'}`,
      );
    } catch (error) {
      this.logger.error(`记录审计日志失败: ${error.message}`, error.stack);
      // 不抛出异常，避免影响主业务流程
    }
  }

  /**
   * 查询审计日志
   *
   * @param filters 过滤条件
   * @param pagination 分页参数
   * @returns 审计日志列表和总数
   */
  async findAll(filters: {
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
  }) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }

    if (filters.resourceId) {
      where.resourceId = filters.resourceId;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    if (filters.success !== undefined) {
      where.success = filters.success;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取审计日志详情
   *
   * @param id 日志 ID
   * @returns 审计日志详情
   */
  async findOne(id: string) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
          },
        },
      },
    });

    if (!log) {
      throw new Error(`审计日志 ID ${id} 不存在`);
    }

    return log;
  }

  /**
   * 获取审计统计信息
   *
   * @param filters 过滤条件
   * @returns 统计信息
   */
  async getStatistics(filters: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  }) {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [total, successCount, failureCount, actionCounts] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.count({ where: { ...where, success: true } }),
      this.prisma.auditLog.count({ where: { ...where, success: false } }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: true,
      }),
    ]);

    const actionStats: Record<string, number> = {};
    actionCounts.forEach((item) => {
      actionStats[item.action] = item._count;
    });

    return {
      total,
      successCount,
      failureCount,
      successRate: total > 0 ? (successCount / total) * 100 : 0,
      actionStats,
    };
  }

  /**
   * 清理旧审计日志
   *
   * @param daysToKeep 保留天数
   * @returns 删除的记录数
   */
  async cleanupOldLogs(daysToKeep: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`清理旧审计日志: 删除了 ${result.count} 条记录`);

    return result.count;
  }
}