import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { OrderStatus, MembershipTier } from './enums/billing.enum';

@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(private prisma: DatabaseService) {}

  // 服务器本地时间 02:00 执行（建议服务器时区设为 UTC+8）
  @Cron('0 2 * * *')
  async downgradeExpiredMemberships() {
    const { count } = await this.prisma.userMembership.updateMany({
      where: { expiresAt: { lte: new Date(), not: null } },
      data: { tier: MembershipTier.FREE, expiresAt: null },
    });
    if (count > 0) {
      this.logger.log(`downgraded ${count} expired memberships`);
    }
  }

  @Cron('0 */2 * * *')
  async timeoutPendingOrders() {
    const cutoff = new Date(Date.now() - 2 * 3600000);
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
