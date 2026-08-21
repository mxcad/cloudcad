import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { StorageInfoService } from '../file-system/storage-quota/storage-info.service';
import { OrderStatus } from './enums/billing.enum';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../task-run/task-run.constants';
import { BillingService } from './billing.service';

@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(
    private prisma: DatabaseService,
    private storageInfoService: StorageInfoService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly alertService: AlertService,
    private readonly taskRunService: TaskRunService,
    private readonly billingService: BillingService
  ) {
    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.BILLING.DOWNGRADE_MEMBERSHIPS, {
      description: '过期会员降级',
      execute: () => this.downgradeExpiredMembershipsTask(),
    });
    this.taskRunService.register(TASK_NAMES.BILLING.TIMEOUT_ORDERS, {
      description: '超时未支付订单关闭',
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
  @Cron('0 2 * * *')
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
      await this.raiseTaskFailed('downgradeExpiredMemberships', error);
    }
  }

  /**
   * 过期会员降级裸执行（定时 + 手动触发共用）
   */
  private async downgradeExpiredMembershipsTask(): Promise<void> {
    const expired = await this.prisma.userMembership.findMany({
      where: { expiresAt: { lte: new Date(), not: null } },
      select: { userId: true },
    });
    const userIds = expired.map((m) => m.userId);

    const { count } = await this.prisma.userMembership.updateMany({
      where: { expiresAt: { lte: new Date(), not: null } },
      data: { tierLevel: 0, expiresAt: null },
    });
    if (count > 0) {
      this.logger.log(`downgraded ${count} expired memberships`);
      // 会员等级降级会影响存储额度，立即失效配额缓存
      for (const userId of userIds) {
        await this.storageInfoService.invalidateQuotaCache(userId);
      }
    }
  }

  @Cron('0 */2 * * *')
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
      await this.raiseTaskFailed('timeoutPendingOrders', error);
    }
  }

  /**
   * 超时订单关闭裸执行（定时 + 手动触发共用）
   */
  private async timeoutPendingOrdersTask(): Promise<void> {
    const cutoff = new Date(Date.now() - 2 * 3600000);

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

  /**
   * 定时任务失败钩子（#245 模式）：task_run_failed 告警，source = scheduler:billing
   */
  private async raiseTaskFailed(task: string, error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:billing',
        messageKey: 'task_run_failed',
        level: AlertLevel.CRITICAL,
        message: `定时任务 billing 失败（${task}）: ${error instanceof Error ? error.message : String(error)}`,
        detail: {
          task,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (alertError) {
      this.logger.error(
        `任务失败告警上报失败: ${alertError.message}`,
        alertError.stack
      );
    }
  }
}
