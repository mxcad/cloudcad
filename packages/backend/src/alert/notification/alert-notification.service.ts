import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import type { AlertRecord } from '@cloudcad/db';
import { Prisma as PrismaRuntime } from '@cloudcad/db';
import { AppConfig } from '../../config/app.config';
import { DatabaseService } from '../../database/database.service';
import { EmailService } from '../../notification/email.service';
import { AlertService } from '../alert.service';
import { AlertLevel } from '../enums/alert.enum';
import { ALERT_RAISED_EVENT, ALERT_RESOLVED_EVENT } from '../alert.events';

/** 升级告警的固定来源（同时用于防自循环：该来源的告警不再触发邮件） */
const ALERT_EMAIL_SOURCE = 'alert-email';

/** P1 聚合窗口（内存态）：同 source 窗口内事件合并一封邮件 */
interface P1Window {
  records: AlertRecord[];
  /** 窗口起点（毫秒时间戳） */
  startAt: number;
  timer: NodeJS.Timeout;
}

/** 日报清单最大行数，超出截断（统计数字仍为全量） */
const DAILY_REPORT_MAX_ITEMS = 50;

/**
 * 告警通知服务（L1 基础设施层，#311 #312）
 *
 * 订阅 AlertService 的 alert.raised / alert.resolved 领域事件：
 * 1. P0：实时发送邮件告警单；发送成功在 detail 持久化 emailNotifiedAt
 * 2. P1：按 source 聚合窗口（ALERT_P1_WINDOW_MINUTES，默认 15）合并一封邮件
 *    —— 内存态 Map + 定时 flush；多实例部署存在跨实例重复发送风险（设计可接受）
 * 3. P2：每日 ALERT_P2_DAILY_HOUR 点（默认 9）发送前一日告警日报；无前日告警不发送
 * 4. 恢复通知：仅对已发过邮件（detail.emailNotifiedAt）的告警发 RESOLVED 邮件
 * 5. 失败升级：连续失败 ≥ ALERT_EMAIL_FAIL_ESCALATE 次，raise P0 alert-email 告警
 *
 * 自循环防护：source=alert-email 的告警不触发邮件（升级告警本身也是 P0）。
 */
