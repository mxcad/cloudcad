///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma } from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';

/** 审计日志列表项（含用户摘要），#207 阶段 1 显式标注以消除 TS2742 */
export type AuditLogListItem = Prisma.AuditLogGetPayload<{
  include: {
    user: {
      select: { id: true; email: true; username: true };
    };
  };
}>;

/** 审计日志详情（含用户完整摘要），#207 阶段 1 显式标注以消除 TS2742 */
export type AuditLogDetailItem = Prisma.AuditLogGetPayload<{
  include: {
    user: {
      select: { id: true; email: true; username: true; nickname: true };
    };
  };
}>;

/**
 * 高频读操作集合（#207 阶段 1，ADR-0045）：
 * 成功记录零审查价值且占满日志量，由写入入口统一过滤；失败记录保留（异常才有审查价值）
 */
const HIGH_FREQUENCY_READ_ACTIONS = new Set<AuditAction>([
  AuditAction.FILE_UPLOAD,
  AuditAction.FILE_DOWNLOAD,
  AuditAction.USER_LOGIN,
]);

/** 导出单次查询上限（#207 阶段 2：防超大导出拖垮查询） */
const EXPORT_MAX_ROWS = 50000;

/** 导出支持的格式 */
export type AuditExportFormat = 'csv' | 'excel';

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

  constructor(
    private readonly prisma: DatabaseService,
    private readonly alertService: AlertService
  ) {}

  /**
   * 记录审计日志
   *
   * @param action 操作类型
   * @param resourceType 资源类型
   * @param resourceId 资源 ID
   * @param userId 操作用户 ID
   * @param success 操作是否成功
   * @param errorMessage 错误信息（如果失败）
   * @param details 旧版详细信息（JSON 字符串，已废弃；提供时自动解析并入 params）
   * @param projectId 项目 ID（项目维度过滤，系统级操作可空）
   * @param resourceName 资源名称快照（资源删除后记录依然可读）
   * @param params 结构化参数（替代 details blob）
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
    projectId?: string,
    resourceName?: string,
    params?: Record<string, unknown> | null,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    // #207 阶段 1：高频读操作成功记录直接丢弃（日志零噪音），失败保留
    if (success && HIGH_FREQUENCY_READ_ACTIONS.has(action)) {
      this.logger.debug(
        `高频读操作成功记录已跳过: ${action} - ${resourceType} - ${resourceId}`
      );
      return;
    }

    // details 字段已废弃（#207）：兼容旧调用方，JSON 字符串解析后并入 params 写入
    let normalizedParams: Prisma.InputJsonValue | undefined;
    if (params) {
      normalizedParams = params as unknown as Prisma.InputJsonValue;
    } else if (details) {
      try {
        normalizedParams = JSON.parse(details) as Prisma.InputJsonValue;
      } catch {
        normalizedParams = { raw: details };
      }
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          resourceType,
          resourceId,
          projectId,
          resourceName,
          params: normalizedParams,
          userId,
          ipAddress,
          userAgent,
          success,
          errorMessage,
        },
      });

      this.logger.debug(
        `审计日志记录: ${action} - ${resourceType} - ${resourceId} - ${userId} - ${success ? '成功' : '失败'}`
      );
    } catch (error) {
      const err = error as Error;
      // #207 阶段 2 fail-open：写库失败必须可见（告警 + error 日志），但绝不影响主业务流程
      this.logger.error(
        `审计日志写入失败（业务不阻塞）: ${err.message} ${action} ${resourceType} ${resourceId ?? ''} userId=${userId}`,
        err.stack
      );
      try {
        await this.alertService.raise({
          source: 'audit-log',
          messageKey: 'audit.write.failed',
          // P0：审计日志写入失败 = 合规数据丢失（#207 fail-open 不阻塞业务）
          level: AlertLevel.P0,
          message: `审计日志写入失败: ${err.message}`,
          detail: {
            action,
            resourceType,
            resourceId: resourceId ?? null,
            userId,
            success,
            projectId: projectId ?? null,
          },
        });
      } catch (alertError) {
        // 告警通道本身失败（如 DB 整体不可用）时仅记录日志，不再外抛
        this.logger.error(
          `审计写库失败告警上报失败: ${(alertError as Error).message}`
        );
      }
    }
  }

  /**
   * 项目内节点动作审计统一入口（FILE_CREATE / FILE_UPDATE / FILE_SHARE /
   * FOLDER_CREATE / NODE_RENAME / NODE_MOVE / NODE_COPY / NODE_RESTORE 等）：
   * 按 nodeId 查询所属项目，仅项目内节点记录（个人空间/公共资源库无 projectId 不记，
   * 保持"项目操作历史"语义）；查询/写库失败均不抛出（审计 fail-open，不阻塞主流程）。
   *
   * 统一收敛 upload / save / share / folder-crud / move-copy / trash 多处
   * "查节点 → projectId 判断 → log"样板（code-review：Controller 直写业务逻辑违规 + 重复样板）。
   *
   * @param extraParams 附加 params（如 { shareAction: 'revoke', shareToken }）
   * @param resourceType 资源类型（默认 FILE；文件夹操作传 FOLDER）
   */
  async logProjectNodeAction(
    action: AuditAction,
    nodeId: string | undefined,
    userId: string,
    extraParams?: Record<string, unknown>,
    resourceType: ResourceType = ResourceType.FILE
  ): Promise<void> {
    if (!nodeId || !userId) return;
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, projectId: true, name: true },
      });
      if (!node?.projectId) return;
      await this.log(
        action,
        resourceType,
        node.id,
        userId,
        true,
        undefined,
        undefined,
        node.projectId,
        node.name,
        { fileName: node.name, nodeId: node.id, ...extraParams }
      );
    } catch (error) {
      this.logger.warn(
        `文件动作审计埋点失败（业务不阻塞）: ${(error as Error).message}`
      );
    }
  }

  /**
   * 查询审计日志
   *
   * @param filters 过滤条件
   * @param pagination 分页参数
   * @returns 审计日志列表和总数
   */
  async findAll(
    filters: {
      userId?: string;
      action?: AuditAction[];
      resourceType?: ResourceType[];
      resourceId?: string;
      projectId?: string;
      startDate?: Date;
      endDate?: Date;
      success?: boolean;
      /** 资源名称关键词模糊搜索（项目操作历史"搜索图纸名"） */
      search?: string;
    },
    pagination: {
      page: number;
      limit: number;
    }
  ): Promise<{
    logs: AuditLogListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20 } = pagination;
    const safePage = Number(page) || 1;
    const safeLimit = Number(limit) || 20;
    const skip = (safePage - 1) * safeLimit;

    const where = this.buildWhere(filters);

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

        take: safeLimit,
      }),

      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,

      total,

      page,

      limit,

      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /**
   * 构建审计日志查询过滤条件（#207 阶段 2 提取，供 findAll / exportLogs 复用）
   */
  private buildWhere(filters: {
    userId?: string;
    action?: AuditAction[];
    resourceType?: ResourceType[];
    resourceId?: string;
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
    search?: string;
  }): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action?.length) {
      where.action = { in: filters.action };
    }

    if (filters.resourceType?.length) {
      where.resourceType = { in: filters.resourceType };
    }

    if (filters.resourceId) {
      where.resourceId = filters.resourceId;
    }

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    // 资源名称关键词模糊搜索（不区分大小写）
    if (filters.search) {
      where.resourceName = { contains: filters.search, mode: 'insensitive' };
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = this.buildDateRange(filters);
    }

    if (filters.success !== undefined) {
      where.success = filters.success;
    }

    return where;
  }

  /**
   * 构建 createdAt 日期范围（findAll / exportLogs / getStatistics 共用）
   *
   * 结束日期为"当天"语义：endDate 按次日零点做 lt（排除式闭区间），
   * 保证结束当天 00:00:00 之后的记录也被包含（lte 当天零点会漏掉当天全部记录，
   * 且开始=结束同一天时区间为 [00:00, 00:00] 恒空）。
   */
  private buildDateRange(filters: {
    startDate?: Date;
    endDate?: Date;
  }): Prisma.DateTimeFilter {
    const range: Prisma.DateTimeFilter = {};

    if (filters.startDate) {
      range.gte = filters.startDate;
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setDate(end.getDate() + 1);
      range.lt = end;
    }

    return range;
  }

  /**
   * 获取审计日志详情
   *
   * @param id 日志 ID
   * @returns 审计日志详情（未找到时抛 NotFoundException）
   */
  async findOne(id: string): Promise<AuditLogDetailItem> {
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
      throw new NotFoundException(I18nContext.current()?.t('error.audit.log_not_found') ?? `审计日志 ID ${id} 不存在`);
    }

    return log;
  }

  /**
   * 按筛选条件导出审计日志（#207 阶段 2）
   *
   * 生成 Excel 兼容 CSV（UTF-8 BOM，中文不乱码）。format 参数保留
   * csv / excel 两种语义：当前均输出带 BOM 的 CSV，后续如需真 xlsx 可替换实现。
   * 单次导出最多 EXPORT_MAX_ROWS 条（按时间倒序取最新），防止超大数据集拖垮查询。
   *
   * @param filters 过滤条件（与 findAll 一致）
   * @param format 导出格式（csv | excel）
   * @returns buffer / 文件名 / MIME 类型
   */
  async exportLogs(
    filters: {
      userId?: string;
      action?: AuditAction[];
      resourceType?: ResourceType[];
      resourceId?: string;
      projectId?: string;
      startDate?: Date;
      endDate?: Date;
      success?: boolean;
    },
    format: AuditExportFormat = 'csv'
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const where = this.buildWhere(filters);

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_MAX_ROWS,
    });

    const header = [
      '时间',
      '操作用户',
      '操作',
      '资源类型',
      '资源名称',
      '资源ID',
      '项目ID',
      'IP地址',
      '是否成功',
      '错误信息',
      '参数',
    ];

    const rows = logs.map((log) => [
      log.createdAt.toISOString(),
      log.user?.username || log.user?.email || log.userId,
      log.action,
      log.resourceType,
      log.resourceName ?? '',
      log.resourceId ?? '',
      log.projectId ?? '',
      log.ipAddress ?? '',
      log.success ? '是' : '否',
      log.errorMessage ?? '',
      log.params ? JSON.stringify(log.params) : '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsvField).join(','))
      .join('\r\n');

    // UTF-8 BOM：Excel 直接打开不乱码
    const buffer = Buffer.from(`\uFEFF${csv}`, 'utf8');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `audit-logs-${dateStr}.csv`;

    return {
      buffer,
      filename,
      mimeType: 'text/csv; charset=utf-8',
    };
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
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = this.buildDateRange(filters);
    }

    const [total, successCount, failureCount, actionCounts] = await Promise.all(
      [
        this.prisma.auditLog.count({ where }),

        this.prisma.auditLog.count({ where: { ...where, success: true } }),

        this.prisma.auditLog.count({ where: { ...where, success: false } }),

        this.prisma.auditLog.groupBy({
          by: ['action'],

          where,

          _count: true,
        }),
      ]
    );

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
  async cleanupOldLogs(daysToKeep: number, userId: string = 'unknown'): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`用户 ${userId} 于 ${new Date().toISOString()} 执行了审计日志清理，删除了 ${result.count} 条记录`);

    return result.count;
  }
}

/**
 * 本地时区解析 YYYY-MM-DD 日期（AuditLogController / ProjectAuditLogController 共用）
 *
 * 不能用 new Date('YYYY-MM-DD')：date-only 字符串按 UTC 零点解析，
 * 与服务器本地日边界错位（中国时区差 8 小时），导致结束当天记录被漏掉、
 * 开始=结束同一天时区间为 [00:00, 00:00] 恒空。
 */
export function parseLocalDate(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [, y, m, d] = match.map((s) => Number(s));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return undefined;
  const date = new Date(y, m - 1, d);
  // 校验实际日期与输入一致（new Date(2026, 12, 45) 会溢出归约到次年 2 月，必须拒绝）
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return undefined;
  }
  return date;
}

/**
 * 逗号分隔多值参数拆分（多选筛选，如 action=PERMISSION_GRANT,ROLE_CREATE）。
 * 空字符串/纯空白返回 undefined（与"未传参"等价，不产生过滤条件）。
 */
export function splitQueryValues(value?: string): string[] | undefined {
  if (!value) return undefined;
  const values = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

/**
 * CSV 字段转义（RFC 4180）：含逗号/引号/换行的字段用双引号包裹，内部引号翻倍
 */
function escapeCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
