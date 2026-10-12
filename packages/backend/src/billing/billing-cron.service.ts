import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { MembershipService } from '../vip/membership.service';
import { OrderStatus } from './enums/billing.enum';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { TaskRunService } from '../task-run/task-run.service';
import { TaskRunFailureReporter } from '../task-run/task-run-failure-reporter';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../task-run/task-run.constants';
import { BillingService } from './billing.service';
import { PENDING_ORDER_TTL_MS } from './payment-order';

/**
 * 定时 cron 表达式：@Cron 装饰器与手动触发注册表（任务清单展示）共用同一来源，防止漂移
 */
const DOWNGRADE_MEMBERSHIPS_CRON = '0 2 * * *';
const TIMEOUT_ORDERS_CRON = '0 */2 * * *';

@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(
    private prisma: DatabaseService,
    private readonly membershipService: MembershipService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly taskRunFailureReporter: TaskRunFailureReporter,
    private readonly taskRunService: TaskRunService,
    private readonly billingService: BillingService
  ) {
    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.BILLING.DOWNGRADE_MEMBERSHIPS, {
      description: '过期会员降级',
      schedule: DOWNGRADE_MEMBERSHIPS_CRON,
      scheduleLabel: '每天 02:00',
      execute: () => this.downgradeExpiredMembershipsTask(),
    });
    this.taskRunService.register(TASK_NAMES.BILLING.TIMEOUT_ORDERS, {
      description: '超时未支付订单关闭',
      schedule: TIMEOUT_ORDERS_CRON,
      scheduleLabel: '每 2 小时',
      execute: () => this.timeoutPendingOrdersTask(),
    });
  }

  private async isEnabled(): Promise<boolean> {
    return this.runtimeConfigService.getValue<boolean>(
      TASK_ENABLED_KEYS.BILLING,
      true
    );
  }

  // 服务器本地时间 02:00 执行（建议服务器时区设为 UTC+8）
  @Cron(DOWNGRADE_MEMBERSHIPS_CRON)
  async downgradeExpiredMemberships() {
    const enabled = await this.isEnabled();
    if (!enabled) {
      this.logger.log('计费定时任务已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.BILLING.DOWNGRADE_MEMBERSHIPS,
        () => this.downgradeExpiredMembershipsTask()
      );
    } catch (error) {
      this.logger.error(
        `downgradeExpiredMemberships failed: ${error.message}`,
        error.stack
      );
      await this.taskRunFailureReporter.reportTaskFailed({
        source: 'scheduler:billing',
        task: 'downgradeExpiredMemberships',
        error,
      });
    }
  }

  /**
   * 过期会员降级裸执行（定时 + 手动触发共用）
   */
  private async downgradeExpiredMembershipsTask(): Promise<void> {
    // 写侧单点：过期降级 + 配额缓存失效统一走 MembershipService（VipModule @Global 注入）
    const count = await this.membershipService.expireOverdueMemberships();
    if (count > 0) {
      this.logger.log(`downgraded ${count} expired memberships`);
    }
  }

  @Cron(TIMEOUT_ORDERS_CRON)
  async timeoutPendingOrders() {
    const enabled = await this.isEnabled();
    if (!enabled) {
      this.logger.log('计费定时任务已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(TASK_NAMES.BILLING.TIMEOUT_ORDERS, () =>
        this.timeoutPendingOrdersTask()
      );
    } catch (error) {
      this.logger.error(
        `timeoutPendingOrders failed: ${error.message}`,
        error.stack
      );
      await this.taskRunFailureReporter.reportTaskFailed({
        source: 'scheduler:billing',
        task: 'timeoutPendingOrders',
        error,
      });
    }
  }

  /**
   * 超时订单关闭裸执行（定时 + 手动触发共用）
   */
  private async timeoutPendingOrdersTask(): Promise<void> {
    const cutoff = new Date(Date.now() - PENDING_ORDER_TTL_MS);

    // 关单前先对账：已支付订单补激活而非超时关闭（回调丢失兜底，不依赖用户操作）。
    // 对账会把已支付订单改为 SUCCEEDED，随后的关单 updateMany 带 PENDING 守卫，
    // 天然不会误关已补激活的订单。
    try {
      const recovered = await this.billingService.reconcilePendingOrders(cutoff);
      if (recovered > 0) {
        this.logger.log(
          `reconciled ${recovered} paid orders before timing out pending orders`
        );
      }
    } catch (e) {
      // 对账失败不阻断关单（下一轮 cron 重试），关单仍只处理 PENDING 订单
      this.logger.warn(
        `reconcile pending orders failed before timeout: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }

    const { count } = await this.prisma.paymentOrder.updateMany({
      where: {
        status: OrderStatus.PENDING,
        createdAt: { lte: cutoff },
      },
      data: { status: OrderStatus.TIMEOUT, closedAt: new Date() },
    });
    if (count > 0) {
      this.logger.log(`timed out ${count} pending orders`);
    }
  }
}
