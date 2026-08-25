import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AlertRecord } from '@cloudcad/db';
import { Prisma as PrismaRuntime } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { AlertLevel, AlertStatus } from './enums/alert.enum';
import {
  ALERT_RAISED_EVENT,
  ALERT_RESOLVED_EVENT,
} from './alert.events';

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
 * 3. 事件发布：raise/resolve 后 emit alert.raised / alert.resolved（#311，供通知服务订阅）
 *
 * 去重实现：应用层查询 + P2002 并发竞态兜底（#242 决议），DB 侧仅普通非唯一索引加速
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  /**
   * 上报或更新告警：同 source+messageKey 的 OPEN 告警存在则刷新，否则新建。
   * 并发竞态下两个会话同时 create 时，P2002 兜底重新查询后 update。
   */
  async raise(input: RaiseAlertInput): Promise<AlertRecord> {
    const { source, messageKey, level, message, detail } = input;
    const data = { level, message, detail: detail ?? undefined };

    try {
      const record = await this.prisma.$transaction(async (tx) => {
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
      this.eventEmitter.emit(ALERT_RAISED_EVENT, record);
      return record;
    } catch (e) {
      if (
        e instanceof PrismaRuntime.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const existing = await this.prisma.alertRecord.findFirst({
          where: { source, messageKey, status: AlertStatus.OPEN },
        });
        if (existing) {
          const record = await this.prisma.alertRecord.update({
            where: { id: existing.id },
            data,
          });
          this.eventEmitter.emit(ALERT_RAISED_EVENT, record);
          return record;
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
    const openRecords = await this.prisma.alertRecord.findMany({
      where: { source, messageKey, status: AlertStatus.OPEN },
    });
    if (openRecords.length === 0) return 0;

    const resolvedAt = new Date();
    const result = await this.prisma.alertRecord.updateMany({
      where: { source, messageKey, status: AlertStatus.OPEN },
      data: { status: AlertStatus.RESOLVED, resolvedAt },
    });

    for (const record of openRecords) {
      this.eventEmitter.emit(ALERT_RESOLVED_EVENT, {
        ...record,
        status: AlertStatus.RESOLVED,
        resolvedAt,
      });
    }
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
    const record = await this.prisma.alertRecord.findUnique({ where: { id } });
    if (record && record.status === AlertStatus.RESOLVED) {
      this.eventEmitter.emit(ALERT_RESOLVED_EVENT, record);
    }
    return record;
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
