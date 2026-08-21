import { Injectable, Logger } from '@nestjs/common';
import type { AlertRecord } from '@cloudcad/db';
import { Prisma as PrismaRuntime } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { AlertLevel, AlertStatus } from './enums/alert.enum';

export interface RaiseAlertInput {
  source: string;
  messageKey: string;
  level: AlertLevel;
  message: string;
  detail?: PrismaRuntime.InputJsonValue;
}

/**
 * 告警服务（L1 基础设施层）
 *
 * 职责：
 * 1. 去重上报：同 source+messageKey 的 OPEN 告警存在则刷新 detail/message，否则新建
 * 2. 两态流转：OPEN ↔ RESOLVED（自动恢复 resolveBySourceKey / 手动兜底 resolveById）
 *
 * 去重实现：应用层查询 + P2002 并发竞态兜底（#242 决议），DB 侧仅普通非唯一索引加速
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 上报或更新告警：同 source+messageKey 的 OPEN 告警存在则刷新，否则新建。
   * 并发竞态下两个会话同时 create 时，P2002 兜底重新查询后 update。
   */
  async raise(input: RaiseAlertInput): Promise<AlertRecord> {
    const { source, messageKey, level, message, detail } = input;
    const data = { level, message, detail: detail ?? undefined };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.alertRecord.findFirst({
          where: { source, messageKey, status: AlertStatus.OPEN },
        });
        if (existing) {
          return tx.alertRecord.update({
            where: { id: existing.id },
            data,
          });
        }
        return tx.alertRecord.create({
          data: { source, messageKey, ...data },
        });
      });
    } catch (e) {
      if (
        e instanceof PrismaRuntime.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const existing = await this.prisma.alertRecord.findFirst({
          where: { source, messageKey, status: AlertStatus.OPEN },
        });
        if (existing) {
          return this.prisma.alertRecord.update({
            where: { id: existing.id },
            data,
          });
        }
      }
      throw e;
    }
  }

  /**
   * 自动恢复：按 source+messageKey 将全部 OPEN 告警置为 RESOLVED。
   * @returns 被解决的告警数量
   */
  async resolveBySourceKey(
    source: string,
    messageKey: string
  ): Promise<number> {
    const result = await this.prisma.alertRecord.updateMany({
      where: { source, messageKey, status: AlertStatus.OPEN },
      data: { status: AlertStatus.RESOLVED, resolvedAt: new Date() },
    });
    return result.count;
  }

  /**
   * 手动兜底：按 id 解决单条告警。
   * updateMany 带 OPEN 状态守卫，避免并发下状态已变更时 update 抛 P2025。
   * @returns 更新后的告警记录；不存在时返回 null
   */
  async resolveById(id: string): Promise<AlertRecord | null> {
    await this.prisma.alertRecord.updateMany({
      where: { id, status: AlertStatus.OPEN },
      data: { status: AlertStatus.RESOLVED, resolvedAt: new Date() },
    });
    return this.prisma.alertRecord.findUnique({ where: { id } });
  }

  /**
   * 分页查询告警记录，可按 level/status/source 过滤。
   * @returns `{ data, pagination: { page, limit, total, totalPages } }`
   */
  async findAll(
    filters: {
      level?: AlertLevel;
      status?: AlertStatus;
      source?: string;
    },
    pagination: { page: number; limit: number }
  ): Promise<{
    data: AlertRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    const where: PrismaRuntime.AlertRecordWhereInput = {};
    if (filters.level) where.level = filters.level;
    if (filters.status) where.status = filters.status;
    if (filters.source) where.source = filters.source;

    const [data, total] = await Promise.all([
      this.prisma.alertRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.alertRecord.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