@Injectable()
export class AlertNotificationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AlertNotificationService.name);
  private consecutiveFailures = 0;

  /** P1 聚合窗口：source → window */
  private readonly p1Windows = new Map<string, P1Window>();

  /** P2 日报对时定时器（每分钟检查一次是否到达配置小时） */
  private dailyTimer?: NodeJS.Timeout;
  private lastReportDateKey = '';

  constructor(
    private readonly alertService: AlertService,
    private readonly emailService: EmailService,
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService<AppConfig>
  ) {}

  onApplicationBootstrap(): void {
    this.dailyTimer = setInterval(() => this.checkDailyReport(), 60_000);
  }

  onModuleDestroy(): void {
    if (this.dailyTimer) clearInterval(this.dailyTimer);
    for (const window of this.p1Windows.values()) clearTimeout(window.timer);
    this.p1Windows.clear();
  }

  @OnEvent(ALERT_RAISED_EVENT)
  async onRaised(record: AlertRecord): Promise<void> {
    try {
      await this.handleRaised(record);
    } catch (e) {
      this.logger.error(
        `告警通知处理失败: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  @OnEvent(ALERT_RESOLVED_EVENT)
  async onResolved(record: AlertRecord): Promise<void> {
    try {
      await this.handleResolved(record);
    } catch (e) {
      this.logger.error(
        `恢复通知处理失败: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  /**
   * 触发通知入口。
   */
  private async handleRaised(record: AlertRecord): Promise<void> {
    const config = this.configService.get('alertEmail', { infer: true });
    if (!config?.enabled || config.to.length === 0) return;
    // 升级告警自身不再触发邮件，防止无限循环
    if (record.source === ALERT_EMAIL_SOURCE) return;

    switch (record.level) {
      case AlertLevel.P0:
        await this.sendRaisedEmail(record, config.to);
        break;
      case AlertLevel.P1:
        this.bufferP1(record, config.to, config.p1WindowMinutes ?? 15);
        break;
      // P2 不逐条发送，由每日日报汇总
      case AlertLevel.P2:
        break;
    }
  }

  // ==================== P0 实时邮件 ====================

  private async sendRaisedEmail(
    record: AlertRecord,
    to: string[]
  ): Promise<void> {
    try {
      await this.emailService.sendAlertEmail(to, {
        kind: 'raised',
        level: record.level,
        source: record.source,
        messageKey: record.messageKey,
        message: record.message,
        time: record.createdAt,
        detail: record.detail ?? undefined,
      });
      this.consecutiveFailures = 0;
      await this.mergeDetail(record.id, record.detail, {
        emailNotifiedAt: new Date().toISOString(),
      });
      this.logger.log(
        `P0 告警邮件已发送: ${record.source}/${record.messageKey}`
      );
    } catch (error) {
      await this.handleEmailFailure(
        { source: record.source, messageKey: record.messageKey },
        error
      );
      await this.safeMergeDetail(record.id, record.detail, {
        emailSendFailedAt: new Date().toISOString(),
        emailSendError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ==================== P1 聚合（#312） ====================

  /**
   * 同 source 窗口内缓冲，窗口到期统一 flush 成一封聚合邮件。
   * 首条事件创建窗口并调度 timer；后续事件仅入列。
   */
  bufferP1(record: AlertRecord, to: string[], windowMinutes: number): void {
    const existing = this.p1Windows.get(record.source);
    if (existing) {
      existing.records.push(record);
      return;
    }
    const startAt = Date.now();
    const windowMs = Math.max(1, windowMinutes) * 60_000;
    const timer = setTimeout(() => {
      void this.flushP1(record.source, to);
    }, windowMs);
    // 定时器不阻止进程退出
    timer.unref?.();
    this.p1Windows.set(record.source, {
      records: [record],
      startAt,
      timer,
    });
  }

  /**
   * 窗口到期：将同 source 缓冲的全部告警合并成一封邮件（含事件数与首次/末次时间）。
   */
  async flushP1(source: string, to: string[]): Promise<void> {
    const window = this.p1Windows.get(source);
    if (!window) return;
    clearTimeout(window.timer);
    this.p1Windows.delete(source);

    const records = window.records;
    if (records.length === 0) return;
    const first = records[0];
    const last = records[records.length - 1];

    try {
      await this.emailService.sendAggregatedAlertEmail(to, {
        level: last.level,
        source,
        count: records.length,
        firstAt: first.createdAt,
        lastAt: last.createdAt,
        items: records.map((r) => ({
          messageKey: r.messageKey,
          message: r.message,
          time: r.createdAt,
        })),
      });
      this.consecutiveFailures = 0;
      this.logger.log(`P1 聚合邮件已发送: ${source}（${records.length} 条）`);
    } catch (error) {
      await this.handleEmailFailure(
        { source, messageKey: last.messageKey },
        error
      );
    }
  }

  // ==================== P2 每日日报（#312） ====================

  /**
   * 每分钟对时：到达配置小时（默认 9 点）后当日首次触发即发前一日日报。
   */
  checkDailyReport(): void {
    const config = this.configService.get('alertEmail', { infer: true });
    if (!config?.enabled || config.to.length === 0) return;

    const now = new Date();
    const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (now.getHours() !== (config.p2DailyHour ?? 9)) return;
    if (this.lastReportDateKey === dateKey) return;
    this.lastReportDateKey = dateKey;
    void this.sendDailyReport(config.to).catch((e) => {
      this.logger.error(
        `告警日报发送失败: ${e instanceof Error ? e.message : String(e)}`
      );
    });
  }

  /**
   * 汇总前一日新增告警（含已恢复），按 level/source 分组统计；
   * 清单超过 DAILY_REPORT_MAX_ITEMS 行截断（统计仍为全量）。无前日告警时不发送。
   */
  async sendDailyReport(to: string[]): Promise<void> {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);

    const [records, total] = await Promise.all([
      this.prisma.alertRecord.findMany({
        where: { createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.alertRecord.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
    ]);
    if (total === 0) {
      this.logger.log('前一日无新增告警，跳过日报');
      return;
    }

    const statMap = new Map<string, number>();
    for (const r of records) {
      const key = `${r.level}/${r.source}`;
      statMap.set(key, (statMap.get(key) ?? 0) + 1);
    }

    const dateLabel = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    await this.emailService.sendDailyReportEmail(to, {
      dateLabel,
      total,
      stats: [...statMap.entries()].map(([key, count]) => {
        const [level, source] = key.split('/');
        return { level, source, count };
      }),
      items: records.slice(0, DAILY_REPORT_MAX_ITEMS).map((r) => ({
        level: r.level,
        source: r.source,
        messageKey: r.messageKey,
        message: r.message,
        createdAt: r.createdAt,
        status: r.status,
      })),
    });
    this.logger.log(`告警日报已发送: ${dateLabel}（${total} 条）`);
  }

  // ==================== 恢复通知 ====================

  /**
   * 恢复通知：仅对此前成功发过邮件的告警发送（#312：与 P1 聚合独立，resolve 即时发送）。
   */
  private async handleResolved(record: AlertRecord): Promise<void> {
    const config = this.configService.get('alertEmail', { infer: true });
    if (!config?.enabled || config.to.length === 0) return;
    if (record.source === ALERT_EMAIL_SOURCE) return;
    if (!this.hasEmailed(record)) return;

    try {
      await this.emailService.sendAlertEmail(config.to, {
        kind: 'resolved',
        level: record.level,
        source: record.source,
        messageKey: record.messageKey,
        message: record.message,
        time: record.resolvedAt ?? new Date(),
        detail: record.detail ?? undefined,
      });
      this.logger.log(`恢复通知已发送: ${record.source}/${record.messageKey}`);
    } catch (error) {
      this.logger.error(
        `恢复通知发送失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // ==================== 失败升级 ====================

  /**
   * 发送失败的公共处理：记日志、累加计数、达到阈值升级 P0 alert-email 告警并重置。
   */
  private async handleEmailFailure(
    context: { source: string; messageKey: string },
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `告警邮件发送失败: ${message} (${context.source}/${context.messageKey})`
    );
    this.consecutiveFailures += 1;

    const config = this.configService.get('alertEmail', { infer: true });
    const threshold = config?.failEscalate ?? 5;
    if (this.consecutiveFailures < threshold) return;

    this.consecutiveFailures = 0;
    await this.alertService.raise({
      source: ALERT_EMAIL_SOURCE,
      messageKey: 'email_send_failed',
      level: AlertLevel.P0,
      message: `告警邮件连续 ${threshold} 次发送失败，请检查 SMTP 配置（最近失败: ${context.source}/${context.messageKey}: ${message}）`,
      detail: {
        threshold,
        lastFailedSource: context.source,
        lastFailedMessageKey: context.messageKey,
        error: message,
      },
    });
  }

  /** 判断告警是否已成功发过邮件（detail.emailNotifiedAt 由本服务持久化） */
  private hasEmailed(record: AlertRecord): boolean {
    return (
      typeof record.detail === 'object' &&
      record.detail !== null &&
      !Array.isArray(record.detail) &&
      'emailNotifiedAt' in (record.detail as Record<string, unknown>)
    );
  }

  private async safeMergeDetail(
    id: string,
    base: PrismaRuntime.JsonValue | null,
    patch: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.mergeDetail(id, base, patch);
    } catch (error) {
      this.logger.error(
        `告警详情标记更新失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /** 将通知标记合并进 detail JSON（保留原有字段） */
  private async mergeDetail(
    id: string,
    base: PrismaRuntime.JsonValue | null,
    patch: Record<string, unknown>
  ): Promise<void> {
    const current =
      typeof base === 'object' && base !== null && !Array.isArray(base)
        ? (base as Record<string, unknown>)
        : {};
    await this.prisma.alertRecord.update({
      where: { id },
      data: {
        detail: { ...current, ...patch } as PrismaRuntime.InputJsonValue,
      },
    });
  }
}
