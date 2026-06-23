import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../database/database.service';
import { PaymentGatewayFactory } from './gateway/payment-gateway.factory';
import { MockPaymentGateway } from './gateway/mock/mock-payment.gateway';
import { MembershipService } from './membership.service';
import { PlansService } from './plans.service';
import { OrderStatus, MembershipTier } from './enums/billing.enum';
import { randomUUID } from 'node:crypto';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { WebhookVerifyResult, CreatePaymentResult } from './gateway/payment-gateway.interface';

interface BuildPayOrder {
  id: string;
  orderNo: string;
  planId: string;
  amount: number;
  status: string;
  gateway: string;
  gatewayOrderId: string | null;
  createdAt: Date;
}

interface BuildPayPlan {
  name: string;
  durationDays: number;
  price: number;
}

interface RefundOrderInfo {
  userId: string;
  plan: { tier: string; durationDays: number | null };
}

function generateOrderNo(): string {
  const suffix = randomUUID().replace(/-/g, '').substring(0, 24);
  return `PAY${suffix}`;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private prisma: DatabaseService,
    private gatewayFactory: PaymentGatewayFactory,
    private membershipService: MembershipService,
    private plansService: PlansService,
  ) {}

  async getPlans() {
    return this.plansService.getActivePlans();
  }

  async getUserMembership(userId: string) {
    return this.membershipService.getMembership(userId);
  }

  async getUserOrders(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.paymentOrder.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: dto.planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('plan not found or inactive');

    const gateway = await this.gatewayFactory.getActiveGateway();

    const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
    const pending = await this.prisma.paymentOrder.findFirst({
      where: {
        userId,
        planId: plan.id,
        status: OrderStatus.PENDING,
        gateway: gateway.name,
        createdAt: { gte: twoHoursAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      const result = await gateway.createPayment({
        orderNo: pending.orderNo,
        amount: pending.amount,
        description: pending.description || plan.name,
        tradeType: dto.tradeType,
        openid: dto.openid,
        ip: dto.ip || '127.0.0.1',
        redirectUrl: dto.redirectUrl,
      });
      if (result.gatewayOrderId && result.gatewayOrderId !== pending.gatewayOrderId) {
        await this.prisma.paymentOrder.update({
          where: { id: pending.id, status: OrderStatus.PENDING },
          data: { gatewayOrderId: result.gatewayOrderId },
        });
      }
      const updated = await this.prisma.paymentOrder.findUnique({ where: { id: pending.id } });
      return this.buildPayResponse(updated!, plan, result);
    }

    const orderNo = generateOrderNo();

    const ip = dto.ip || '127.0.0.1';
    const result = await gateway.createPayment({
      orderNo,
      amount: plan.price,
      description: plan.name,
      tradeType: dto.tradeType,
      openid: dto.openid,
      ip,
      redirectUrl: dto.redirectUrl,
    });

    const order = await this.prisma.paymentOrder.create({
      data: {
        orderNo,
        userId,
        planId: plan.id,
        amount: plan.price,
        gateway: gateway.name,
        gatewayOrderId: result.gatewayOrderId,
        tradeType: dto.tradeType,
        description: plan.name,
      },
    });

    return this.buildPayResponse(order, plan, result);
  }

  async handlePaymentNotify(verified: WebhookVerifyResult): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const txClient = tx as Prisma.TransactionClient;
      const order = await txClient.paymentOrder.findUnique({
        where: { orderNo: verified.orderNo },
        include: { plan: true },
      });
      if (!order) throw new Error(`order not found: ${verified.orderNo}`);
      if (order.status !== OrderStatus.PENDING) return;

      if (order.amount !== verified.amount) {
        this.logger.warn(`amount mismatch, skipping: order=${order.amount} callback=${verified.amount} orderNo=${verified.orderNo}`);
        await txClient.paymentOrder.update({
          where: { id: order.id },
          data: { status: OrderStatus.FAILED, failedAt: new Date(), description: `金额不匹配: order=${order.amount} callback=${verified.amount}` },
        });
        return;
      }

      const { count } = await txClient.paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: {
          status: OrderStatus.SUCCEEDED,
          gatewayPaidId: verified.gatewayOrderId,
          paidAt: verified.paidAt,
        },
      });

      if (count === 0) return;

      await this.membershipService.activate(txClient, order.userId, order.plan);
    });
  }

  async getAllOrders(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, email: true, username: true } }, plan: { select: { name: true } } },
      }),
      this.prisma.paymentOrder.count(),
    ]);
    return { items, total, page, limit };
  }

  async handleWechatNotify(xml: string): Promise<string> {
    try {
      const gateway = this.gatewayFactory.getGateway('wechat_pay');
      const verified = await gateway.verifyWebhook(xml, {});
      if (!verified.isValid) return this.failXml('sign verification failed');
      await this.handlePaymentNotify(verified);
      return this.successXml();
    } catch (e) {
      this.logger.error('wechat notify failed', e);
      return this.failXml('internal error');
    }
  }

  async handleMockCallback(orderNo: string): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new Error(`order not found: ${orderNo}`);

    const gateway = this.gatewayFactory.getGateway('mock');
    const verified = await gateway.verifyWebhook({
      out_trade_no: orderNo,
      transaction_id: `mock_txn_${Date.now()}`,
      total_fee: order.amount,
    }, {});
    await this.handlePaymentNotify(verified);
  }

  async queryOrder(userId: string, orderNo: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new NotFoundException('order not found');
    return order;
  }

  async refreshOrder(userId: string, orderNo: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.PENDING) return order;

    try {
      const gateway = this.gatewayFactory.getGateway(order.gateway);
      const result = await gateway.queryOrder(orderNo);
      switch (result.status) {
        case 'SUCCESS':
          if (result.gatewayOrderId) {
            const amount = result.amount ?? order.amount;
            if (amount !== order.amount) {
              this.logger.warn(`amount mismatch on refresh: order=${order.amount} gateway=${amount}`);
            }
            await this.handlePaymentNotify({
              isValid: true,
              orderNo,
              gatewayOrderId: result.gatewayOrderId,
              amount,
              paidAt: result.paidAt ?? new Date(),
            });
          }
          break;
        case 'CLOSED':
          this.logger.log(`order closed by gateway: ${orderNo}`);
          await this.prisma.paymentOrder.update({
            where: { id: order.id },
            data: { status: OrderStatus.CLOSED, closedAt: new Date() },
          });
          break;
        case 'NOTPAY':
          // 微信支付二维码已过期但微信返回 NOTPAY，标记为 TIMEOUT
          if (order.createdAt < new Date(Date.now() - 7200000)) {
            this.logger.log(`order exceeded 2h window, marking timeout: ${orderNo}`);
            await this.prisma.paymentOrder.update({
              where: { id: order.id },
              data: { status: OrderStatus.TIMEOUT, closedAt: new Date() },
            });
          }
          break;
      }
    } catch (e) {
      this.logger.warn(`query order failed: ${orderNo}`, e);
    }

    return this.prisma.paymentOrder.findUnique({ where: { orderNo } });
  }

  async mockScan(userId: string, orderNo: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new NotFoundException('order not found');
    if (order.gateway !== 'mock') throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.PENDING) return order;

    const mockGateway = this.gatewayFactory.getGateway('mock') as MockPaymentGateway;
    mockGateway.forceComplete(orderNo);

    return this.refreshOrder(userId, orderNo);
  }

  async refund(orderNo: string, reason?: string): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderNo },
      include: { plan: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.SUCCEEDED) {
      throw new BadRequestException('only succeeded orders can be refunded');
    }

    // Step 1: Gateway refund first
    const gateway = this.gatewayFactory.getGateway(order.gateway);
    try {
      await gateway.refund(orderNo, order.amount);
    } catch (e) {
      this.logger.error(`refund gateway call failed: ${orderNo}`, e);
      throw new BadRequestException('退款请求发送失败，请稍后重试');
    }

    // Step 2: DB update — optimistic lock, mark as REFUNDED
    const { count } = await this.prisma.paymentOrder.updateMany({
      where: { id: order.id, status: OrderStatus.SUCCEEDED },
      data: { status: OrderStatus.REFUNDED, refundedAt: new Date() },
    });
    if (count === 0) {
      this.logger.warn(`refund gateway succeeded but order already refunded: ${orderNo}`);
      return;
    }

    // Step 3: Recalculate membership
    await this.recalculateMembershipAfterRefund(order);

    this.logger.log(`refund completed: orderNo=${orderNo}, reason=${reason}`);
  }

  private async recalculateMembershipAfterRefund(refundedOrder: RefundOrderInfo) {
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const remaining = await tx.paymentOrder.findMany({
        where: {
          userId: refundedOrder.userId,
          status: OrderStatus.SUCCEEDED,
        },
        include: { plan: true },
      });

      if (remaining.length === 0) {
        await tx.userMembership.update({
          where: { userId: refundedOrder.userId },
          data: { expiresAt: now, tier: MembershipTier.FREE },
        });
        return;
      }

      let maxTier: MembershipTier = MembershipTier.FREE;
      let latestExpires = new Date(0);
      for (const r of remaining) {
        const w = MembershipService.TIER_WEIGHT[r.plan.tier] ?? 0;
        if (w > (MembershipService.TIER_WEIGHT[maxTier] ?? 0)) {
          maxTier = r.plan.tier as MembershipTier;
        }
        if (r.paidAt && r.plan.durationDays) {
          const exp = new Date(r.paidAt.getTime() + r.plan.durationDays * 86400000);
          if (exp > latestExpires) latestExpires = exp;
        }
      }
      // 确保 not-a-number 或 invalid date 不会传播
      if (Number.isNaN(latestExpires.getTime())) latestExpires = now;

      await tx.userMembership.update({
        where: { userId: refundedOrder.userId },
        data: {
          tier: maxTier as any,
          expiresAt: latestExpires > now ? latestExpires : now,
        },
      });
    });
  }

  private buildPayResponse(order: BuildPayOrder, plan: BuildPayPlan, gatewayResult?: CreatePaymentResult) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      planId: order.planId,
      amount: order.amount,
      status: order.status,
      gateway: order.gateway,
      gatewayOrderId: order.gatewayOrderId,
      codeUrl: gatewayResult?.codeUrl,
      payParams: gatewayResult?.payParams,
      redirectUrl: gatewayResult?.redirectUrl,
      planName: plan.name,
      durationDays: plan.durationDays,
      priceYuan: plan.price / 100,
      createdAt: order.createdAt,
    };
  }

  private successXml() {
    return '<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>';
  }

  private failXml(msg: string) {
    return `<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[${msg}]]></return_msg></xml>`;
  }
}
