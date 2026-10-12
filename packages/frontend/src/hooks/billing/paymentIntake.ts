import {
  billingControllerCreateOrder,
  billingControllerAutoCreateOrder,
  billingControllerRepayOrder,
} from '@/api-sdk';
import { detectTradeType } from './useVipOffering';

/** 支付受理入口：manual（选档购买）/ auto（EXE ?auto=1）/ repay（订单重付） */
export type PaymentSource = 'manual' | 'auto' | 'repay';

/** 支付描述符（单一事实源；原 PlanSelectOverlay/MemberCenter 的 4 份内联声明已收敛） */
export interface PaymentDescriptor {
  orderNo: string;
  amount: number;
  codeUrl: string | null;
  payParams: Record<string, unknown> | null;
  redirectUrl: string | null;
  /** auto 专有：订单展示标签（套餐名 · 时长） */
  orderLabel?: string;
}

export type PaymentIntakeOutcome =
  | { kind: 'already-paid' }
  | { kind: 'pending'; descriptor: PaymentDescriptor }
  | { kind: 'stale' };

export type OpenPaymentParams =
  | { source: 'manual'; vipTierId: string; durationPricingId: string }
  | { source: 'auto' }
  | { source: 'repay'; orderNo: string };

/**
 * openPayment — VIP 支付受理的唯一出口（3 入口 5 步协议收敛）。
 *
 * 3 个 adapter（manual/auto/repay）只差下单端点与请求体；响应后协议共享：
 * 1. SUCCEEDED 对账：回调丢失场景，复用的订单在微信侧已支付、后端已完成
 *    订单并返回终态 → already-paid（不得呈现为「创建订单失败」，也不得对
 *    已支付订单展示扫码）
 * 2. PENDING 守卫：其余状态 → stale
 * 3. 描述符提取
 *
 * 收敛前 3 个入口各自重写该协议，且 auto 入口缺 SUCCEEDED 对账与 PENDING
 * 守卫（已支付订单会以「请扫码支付」呈现给用户）。
 */
export async function openPayment(
  params: OpenPaymentParams
): Promise<PaymentIntakeOutcome> {
  const tradeType = detectTradeType();
  let res: unknown;
  if (params.source === 'manual') {
    const body: {
      vipTierId: string;
      durationPricingId: string;
      tradeType: 'JSAPI' | 'NATIVE' | 'MWEB' | 'APP';
      redirectUrl?: string;
    } = {
      vipTierId: params.vipTierId,
      durationPricingId: params.durationPricingId,
      tradeType,
    };
    if (tradeType === 'MWEB') {
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set('paymentReturn', '1');
      body.redirectUrl = returnUrl.toString();
    }
    res = await billingControllerCreateOrder({ throwOnError: true, body });
  } else if (params.source === 'auto') {
    res = await billingControllerAutoCreateOrder({
      throwOnError: true,
      body: { tradeType: 'NATIVE' },
    });
  } else {
    res = await billingControllerRepayOrder({
      throwOnError: true,
      path: { orderNo: params.orderNo },
      body: { tradeType },
    });
  }
  return settleOrderIntake(
    (res as { data?: Record<string, unknown> } | undefined)?.data,
    params.source
  );
}

/**
 * 下单后协议（3 入口共享）：SUCCEEDED 对账 → PENDING 守卫 → 描述符提取。
 */
export function settleOrderIntake(
  data: Record<string, unknown> | undefined,
  source: PaymentSource
): PaymentIntakeOutcome {
  if (data?.status === 'SUCCEEDED') {
    return { kind: 'already-paid' };
  }
  if (!data || data.status !== 'PENDING') {
    return { kind: 'stale' };
  }
  const descriptor: PaymentDescriptor = {
    orderNo: data.orderNo as string,
    amount: data.amount as number,
    codeUrl: (data.codeUrl as string | null) ?? null,
    payParams: (data.payParams as Record<string, unknown>) ?? null,
    redirectUrl: (data.redirectUrl as string | null) ?? null,
  };
  if (source === 'auto') {
    descriptor.orderLabel = `${(data.vipTierName as string | undefined) ?? ''} · ${(
      data.durationLabel as string | undefined
    ) ?? ''}`;
  }
  return { kind: 'pending', descriptor };
}
