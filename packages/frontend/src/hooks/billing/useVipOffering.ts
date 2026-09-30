import { useEffect, useState } from 'react';
import {
  vipControllerGetActiveTiers,
  vipControllerGetActiveDurations,
} from '@/api-sdk';

/** 会员套餐档位（上架中） */
export interface VipTier {
  id: string;
  level: number;
  name: string;
  baseMonthlyPrice: number;
  configs: Record<string, unknown>;
}

/** 时长定价档 */
export interface DurationPricing {
  id: string;
  months: number;
  multiplierBps: number;
  label: string;
}

/**
 * 拉取上架中套餐 + 时长定价（唯一出口）。
 *
 * SDK 默认不抛错：失败时错误在 result.error，这里显式抛出交由调用方 catch
 * 记录真实原因（此前失败静默显示"暂无可用方案"，误导用户以为未配置套餐）。
 */
export async function fetchVipOffering(signal?: AbortSignal): Promise<{
  tiers: VipTier[];
  durations: DurationPricing[];
}> {
  const [tiersRes, durRes] = await Promise.all([
    vipControllerGetActiveTiers({ signal }),
    vipControllerGetActiveDurations({ signal }),
  ]);
  if (tiersRes?.error) throw tiersRes.error;
  if (durRes?.error) throw durRes.error;
  return {
    tiers: (tiersRes?.data ?? []) as VipTier[],
    durations: (durRes?.data ?? []) as DurationPricing[],
  };
}

/**
 * 按用户代理嗅探微信下单 tradeType（唯一出口）。
 * 微信浏览器内降级为 NATIVE（展示二维码，长按识别支付）：
 * 系统暂无公众号 openid 获取流程，JSAPI 缺 openid 会下单失败。
 */
export function detectTradeType(): 'JSAPI' | 'NATIVE' | 'MWEB' | 'APP' {
  const ua = navigator.userAgent;
  if (/MicroMessenger/i.test(ua)) return 'NATIVE';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'MWEB';
  return 'NATIVE';
}

/**
 * 会员套餐数据 hook（MemberCenter 等整页消费形态：组件内无二次过滤/选择派生）。
 * 需要按会员等级过滤或派生选中态的调用方（PlanSelectOverlay）改用 fetchVipOffering。
 */
export function useVipOffering() {
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [durations, setDurations] = useState<DurationPricing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        const { tiers: t, durations: d } = await fetchVipOffering(abort.signal);
        setTiers(t);
        setDurations(d);
      } catch (error) {
        if (abort.signal.aborted) return;
        console.error('[useVipOffering] 加载会员套餐失败:', error);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, []);

  return { tiers, durations, loading };
}
