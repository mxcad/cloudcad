///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Logger } from '@nestjs/common';
import type { Prisma as PrismaType } from '@cloudcad/db';
import type { OrderStatus as DbOrderStatus } from '@cloudcad/db';
import { OrderStatus } from './enums/billing.enum';
import { MONTH_DAYS } from '../vip/membership.service';
import type { MembershipService } from '../vip/membership.service';

/**
 * PENDING 订单复用/超时窗口（2 小时）：唯一事实源。
 * createOrder 复用窗口、repayOrder 陈旧单判定、refreshOrder 超时判定、
 * billing-cron 关单 cutoff 均引用此常量，消除 2*3600000 / 7200000 魔数漂移。
 */
export const PENDING_ORDER_TTL_MS = 2 * 60 * 60 * 1000;

/** 网关支付结果（归一化形态：amount/paidAt 回落由调用方完成） */
export interface GatewayPaidOutcome {
  gatewayPaidId: string;
  amount: number;
  paidAt: Date;
}

/**
 * 网关支付结果应用到订单的结果：
 * - succeeded：订单已转 SUCCEEDED 并激活会员
 * - amount-mismatch：订单已标 FAILED（绝不激活会员）
 * - already-terminal：订单已处其他终态（或并发状态变更），未发生状态迁移
 */
export type GatewayOutcomeResult =
  | 'succeeded'
  | 'amount-mismatch'
  | 'already-terminal';

/**
 * 「网关对账」协议的唯一实现（A7）：
 * 金额比对 → 状态守卫的状态迁移 → 会员激活。
 * handlePaymentNotify / refreshOrder / reconcilePendingOrders /
 * reconcileGatewayPaidOrder 四个入口全部收敛到此，
 * 不再各自手写守卫与恢复块（资损分支集中一处，可用 fake tx 独立测试）。
 * 会员激活仍委托 MembershipService，等级数学不动（ADR-0036/0047）。
 */
export class PaymentOrder {
  private readonly logger = new Logger(PaymentOrder.name);

  constructor(private readonly membershipService: MembershipService) {}

  /**
   * 将网关支付结果应用到订单（必须在事务内调用）。
   * - 金额不符：PENDING → 标 FAILED（绝不激活）；TIMEOUT/CLOSED 不改状态
   * - PENDING → SUCCEEDED（带状态守卫的乐观更新）+ 激活
   * - TIMEOUT/CLOSED → SUCCEEDED（幂等恢复：cron 关单后回调到达）+ 激活
   * - 其他终态（SUCCEEDED/REFUNDED/FAILED）→ 'already-terminal'
   */
  async applyGatewayOutcome(
    tx: PrismaType.TransactionClient,
    order: {
      id: string;
      orderNo: string;
      // 数据层枚举（@cloudcad/db）：Prisma payload 的 status 是生成客户端的
      // 字符串字面量联合，与本地 TS 枚举仅单向兼容（本地 → DB 可赋值，反之不行）
      status: DbOrderStatus;
      amount: number;
      userId: string;
      months: number | null;
      vipTier: { level: number; baseMonthlyPrice: number } | null;
    },
    outcome: GatewayPaidOutcome
  ): Promise<GatewayOutcomeResult> {
    const mismatch = outcome.amount !== order.amount;

    if (order.status === OrderStatus.PENDING) {
      if (mismatch) {
        this.logger.warn(
          `amount mismatch, order FAILED: order=${order.amount} gateway=${outcome.amount} orderNo=${order.orderNo}`
        );
        const { count } = await tx.paymentOrder.updateMany({
          where: { id: order.id, status: OrderStatus.PENDING },
          data: {
            status: OrderStatus.FAILED,
            failedAt: new Date(),
            description: `金额不匹配: order=${order.amount} gateway=${outcome.amount}`,
          },
        });
        return count === 0 ? 'already-terminal' : 'amount-mismatch';
      }
      return this.completeOrder(tx, order, outcome);
    }

    // TIMEOUT/CLOSED：幂等恢复（cron 关单后回调到达）
    if (
      order.status === OrderStatus.TIMEOUT ||
      order.status === OrderStatus.CLOSED
    ) {
      if (mismatch) return 'already-terminal';
      return this.completeOrder(tx, order, outcome);
    }

    return 'already-terminal';
  }

  /**
   * 带状态守卫的订单完成（PENDING 或 TIMEOUT/CLOSED → SUCCEEDED）+ 会员激活。
   * count===0（并发状态变更，如 cron 恰在本事务内标记 TIMEOUT）时重读最新态：
   * 若为可恢复终态则再应用一次，避免已付款订单永久卡在 TIMEOUT（幂等恢复块）。
   */
  private async completeOrder(
    tx: PrismaType.TransactionClient,
    order: {
      id: string;
      status: DbOrderStatus;
      userId: string;
      months: number | null;
      vipTier: { level: number; baseMonthlyPrice: number } | null;
    },
    outcome: GatewayPaidOutcome
  ): Promise<GatewayOutcomeResult> {
    const { count } = await tx.paymentOrder.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: OrderStatus.SUCCEEDED,
        gatewayPaidId: outcome.gatewayPaidId,
        paidAt: outcome.paidAt,
      },
    });
    if (count > 0) {
      await this.activateMembership(tx, order);
      return 'succeeded';
    }

    const latest = await tx.paymentOrder.findUnique({
      where: { id: order.id },
      include: { vipTier: true },
    });
    if (
      latest &&
      (latest.status === OrderStatus.TIMEOUT ||
        latest.status === OrderStatus.CLOSED)
    ) {
      const { count: retryCount } = await tx.paymentOrder.updateMany({
        where: { id: latest.id, status: latest.status },
        data: {
          status: OrderStatus.SUCCEEDED,
          gatewayPaidId: outcome.gatewayPaidId,
          paidAt: outcome.paidAt,
        },
      });
      if (retryCount === 0) return 'already-terminal';
      await this.activateMembership(tx, latest);
      return 'succeeded';
    }
    return 'already-terminal';
  }

  /** 会员激活委托 MembershipService，等级数学不动（ADR-0036/0047） */
  private async activateMembership(
    tx: PrismaType.TransactionClient,
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
}
