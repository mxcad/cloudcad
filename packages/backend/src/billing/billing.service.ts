import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PaymentGatewayFactory } from './gateway/payment-gateway.factory';
import { MembershipService } from './membership.service';
import { PlansService } from './plans.service';
import { OrderStatus } from './enums/billing.enum';
import { randomUUID } from 'node:crypto';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { WebhookVerifyResult } from './gateway/payment-gateway.interface';

function generateOrderNo(): string {
  const suffix = randomUUID().replace(/-/g, '').substring(0, 24);
  return `MC${suffix}`;
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

  async getUserOrders(userId: string) {
    return this.prisma.paymentOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: dto.planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('plan not found or inactive');

    const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
    const pending = await this.prisma.paymentOrder.findFirst({
      where: {
        userId,
        planId: plan.id,
        status: OrderStatus.PENDING,
        createdAt: { gte: twoHoursAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      const gateway = await this.gatewayFactory.getActiveGateway();
      const result = await gateway.createPayment({
        orderNo: pending.orderNo,
        amount: pending.amount,
        description: pending.description || plan.name,
        tradeType: dto.tradeType,
        openid: dto.openid,
        ip: dto.ip || '127.0.0.1',
      });
      return this.buildPayResponse(pending, plan, result);
    }

    const orderNo = generateOrderNo();
    const gateway = await this.gatewayFactory.getActiveGateway();

    const ip = dto.ip || '127.0.0.1';
    const result = await gateway.createPayment({
      orderNo,
      amount: plan.price,
      description: plan.name,
      tradeType: dto.tradeType,
      openid: dto.openid,
      ip,
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

    if (gateway.name === 'mock') {
      await this.handleMockCallback(orderNo);
      const updated = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
      return this.buildPayResponse(updated!, plan, result, true);
    }

    return this.buildPayResponse(order, plan, result);
  }

  async handlePaymentNotify(verified: WebhookVerifyResult): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findUnique({
        where: { orderNo: verified.orderNo },
        include: { plan: true },
      });
      if (!order) throw new Error(`order not found: ${verified.orderNo}`);
      if (order.status !== OrderStatus.PENDING) return;

      if (order.amount !== verified.amount) {
        throw new Error(`amount mismatch: order=${order.amount} callback=${verified.amount}`);
      }

      const { count } = await (tx as any).paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: {
          status: OrderStatus.SUCCEEDED,
          gatewayPaidId: verified.gatewayOrderId,
          paidAt: verified.paidAt,
        },
      });

      if (count === 0) return;

      await this.membershipService.activate(tx as any, order.userId, order.plan);
    });
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

  async queryOrder(orderNo: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async refreshOrder(orderNo: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.PENDING) return order;

    try {
      const gateway = this.gatewayFactory.getGateway(order.gateway);
      const result = await gateway.queryOrder(orderNo);
      if (result.status === 'SUCCESS' && result.gatewayOrderId) {
        await this.handlePaymentNotify({
          isValid: true,
          orderNo,
          gatewayOrderId: result.gatewayOrderId,
          amount: result.amount ?? order.amount,
          paidAt: result.paidAt ?? new Date(),
        });
      }
    } catch (e) {
      this.logger.warn(`query order failed: ${orderNo}`, e);
    }

    return this.prisma.paymentOrder.findUnique({ where: { orderNo } });
  }

  async refund(orderNo: string, reason?: string): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.SUCCEEDED) {
      throw new BadRequestException('only succeeded orders can be refunded');
    }

    const gateway = this.gatewayFactory.getGateway(order.gateway);
    await gateway.refund(orderNo, order.amount);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await (tx as any).paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.SUCCEEDED },
        data: {
          status: OrderStatus.REFUNDED,
          refundedAt: new Date(),
        },
      });
      if (count === 0) return;

      await tx.userMembership.update({
        where: { userId: order.userId },
        data: { expiresAt: new Date(), tier: 'FREE' as any },
      });
    });

    this.logger.log(`refund completed: orderNo=${orderNo}, reason=${reason}`);
  }

  private buildPayResponse(order: any, plan: any, gatewayResult?: any, isMock?: boolean) {
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
