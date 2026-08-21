import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Prisma as PrismaType } from '@cloudcad/db';
import { Prisma as PrismaRuntime } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { PaymentGatewayFactory } from './gateway/payment-gateway.factory';
import { MockPaymentGateway } from './gateway/mock/mock-payment.gateway';
import { MembershipService, MONTH_DAYS } from '../vip/membership.service';
import { StorageInfoService } from '../file-system/storage-quota/storage-info.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { EmailService } from '../notification/email.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { OrderStatus, RefundApplicationStatus } from './enums/billing.enum';
import { randomBytes } from 'crypto';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { RepayOrderDto } from './dto/repay-order.dto';
import type {
  WebhookVerifyResult,
  CreatePaymentResult,
  PaymentGateway,
} from './gateway/payment-gateway.interface';

import { I18nContext } from 'nestjs-i18n';

function generateOrderNo(): string {
  const suffix = randomBytes(16).toString('hex').substring(0, 24);
  return `PAY${suffix}`;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private prisma: DatabaseService,
    private gatewayFactory: PaymentGatewayFactory,
    private membershipService: MembershipService,
    private storageInfoService: StorageInfoService,
    private runtimeConfigService: RuntimeConfigService,
    private emailService: EmailService,
    private auditLogService: AuditLogService
  ) {}

  async getUserMembership(userId: string) {
    return this.membershipService.getMembership(userId);
  }

  async getUserOrders(
    userId: string,
    page = 1,
    limit = 20,
    status?: string,
    keyword?: string
  ) {
    const skip = (page - 1) * limit;
    const where: PrismaType.PaymentOrderWhereInput = { userId };
    if (status) where.status = status as OrderStatus;
    if (keyword) where.orderNo = { contains: keyword };
    const [items, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          // 用户侧订单列表携带最近一条退款申请，便于前端展示"审核中"状态与驳回原因
          refundApplications: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              reason: true,
              createdAt: true,
              reviewNote: true,
              reviewedAt: true,
            },
          },
        },
      }),
      this.prisma.paymentOrder.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const [vipTier, durationPricing] = await Promise.all([
      this.prisma.vipTier.findUnique({ where: { id: dto.vipTierId } }),
      this.prisma.durationPricing.findUnique({
        where: { id: dto.durationPricingId },
      }),
    ]);
    if (!vipTier || !vipTier.isActive)
      throw new NotFoundException('vip tier not found or inactive');
    if (!durationPricing || !durationPricing.isActive)
      throw new NotFoundException('duration pricing not found or inactive');

    const currentTier = await this.membershipService.getEffectiveTier(userId);
    if (currentTier > 0 && vipTier.level < currentTier) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.billing.downgrade_not_allowed') ??
          '不能降级购买，请选择升级或续费当前等级'
      );
    }

    const amount = Math.round(
      (vipTier.baseMonthlyPrice *
        durationPricing.multiplierBps *
        durationPricing.months) /
        10000
    );

    const gateway = await this.gatewayFactory.getActiveGateway();

    const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
    const pending = await this.prisma.paymentOrder.findFirst({
      where: {
        userId,
        vipTierId: vipTier.id,
        months: durationPricing.months,
        status: OrderStatus.PENDING,
        gateway: gateway.name,
        createdAt: { gte: twoHoursAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      // 同 repay 缺陷：复用的 PENDING 单可能在微信侧已支付（回调丢失/延迟），
      // 直接重新下单会被微信以 ORDERPAID（"该订单已支付"）拒绝并 500。
      // 先查单对账：已支付则完成订单 + 激活会员，直接返回订单终态。
      if (await this.reconcileGatewayPaidOrder(pending, gateway)) {
        const latest = await this.prisma.paymentOrder.findUnique({
          where: { id: pending.id },
        });
        if (latest && latest.status !== OrderStatus.PENDING) {
          return this.buildPayResponse(latest, vipTier, durationPricing);
        }
      }
      const result = await gateway.createPayment({
        orderNo: pending.orderNo,
        amount: pending.amount,
        description: `${vipTier.name} ${durationPricing.label}`,
        tradeType: dto.tradeType,
        openid: dto.openid,
        ip: dto.ip || '127.0.0.1',
        redirectUrl: dto.redirectUrl,
      });
      const updateData: PrismaType.PaymentOrderUncheckedUpdateInput = {
        gatewayOrderId: result.gatewayOrderId,
      };
      if (dto.tradeType !== pending.tradeType)
        updateData.tradeType = dto.tradeType;
      if (
        result.gatewayOrderId &&
        result.gatewayOrderId !== pending.gatewayOrderId
      ) {
        updateData.gatewayOrderId = result.gatewayOrderId;
      }
      // 使用 updateMany 带 PENDING 状态守卫：并发下订单状态可能已变更，update 抛 P2025 会变 500
      await this.prisma.paymentOrder.updateMany({
        where: { id: pending.id, status: OrderStatus.PENDING },
        data: updateData,
      });
      const updated = await this.prisma.paymentOrder.findUnique({
        where: { id: pending.id },
      });
      return this.buildPayResponse(updated!, vipTier, durationPricing, result);
    }

    // 主建单逻辑抽成私有方法，供 P2002 并发兜底"关陈旧单后重试"复用
    return this.createOrderRecord(
      userId,
      vipTier,
      durationPricing,
      gateway,
      amount,
      dto,
      twoHoursAgo
    );
  }

  /**
   * 建单主逻辑：生成 orderNo → 网关下单 → 落库。
   * 独立成方法以便 P2002 并发兜底时复用（避免递归 createOrder 重复校验/查档）。
   */
  private async createOrderRecord(
    userId: string,
    vipTier: {
      id: string;
      name: string;
      level: number;
      baseMonthlyPrice: number;
    },
    durationPricing: { id: string; months: number; label: string },
    gateway: PaymentGateway,
    amount: number,
    dto: CreateOrderDto,
    twoHoursAgo: Date
  ) {
    const orderNo = generateOrderNo();

    const ip = dto.ip || '127.0.0.1';
    const result = await gateway.createPayment({
      orderNo,
      amount,
      description: `${vipTier.name} ${durationPricing.label}`,
      tradeType: dto.tradeType,
      openid: dto.openid,
      ip,
      redirectUrl: dto.redirectUrl,
    });

    try {
      const order = await this.prisma.paymentOrder.create({
        data: {
          orderNo,
          userId,
          vipTierId: vipTier.id,
          months: durationPricing.months,
          amount,
          gateway: gateway.name,
          gatewayOrderId: result.gatewayOrderId,
          tradeType: dto.tradeType,
          description: `${vipTier.name} ${durationPricing.label}`,
        },
      });
      return this.buildPayResponse(order, vipTier, durationPricing, result);
    } catch (e) {
      // 并发兜底：部分唯一索引冲突（P2002）时复用同款 PENDING 订单，避免重复建单
      if (
        e instanceof PrismaRuntime.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const existing = await this.prisma.paymentOrder.findFirst({
          where: {
            userId,
            vipTierId: vipTier.id,
            months: durationPricing.months,
            status: OrderStatus.PENDING,
            gateway: gateway.name,
            createdAt: { gte: twoHoursAgo },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          // 用 existing 的 orderNo/amount 重新下单，避免用户扫码支付 DB 中不存在的孤儿订单
          const newResult = await gateway.createPayment({
            orderNo: existing.orderNo,
            amount: existing.amount,
            description: `${vipTier.name} ${durationPricing.label}`,
            tradeType: dto.tradeType,
            openid: dto.openid,
            ip: dto.ip || '127.0.0.1',
            redirectUrl: dto.redirectUrl,
          });
          // 忽略 count：即使并发已将订单改为其他状态，也直接返回支付参数
          await this.prisma.paymentOrder.updateMany({
            where: { id: existing.id, status: OrderStatus.PENDING },
            data: { gatewayOrderId: newResult.gatewayOrderId },
          });
          return this.buildPayResponse(
            existing,
            vipTier,
            durationPricing,
            newResult
          );
        }

        // 未找到 2h 内同款 PENDING：冲突来自陈旧 PENDING 占用唯一索引，先关闭再重试建单
        await this.prisma.paymentOrder.updateMany({
          where: {
            userId,
            vipTierId: vipTier.id,
            months: durationPricing.months,
            status: OrderStatus.PENDING,
            createdAt: { lt: twoHoursAgo },
          },
          data: { status: OrderStatus.TIMEOUT, closedAt: new Date() },
        });
        return this.createOrderRecord(
          userId,
          vipTier,
          durationPricing,
          gateway,
          amount,
          dto,
          twoHoursAgo
        );
      }
      throw e;
    }
  }

  async handlePaymentNotify(verified: WebhookVerifyResult): Promise<void> {
    let activatedUserId: string | undefined;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findUnique({
        where: { orderNo: verified.orderNo },
        include: { vipTier: true },
      });
      if (!order) throw new Error(`order not found: ${verified.orderNo}`);

      // 非 PENDING 终态：TIMEOUT/CLOSED 订单向网关对账，避免已付款订单回调被吞
      if (order.status !== OrderStatus.PENDING) {
        if (
          order.status === OrderStatus.TIMEOUT ||
          order.status === OrderStatus.CLOSED
        ) {
          await this.reconcileTerminatedOrder(tx, order, verified);
          activatedUserId = order.userId;
        }
        return;
      }

      if (order.amount !== verified.amount) {
        this.logger.warn(
          `amount mismatch, skipping: order=${order.amount} callback=${verified.amount} orderNo=${verified.orderNo}`
        );
        const { count } = await tx.paymentOrder.updateMany({
          where: { id: order.id, status: OrderStatus.PENDING },
          data: {
            status: OrderStatus.FAILED,
            failedAt: new Date(),
            description: `金额不匹配: order=${order.amount} callback=${verified.amount}`,
          },
        });
        // count===0 说明订单已被并发改成其他状态，直接返回
        if (count === 0) return;
        return;
      }

      const { count } = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: {
          status: OrderStatus.SUCCEEDED,
          gatewayPaidId: verified.gatewayOrderId,
          paidAt: verified.paidAt,
        },
      });

      if (count === 0) {
        // count===0 说明订单已被并发改为其他状态（如 cron 标记 TIMEOUT/CLOSED）。
        // 此时重新读最新状态：若为终态，走网关对账路径，避免已付款订单永久卡在 TIMEOUT。
        const latest = await tx.paymentOrder.findUnique({
          where: { id: order.id },
          include: { vipTier: true },
        });
        if (
          latest &&
          (latest.status === OrderStatus.TIMEOUT ||
            latest.status === OrderStatus.CLOSED)
        ) {
          await this.reconcileTerminatedOrder(tx, latest, verified);
          activatedUserId = latest.userId;
        }
        return;
      }

      await this.activateMembershipForOrder(tx, order);
      activatedUserId = order.userId;
    });

    // 会员等级/到期时间变化会影响存储额度，事务提交后立即失效配额缓存保证前端即时生效
    if (activatedUserId) {
      await this.storageInfoService.invalidateQuotaCache(activatedUserId);
    }
  }

  async getAllOrders(page = 1, limit = 20, status?: string, keyword?: string) {
    const skip = (page - 1) * limit;
    const where: PrismaType.PaymentOrderWhereInput = {};
    if (status) where.status = status as OrderStatus;
    if (keyword) where.orderNo = { contains: keyword };
    const [items, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, username: true } },
          vipTier: { select: { name: true, level: true } },
        },
      }),
      this.prisma.paymentOrder.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async handleWechatNotify(xml: string): Promise<string> {
    try {
      const gateway = this.gatewayFactory.getGateway('wechat_pay');
      const verified = await gateway.verifyWebhook(xml, {});
      if (!verified.isValid) {
        // 必须留痕：验签失败是"用户已支付但订单停留 PENDING"的高发原因
        // （key 配置漂移/伪造回调），静默吞掉会导致资损无从排查
        this.logger.warn(
          `wechat notify sign verification failed: orderNo=${verified.orderNo || 'unknown'}`
        );
        return this.failXml('sign verification failed');
      }
      await this.handlePaymentNotify(verified);
      return this.successXml();
    } catch (e) {
      this.logger.error('wechat notify failed', e);
      return this.failXml('internal error');
    }
  }

  async manualComplete(orderNo: string): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderNo },
    });
    if (!order) throw new Error(`order not found: ${orderNo}`);

    await this.handlePaymentNotify({
      isValid: true,
      orderNo,
      gatewayOrderId: `manual_${Date.now()}`,
      amount: order.amount,
      paidAt: new Date(),
    });
  }

  async queryOrder(userId: string, orderNo: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderNo },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new NotFoundException('order not found');
    return order;
  }

  async repayOrder(userId: string, orderNo: string, dto: RepayOrderDto) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderNo },
      include: { vipTier: true },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.PENDING) {
      return this.buildPayResponse(
        order,
        order.vipTier ?? { name: 'Unknown', level: 0 },
        { months: order.months ?? 1, label: `${order.months ?? 1}个月` }
      );
    }

    // 陈旧 PENDING 订单复用同一 out_trade_no 会被微信拒绝，先关闭旧单再重建新单
    if (order.createdAt < new Date(Date.now() - 2 * 3600000)) {
      // 防降级：当前有效等级高于该订单等级时按 createOrder 逻辑抛错
      const currentTier = await this.membershipService.getEffectiveTier(userId);
      if (order.vipTier && currentTier > order.vipTier.level) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.billing.downgrade_not_allowed') ??
            '不能降级购买，请选择升级或续费当前等级'
        );
      }

      // durationPricing 反查（含 NotFound）放在关单之前：避免旧单已关却因查不到定价拿不到新单
      const durationPricing = await this.prisma.durationPricing.findFirst({
        where: { months: order.months ?? 1, isActive: true },
      });
      if (!durationPricing) {
        throw new NotFoundException('duration pricing not found or inactive');
      }

      // 最后一步才关闭旧单，再创建新单；createOrder 网关失败时保持错误上抛，用户重试会建新单
      await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.TIMEOUT, closedAt: new Date() },
      });

      const newDto: CreateOrderDto = {
        vipTierId: order.vipTierId ?? '',
        durationPricingId: durationPricing.id,
        tradeType: dto.tradeType || order.tradeType || 'JSAPI',
      };
      if (dto.openid) newDto.openid = dto.openid;
      if (dto.ip) newDto.ip = dto.ip;
      if (dto.redirectUrl) newDto.redirectUrl = dto.redirectUrl;

      return this.createOrder(userId, newDto);
    }

    const vipTier =
      order.vipTier ??
      (await this.prisma.vipTier.findFirst({ where: { level: 0 } }));
    if (!vipTier) throw new NotFoundException('vip tier not found');

    const durationPricing = {
      months: order.months ?? 1,
      label: `${order.months ?? 1}个月`,
    };

    const gateway = await this.gatewayFactory.getActiveGateway();

    // 微信侧该 out_trade_no 可能已支付（回调丢失/延迟到达）：直接重新下单会被
    // 微信以 ORDERPAID（"该订单已支付"）拒绝并 500，用户已扣款却拿不到会员。
    // 先查单对账：已支付则完成订单 + 激活会员，直接返回订单终态。
    if (await this.reconcileGatewayPaidOrder(order, gateway)) {
      const latest = await this.prisma.paymentOrder.findUnique({
        where: { id: order.id },
      });
      if (latest && latest.status !== OrderStatus.PENDING) {
        return this.buildPayResponse(latest, vipTier, durationPricing);
      }
    }

    let result: CreatePaymentResult;
    try {
      result = await gateway.createPayment({
        orderNo: order.orderNo,
        amount: order.amount,
        description:
          order.description ?? `${vipTier.name} ${order.months ?? 1}个月`,
        tradeType: dto.tradeType || order.tradeType || 'NATIVE',
        openid: dto.openid,
        ip: dto.ip || '127.0.0.1',
        redirectUrl: dto.redirectUrl,
      });
    } catch (e) {
      // 竞态兜底：查单时尚未支付、下单瞬间支付完成（回调延迟），微信以
      // ORDERPAID 拒绝重新下单。转对账路径完成订单，避免用户已付款却收到 500。
      if (
        (e as { errCode?: string } | null)?.errCode === 'ORDERPAID' &&
        (await this.reconcileGatewayPaidOrder(order, gateway))
      ) {
        const latest = await this.prisma.paymentOrder.findUnique({
          where: { id: order.id },
        });
        if (latest && latest.status === OrderStatus.SUCCEEDED) {
          return this.buildPayResponse(latest, vipTier, durationPricing);
        }
      }
      throw e;
    }

    if (
      result.gatewayOrderId &&
      result.gatewayOrderId !== order.gatewayOrderId
    ) {
      // 加 PENDING 状态守卫：避免订单已被并发关闭/支付后仍写入网关参数
      await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: {
          gatewayOrderId: result.gatewayOrderId,
          tradeType: dto.tradeType || order.tradeType,
        },
      });
    }

    return this.buildPayResponse(
      {
        ...order,
        gatewayOrderId: result.gatewayOrderId || order.gatewayOrderId,
      },
      vipTier,
      durationPricing,
      result
    );
  }

  async refreshOrder(userId: string, orderNo: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderNo },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.PENDING) return order;

    try {
      const gateway = this.gatewayFactory.getGateway(order.gateway);
      const result = await gateway.queryOrder(orderNo);
      switch (result.status) {
        case 'SUCCESS':
          if (!result.gatewayOrderId) {
            this.logger.warn(
              `gateway SUCCESS but no transaction_id: ${orderNo}`
            );
            break;
          }
          if (result.amount != null && result.amount !== order.amount) {
            this.logger.warn(
              `amount mismatch on refresh, order FAILED: order=${order.amount} gateway=${result.amount} orderNo=${orderNo}`
            );
            const { count } = await this.prisma.paymentOrder.updateMany({
              where: { id: order.id, status: OrderStatus.PENDING },
              data: {
                status: OrderStatus.FAILED,
                failedAt: new Date(),
                description: `金额不匹配: order=${order.amount} gateway=${result.amount}`,
              },
            });
            if (count === 0)
              this.logger.warn(
                `order status changed concurrently, skip failed: ${orderNo}`
              );
            return this.prisma.paymentOrder.findUnique({ where: { orderNo } });
          }
          await this.handlePaymentNotify({
            isValid: true,
            orderNo,
            gatewayOrderId: result.gatewayOrderId,
            amount: result.amount ?? order.amount,
            paidAt: result.paidAt ?? new Date(),
          });
          break;
        case 'CLOSED':
          this.logger.log(`order closed by gateway: ${orderNo}`);
          await this.prisma.$transaction(async (tx) => {
            const { count } = await tx.paymentOrder.updateMany({
              where: { id: order.id, status: OrderStatus.PENDING },
              data: { status: OrderStatus.CLOSED, closedAt: new Date() },
            });
            if (count === 0)
              this.logger.warn(
                `order status changed concurrently, skip close: ${orderNo}`
              );
          });
          break;
        case 'NOTPAY':
          if (order.createdAt < new Date(Date.now() - 7200000)) {
            this.logger.log(
              `order exceeded 2h window, marking timeout: ${orderNo}`
            );
            await this.prisma.$transaction(async (tx) => {
              const { count } = await tx.paymentOrder.updateMany({
                where: { id: order.id, status: OrderStatus.PENDING },
                data: { status: OrderStatus.TIMEOUT, closedAt: new Date() },
              });
              if (count === 0)
                this.logger.warn(
                  `order status changed concurrently, skip timeout: ${orderNo}`
                );
            });
          }
          break;
      }
    } catch (e) {
      this.logger.warn(`query order failed: ${orderNo}`, e);
    }

    return this.prisma.paymentOrder.findUnique({ where: { orderNo } });
  }

  /**
   * 后端主动对账（cron 兜底）：向网关查询超过 cutoff 仍 PENDING 的订单，
   * 已支付则完成订单 + 激活会员（金额校验与 refreshOrder 同语义）。
   * 回调丢失（IP 拦截/网络故障）时不依赖用户任何操作即可自愈，
   * 防止"用户已扣款但会员未开通"。
   * @returns 本轮成功补激活的订单数
   */
  async reconcilePendingOrders(cutoff: Date): Promise<number> {
    const candidates = await this.prisma.paymentOrder.findMany({
      where: { status: OrderStatus.PENDING, createdAt: { lte: cutoff } },
      select: { orderNo: true, amount: true, gateway: true },
      // 每轮限量，避免集中查单触发网关限流；剩余订单下一轮继续
      take: 100,
    });

    let recovered = 0;
    for (const order of candidates) {
      try {
        const gateway = this.gatewayFactory.getGateway(order.gateway);
        const result = await gateway.queryOrder(order.orderNo);
        if (result.status !== 'SUCCESS' || !result.gatewayOrderId) continue;

        if (result.amount != null && result.amount !== order.amount) {
          // 金额不匹配：置 FAILED 绝不激活会员（与 refreshOrder 同语义）
          this.logger.warn(
            `amount mismatch on reconcile, order FAILED: order=${order.amount} gateway=${result.amount} orderNo=${order.orderNo}`
          );
          await this.prisma.paymentOrder.updateMany({
            where: { orderNo: order.orderNo, status: OrderStatus.PENDING },
            data: {
              status: OrderStatus.FAILED,
              failedAt: new Date(),
              description: `金额不匹配: order=${order.amount} gateway=${result.amount}`,
            },
          });
          continue;
        }

        await this.handlePaymentNotify({
          isValid: true,
          orderNo: order.orderNo,
          gatewayOrderId: result.gatewayOrderId,
          amount: result.amount ?? order.amount,
          paidAt: result.paidAt ?? new Date(),
        });
        recovered++;
        this.logger.log(
          `reconciled paid order by cron: orderNo=${order.orderNo}`
        );
      } catch (e) {
        // 单笔失败不阻断本轮其余订单，下一轮 cron 重试
        this.logger.warn(
          `reconcile pending order failed: orderNo=${order.orderNo}`,
          e
        );
      }
    }
    return recovered;
  }

  async mockScan(userId: string, orderNo: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderNo },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new NotFoundException('order not found');
    if (order.gateway !== 'mock')
      throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.PENDING) return order;

    const mockGateway = this.gatewayFactory.getGateway(
      'mock'
    ) as MockPaymentGateway;
    mockGateway.forceComplete(orderNo);

    return this.refreshOrder(userId, orderNo);
  }

  async refund(orderNo: string, reason?: string, revertMembership = true): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderNo },
      include: { vipTier: true },
    });
    if (!order) throw new NotFoundException('order not found');
    // 幂等：订单已退款（refundedAt 非空）说明此前已退款成功（微信侧 out_refund_no 幂等键兜底），
    // 直接返回，避免审核重试/并发重复执行二次打款
    if (order.status === OrderStatus.REFUNDED && order.refundedAt) {
      this.logger.log(
        `refund skipped (already refunded): orderNo=${orderNo}, refundedAt=${order.refundedAt.toISOString()}`
      );
      return;
    }
    if (order.status !== OrderStatus.SUCCEEDED) {
      throw new BadRequestException('only succeeded orders can be refunded');
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.SUCCEEDED },
        data: {
          status: OrderStatus.REFUNDED,
          refundedAt: new Date(),
          refundReason: reason,
        },
      });
      if (count === 0) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.billing.order_already_refunded') ??
            '订单已被退款或状态已变更，请刷新后重试'
        );
      }

      const gateway = this.gatewayFactory.getGateway(order.gateway);
      let gatewayOk = false;
      let lastError: Error | null = null;
      const MAX_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await gateway.refund(orderNo, order.amount);
          gatewayOk = true;
          lastError = null;
          break;
        } catch (e) {
          lastError = e as Error;
          this.logger.warn(
            `refund attempt ${attempt}/${MAX_RETRIES} failed: ${orderNo}`,
            e
          );
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }

      if (!gatewayOk) {
        this.logger.error(
          `refund gateway failed after ${MAX_RETRIES} attempts, rolled back: ${orderNo}`,
          lastError
        );
        throw new BadRequestException(
          I18nContext.current()?.t(
            'error.billing.refund_failed_state_restored'
          ) ?? '退款请求发送失败，订单状态已恢复'
        );
      }
    });

    if (revertMembership) {
      try {
        // 事务 commit 后再重算会员水位：重算内部自开新事务，若放在外层事务内，
        // Prisma 7 顶层 client 不嵌套 savepoint，READ COMMITTED 读不到未提交的 REFUNDED 状态
        await this.recalculateMembershipAfterRefund(order);
      } catch (e) {
        // 退款已完成，仅会员水位可能不准，记录告警不阻断
        this.logger.error(
          `recalculate membership after refund failed: orderNo=${orderNo}`,
          e
        );
      }
    } else {
      this.logger.log(`refund skipped membership revert: orderNo=${orderNo}`);
    }

    // 退款会导致配额变化，立即失效配额缓存保证前端即时生效
    await this.storageInfoService.invalidateQuotaCache(order.userId);

    this.logger.log(`refund completed: orderNo=${orderNo}, reason=${reason}`);
  }

  /**
   * 用户申请退款：仅 SUCCEEDED 订单可申请，同一订单同一时刻最多一条待审核申请。
   * 申请成功后 fire-and-forget 邮件通知管理员邮箱（runtime-config: refundNotifyEmails）。
   */
  async applyRefund(userId: string, orderNo: string, reason: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderNo },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('order not found');
    }
    if (order.status !== OrderStatus.SUCCEEDED || order.refundedAt) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.billing.refund_apply_not_allowed') ??
          '当前订单状态不允许申请退款'
      );
    }

    let application: Awaited<
      ReturnType<typeof this.prisma.refundApplication.create>
    >;
    try {
      application = await this.prisma.$transaction(async (tx) => {
        const pending = await tx.refundApplication.findFirst({
          where: {
            orderId: order.id,
            status: RefundApplicationStatus.PENDING,
          },
        });
        if (pending) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.billing.refund_apply_already_pending') ??
              '该订单已有待审核的退款申请'
          );
        }
        return tx.refundApplication.create({
          data: {
            orderId: order.id,
            userId,
            amount: order.amount,
            reason,
          },
        });
      });
    } catch (e) {
      // 并发兜底：部分唯一索引（order_id, status=PENDING）冲突 → 与 findFirst 检查同语义
      if (
        e instanceof PrismaRuntime.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.billing.refund_apply_already_pending') ??
            '该订单已有待审核的退款申请'
        );
      }
      throw e;
    }

    this.logger.log(
      `refund application created: id=${application.id}, orderNo=${orderNo}`
    );
    // 邮件通知失败不阻断申请流程，仅记录告警
    this.notifyRefundApplicationCreated(application, order).catch((e) =>
      this.logger.warn(
        `refund application notify failed: id=${application.id}`,
        e
      )
    );

    // 资金敏感操作审计（写库失败不阻塞业务）
    await this.logRefundAudit(
      AuditAction.REFUND_APPLY,
      orderNo,
      userId,
      application.id,
      {
        orderId: order.id,
        applicationId: application.id,
        amount: order.amount,
      }
    );

    return application;
  }

  /**
   * 退款申请列表（管理端）
   */
  async listRefundApplications(
    page = 1,
    limit = 20,
    status?: RefundApplicationStatus
  ) {
    const skip = (page - 1) * limit;
    const where: PrismaType.RefundApplicationWhereInput = {};
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      this.prisma.refundApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, username: true } },
          reviewer: {
            select: { id: true, email: true, username: true },
          },
          order: {
            select: {
              orderNo: true,
              description: true,
              status: true,
              gateway: true,
            },
          },
        },
      }),
      this.prisma.refundApplication.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * 审核通过：复用现有退款链路（乐观锁 + 网关退款 + 会员水位重算）。
   * 退款失败时上抛异常，申请保持 PENDING 允许管理员重试。
   */
  async approveRefundApplication(
    applicationId: string,
    reviewerId: string,
    note?: string,
    revertMembership = true
  ) {
    const application = await this.prisma.refundApplication.findUnique({
      where: { id: applicationId },
      include: {
        user: { select: { id: true, email: true, username: true } },
        order: true,
      },
    });
    if (!application) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.billing.refund_application_not_found') ??
          '退款申请不存在'
      );
    }
    if (application.status !== RefundApplicationStatus.PENDING) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.billing.refund_application_not_pending') ??
          '该退款申请已处理，请刷新后重试'
      );
    }

    // 实际退款（订单变 REFUNDED + 可选会员水位重算 + 配额缓存失效）；失败上抛，申请保持 PENDING
    // refund() 已幂等：上一轮退款成功但申请未标记（进程中断等）时重试直接跳过，不会二次打款
    await this.refund(application.order.orderNo, application.reason, revertMembership);

    // 乐观锁标记 APPROVED：并发驳回（reject 已成功）时 count=0 上抛，避免覆写对方结果
    const { count } = await this.prisma.refundApplication.updateMany({
      where: { id: applicationId, status: RefundApplicationStatus.PENDING },
      data: {
        status: RefundApplicationStatus.APPROVED,
        reviewerId,
        reviewNote: note ?? null,
        reviewedAt: new Date(),
      },
    });
    if (count === 0) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.billing.refund_application_not_pending') ??
          '该退款申请已处理，请刷新后重试'
      );
    }

    this.logger.log(
      `refund application approved: id=${applicationId}, orderNo=${application.order.orderNo}`
    );
    this.notifyRefundResult(application, 'approved', note).catch((e) =>
      this.logger.warn(
        `refund result notify failed: id=${applicationId}`,
        e
      )
    );

    // 资金敏感操作审计（写库失败不阻塞业务）
    await this.logRefundAudit(
      AuditAction.REFUND_APPROVE,
      application.order.orderNo,
      reviewerId,
      applicationId,
      { applicationId, amount: application.order.amount, note: note ?? null }
    );
  }

  /**
   * 驳回退款申请：仅更新申请状态，订单保持 SUCCEEDED，用户可再次申请。
   */
  async rejectRefundApplication(
    applicationId: string,
    reviewerId: string,
    note?: string
  ) {
    const application = await this.prisma.refundApplication.findUnique({
      where: { id: applicationId },
      include: {
        user: { select: { id: true, email: true, username: true } },
        order: true,
      },
    });
    if (!application) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.billing.refund_application_not_found') ??
          '退款申请不存在'
      );
    }

    const { count } = await this.prisma.refundApplication.updateMany({
      where: {
        id: applicationId,
        status: RefundApplicationStatus.PENDING,
      },
      data: {
        status: RefundApplicationStatus.REJECTED,
        reviewerId,
        reviewNote: note ?? null,
        reviewedAt: new Date(),
      },
    });
    if (count === 0) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.billing.refund_application_not_pending') ??
          '该退款申请已处理，请刷新后重试'
      );
    }

    this.logger.log(
      `refund application rejected: id=${applicationId}, orderNo=${application.order.orderNo}`
    );
    this.notifyRefundResult(application, 'rejected', note).catch((e) =>
      this.logger.warn(
        `refund result notify failed: id=${applicationId}`,
        e
      )
    );

    // 资金敏感操作审计（写库失败不阻塞业务）
    await this.logRefundAudit(
      AuditAction.REFUND_REJECT,
      application.order.orderNo,
      reviewerId,
      applicationId,
      { applicationId, amount: application.order.amount, note: note ?? null }
    );
  }

  /**
   * 退款链路审计埋点统一入口：写库失败只记告警，不阻塞业务。
   * resourceId/resourceName 均用订单号（资金维度可追溯），extra 由调用方携带申请上下文。
   */
  private async logRefundAudit(
    action: AuditAction,
    orderNo: string,
    actorId: string,
    applicationId: string,
    extra: Record<string, unknown>
  ) {
    await this.auditLogService
      .log(
        action,
        ResourceType.USER,
        orderNo,
        actorId,
        true,
        undefined,
        undefined,
        undefined,
        orderNo,
        extra
      )
      .catch((e) =>
        this.logger.warn(
          `refund audit failed: applicationId=${applicationId}`,
          e
        )
      );
  }

  /**
   * 申请提交后通知管理员邮箱列表（runtime-config: refundNotifyEmails，逗号分隔）
   */
  private async notifyRefundApplicationCreated(
    application: {
      id: string;
      userId: string;
      amount: number;
      reason: string;
      createdAt: Date;
    },
    order: { orderNo: string; description: string | null }
  ) {
    const [mailEnabled, recipients] = await Promise.all([
      this.runtimeConfigService.getValue<boolean>('mailEnabled', false),
      this.runtimeConfigService.getValue<string>('refundNotifyEmails', ''),
    ]);
    if (!mailEnabled) return;
    const toList = recipients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (toList.length === 0) return;

    const user = await this.prisma.user.findUnique({
      where: { id: application.userId },
      select: { email: true, username: true },
    });
    await this.emailService.sendRefundApplicationNotify(toList, {
      userName: user?.username || user?.email || '-',
      orderNo: order.orderNo,
      description: order.description ?? '',
      amountYuan: application.amount / 100,
      reason: application.reason,
      appliedAt: application.createdAt,
    });
  }

  /**
   * 审核通过/驳回后通知用户本人（mailEnabled 开启且用户有邮箱时）
   */
  private async notifyRefundResult(
    application: {
      userId: string;
      reason: string;
      order: { orderNo: string; amount: number };
    },
    status: 'approved' | 'rejected',
    note?: string
  ) {
    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    if (!mailEnabled) return;
    const user = await this.prisma.user.findUnique({
      where: { id: application.userId },
      select: { email: true },
    });
    if (!user?.email) return;

    await this.emailService.sendRefundResultNotify(user.email, {
      orderNo: application.order.orderNo,
      amountYuan: application.order.amount / 100,
      status,
      reason: application.reason,
      note: note ?? '',
    });
  }

  private async recalculateMembershipAfterRefund(refundedOrder: {
    userId: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const remaining = await tx.paymentOrder.findMany({
        where: {
          userId: refundedOrder.userId,
          status: OrderStatus.SUCCEEDED,
        },
        include: { vipTier: true },
      });

      // 数据获取留 billing：过滤无等级/月数的异常行并告警；水位数学与外部水位保护归 membership
      const orders = remaining
        .filter((r) => r.vipTier && r.months)
        .map((r) => {
          if (!r.paidAt) {
            this.logger.warn(
              `recalculate skipping order ${r.orderNo}: paidAt is null for SUCCEEDED order`
            );
          }
          return {
            vipTierLevel: r.vipTier!.level,
            months: r.months!,
            paidAt: r.paidAt,
          };
        });

      await this.membershipService.recalculateFromOrders(
        tx,
        refundedOrder.userId,
        orders
      );
    });
  }

  /**
   * 重新下单前的网关对账（repay / createOrder 复用 PENDING 单）：
   * 微信侧该 out_trade_no 可能已支付（回调丢失/延迟到达），直接重新下单会被
   * 微信以 ORDERPAID（"该订单已支付"）拒绝并 500，用户已扣款却无法开通会员。
   * 向网关查单确认已支付则走回调路径完成订单 + 激活会员（幂等）。
   * @returns true 表示网关侧已支付且订单已完成（或已在完成处理中）
   */
  private async reconcileGatewayPaidOrder(
    order: { orderNo: string; amount: number },
    gateway: PaymentGateway
  ): Promise<boolean> {
    try {
      const result = await gateway.queryOrder(order.orderNo);
      if (result.status !== 'SUCCESS' || !result.gatewayOrderId) return false;

      await this.handlePaymentNotify({
        isValid: true,
        orderNo: order.orderNo,
        gatewayOrderId: result.gatewayOrderId,
        amount: result.amount ?? order.amount,
        paidAt: result.paidAt ?? new Date(),
      });
      this.logger.log(
        `reconcile paid order before re-issuing payment: orderNo=${order.orderNo}`
      );
      return true;
    } catch (e) {
      // 查单失败不阻断重新下单主流程，保持原有行为
      this.logger.warn(
        `reconcile paid order queryOrder failed: orderNo=${order.orderNo}`,
        e
      );
      return false;
    }
  }

  // 对账：订单被 cron 标记 TIMEOUT/CLOSED 后收到回调，向网关确认是否已支付
  private async reconcileTerminatedOrder(
    tx: any,
    order: {
      id: string;
      status: string;
      userId: string;
      amount: number;
      months: number | null;
      gateway: string;
      vipTier: { level: number; baseMonthlyPrice: number } | null;
    },
    verified: WebhookVerifyResult
  ): Promise<void> {
    try {
      const gateway = this.gatewayFactory.getGateway(order.gateway);
      const result = await gateway.queryOrder(verified.orderNo);
      // 网关非 SUCCESS 或金额不匹配：直接返回，不改变订单状态
      if (result.status !== 'SUCCESS') return;
      const gatewayAmount = result.amount ?? verified.amount;
      if (gatewayAmount !== order.amount) return;

      const { count } = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: OrderStatus.SUCCEEDED,
          gatewayPaidId: result.gatewayOrderId ?? verified.gatewayOrderId,
          paidAt: result.paidAt ?? verified.paidAt,
        },
      });
      if (count === 0) return;
      await this.activateMembershipForOrder(tx, order);
    } catch (e) {
      // 网关查询可能抛异常，异常时不阻断回调流程
      this.logger.warn(
        `gateway reconciliation failed: orderNo=${verified.orderNo}`,
        e
      );
    }
  }

  private async activateMembershipForOrder(
    tx: any,
    order: {
      userId: string;
      months: number | null;
      vipTier: { level: number; baseMonthlyPrice: number } | null;
    }
  ): Promise<void> {
    if (!order.vipTier) return;
    const durationDays = (order.months ?? 1) * MONTH_DAYS;
    await this.membershipService.activate(
      tx,
      order.userId,
      {
        level: order.vipTier.level,
        baseMonthlyPrice: order.vipTier.baseMonthlyPrice,
      },
      durationDays
    );
  }

  private buildPayResponse(
    order: {
      id: string;
      orderNo: string;
      amount: number;
      status: string;
      gateway: string;
      gatewayOrderId: string | null;
      vipTierId: string | null;
      months: number | null;
      createdAt: Date;
    },
    vipTier: { name: string; level: number },
    durationPricing: { months: number; label: string },
    gatewayResult?: CreatePaymentResult
  ) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      vipTierId: order.vipTierId,
      months: order.months,
      amount: order.amount,
      status: order.status,
      gateway: order.gateway,
      gatewayOrderId: order.gatewayOrderId,
      codeUrl: gatewayResult?.codeUrl,
      payParams: gatewayResult?.payParams,
      redirectUrl: gatewayResult?.redirectUrl,
      vipTierName: vipTier.name,
      durationLabel: durationPricing.label,
      priceYuan: order.amount / 100,
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
