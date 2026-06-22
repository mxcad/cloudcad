import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { OrderStatus, MembershipTier } from './enums/billing.enum';

@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(private prisma: DatabaseService) {}

  @Cron('0 2 * * *')
  async downgradeExpiredMemberships() {
    const expired = await this.prisma.userMembership.findMany({
      where: { expiresAt: { lte: new Date(), not: null } },
    });
    for (const m of expired) {
      await this.prisma.userMembership.update({
        where: { id: m.id },
        data: { tier: MembershipTier.FREE, expiresAt: null },
      });
      this.logger.log(`membership expired & downgraded: userId=${m.userId}`);
    }
    if (expired.length > 0) {
      this.logger.log(`downgraded ${expired.length} expired memberships`);
    }
  }

  @Cron('0 3 * * *')
  async timeoutPendingOrders() {
    const cutoff = new Date(Date.now() - 24 * 3600000);
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
