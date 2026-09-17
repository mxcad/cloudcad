import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Crown,
  Shield,
  Check,
  CreditCard,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import type { TagVariant } from '@/components/ui/Tag';
import { Textarea } from '@/components/ui/Textarea';
import { Modal } from '@/components/ui/Modal';
import { globalShowToast } from '@/utils/notificationEvents';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePlanSelectStore } from '@/stores/planSelectStore';
import { useMembership } from '@/hooks/useMembership';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { useAuth } from '@/contexts/AuthContext';
import { MEMBERSHIP_ENABLED } from '@/constants/appConfig';
import { Z_LAYERS } from '@/constants/layers';
import { formatFileSize } from '@/utils/fileUtils';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import {
  vipControllerGetActiveTiers,
  vipControllerGetActiveDurations,
  billingControllerGetOrders,
  billingControllerRepayOrder,
  billingControllerApplyRefund,
  billingControllerAutoCreateOrder,
} from '@/api-sdk';
import WechatPayModal from '@/components/billing/WechatPayModal';
import { useTierConfigRegistry } from '@/hooks/useTierConfigRegistry';
import { formatConfigValue, getConfigLabel } from '@/utils/tierConfigUtils';
import { queryKeys } from '@/lib/queryKeys';
import { centsToYuan } from '@/utils/priceUtils';
import {
  BENEFIT_ITEMS,
  FAQ_ITEMS,
  buildConversionBenefitItem,
  buildConversionFaq,
} from './memberCenterContent';

interface VipTier {
  id: string;
  level: number;
  name: string;
  baseMonthlyPrice: number;
  configs: Record<string, unknown>;
}

interface DurationPricing {
  id: string;
  months: number;
  multiplierBps: number;
  label: string;
}

interface OrderItem {
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  gateway: string;
  createdAt: string;
  paidAt?: string;
  description?: string;
  refundApplications?: Array<{
    id: string;
    status: string;
    reason: string;
    createdAt: string;
    reviewNote?: string | null;
    reviewedAt?: string | null;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: t('待支付'),
  SUCCEEDED: t('已完成'),
  FAILED: t('支付失败'),
  REFUNDED: t('已退款'),
  CLOSED: t('已取消'),
  TIMEOUT: t('超时关闭'),
};

const STATUS_COLORS: Record<string, TagVariant> = {
  PENDING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'error',
  REFUNDED: 'neutral',
  CLOSED: 'neutral',
  TIMEOUT: 'neutral',
};

export default function MemberCenter() {
  const membership = useMembership();
  const { loading: authLoading, refreshUser } = useAuth();
  const { data: storageInfo } = useStorageQuota();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const globalOpen = usePlanSelectStore((s) => s.open);

  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [durations, setDurations] = useState<DurationPricing[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { registry } = useTierConfigRegistry();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [selectedTierIdx, setSelectedTierIdx] = useState(0);
  const [repayPayment, setRepayPayment] = useState<{
    orderNo: string;
    amount: number;
    codeUrl: string | null;
    payParams: Record<string, unknown> | null;
    redirectUrl: string | null;
  } | null>(null);
  const [repayLoading, setRepayLoading] = useState(false);
  const [repayError, setRepayError] = useState('');
  const [refundTarget, setRefundTarget] = useState<OrderItem | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState('');
  // ADR-0066：?auto=1 自动下单的支付弹窗状态
  const [autoPayment, setAutoPayment] = useState<{
    orderNo: string;
    amount: number;
    codeUrl: string | null;
    payParams: Record<string, unknown> | null;
    redirectUrl: string | null;
    orderLabel: string;
  } | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState('');

  useDocumentTitle(t('会员中心'));

  const isVip = membership?.isVip ?? false;

  const paidTiers = useMemo(() => tiers.filter((t) => t.level > 0), [tiers]);

  const currentTierLevel = membership?.tierLevel ?? 0;

  // ADR-0043：转换频率窗口值 —— 当前等级配置优先，缺键回落 registry 默认值（与后端回落语义一致）
  const currentTierConfigs = useMemo(
    () => tiers.find((t) => t.level === currentTierLevel)?.configs ?? {},
    [tiers, currentTierLevel]
  );
  const getEffectiveConfig = useCallback(
    (key: string): number => {
      const fromTier = Number(currentTierConfigs[key]) || 0;
      if (fromTier > 0) return fromTier;
      const registryEntry = registry.get(key);
      return Number(registryEntry?.defaultValue) || 0;
    },
    [currentTierConfigs, registry]
  );
  const conversionWindowHours =
    getEffectiveConfig('quota.conversion_window_hours') || 2;
  const conversionWindowCount =
    getEffectiveConfig('quota.conversion_window_count') || 0;

  const benefitItems = useMemo(
    () => [
      ...BENEFIT_ITEMS,
      buildConversionBenefitItem(
        conversionWindowHours,
        conversionWindowCount,
        isVip
      ),
    ],
    [conversionWindowHours, conversionWindowCount, isVip]
  );

  const faqItems = useMemo(() => {
    const items = [...FAQ_ITEMS];
    if (conversionWindowCount > 0) {
      items.splice(
        items.length - 1,
        0,
        buildConversionFaq(conversionWindowHours, conversionWindowCount, isVip)
      );
    }
    return items;
  }, [conversionWindowHours, conversionWindowCount, isVip]);

  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        const [tiersRes, durRes] = await Promise.all([
          vipControllerGetActiveTiers({ signal: abort.signal }),
          vipControllerGetActiveDurations({ signal: abort.signal }),
        ]);
        // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
        // （此前失败静默显示"暂无可用方案"，误导用户以为未配置套餐）
        if (tiersRes?.error) throw tiersRes.error;
        if (durRes?.error) throw durRes.error;
        setTiers((tiersRes?.data ?? []) as VipTier[]);
        setDurations((durRes?.data ?? []) as DurationPricing[]);
      } catch (error) {
        console.error('[MemberCenter] 加载会员套餐失败:', error);
      }
      setLoading(false);
    })();
    return () => abort.abort();
  }, []);

  // 拉取最近订单（订单历史 + 支付成功后刷新）
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await billingControllerGetOrders();
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
      if (res?.error) throw res.error;
      const data = res?.data as { items?: OrderItem[] } | undefined;
      setOrders(data?.items?.slice(0, 5) ?? []);
    } catch (error) {
      console.error('[MemberCenter] 加载订单失败:', error);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // ADR-0066：EXE 桌面端 ?auto=1 自动下单 —— 挂载时若带 auto=1，
  // 自动创建最低付费档 1 个月订单并弹出微信支付二维码
  useEffect(() => {
    if (searchParams.get('auto') !== '1') return;
    // 清掉 auto 参数，避免刷新/回退重复触发（走 setSearchParams 同步 React Router 状态）
    const next = new URLSearchParams(searchParams);
    next.delete('auto');
    setSearchParams(next, { replace: true });
    let cancelled = false;
    (async () => {
      setAutoLoading(true);
      setAutoError('');
      try {
        const res = await billingControllerAutoCreateOrder({
          body: { tradeType: 'NATIVE' },
        });
        // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
        if (res?.error) throw res.error;
        if (cancelled) return;
        const data = res?.data as
          | {
              orderNo: string;
              amount: number;
              codeUrl: string | null;
              payParams: Record<string, unknown> | null;
              redirectUrl: string | null;
              vipTierName?: string;
              durationLabel?: string;
            }
          | undefined;
        setAutoPayment({
          orderNo: data?.orderNo ?? '',
          amount: data?.amount ?? 0,
          codeUrl: data?.codeUrl ?? null,
          payParams: data?.payParams ?? null,
          redirectUrl: data?.redirectUrl ?? null,
          orderLabel: `${data?.vipTierName ?? ''} · ${data?.durationLabel ?? ''}`,
        });
      } catch (error) {
        if (cancelled) return;
        setAutoError(getErrorMessage(error) || t('创建订单失败，请重试'));
      } finally {
        if (!cancelled) setAutoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅挂载时执行一次（auto 参数已在 effect 内清除）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpgrade = useCallback(
    (tierLevel?: number) => {
      globalOpen(undefined, tierLevel);
    },
    [globalOpen]
  );

  const handleRepay = useCallback(async (orderNo: string) => {
    setRepayLoading(true);
    setRepayError('');
    try {
      const ua = navigator.userAgent;
      // 微信浏览器内降级为 NATIVE（展示二维码，长按识别支付），系统暂无公众号 openid 获取流程，JSAPI 缺 openid 会下单失败
      const tradeType: 'JSAPI' | 'NATIVE' | 'MWEB' | 'APP' =
        /MicroMessenger/i.test(ua)
          ? 'NATIVE'
          : /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
            ? 'MWEB'
            : 'NATIVE';
      const res = await billingControllerRepayOrder({
        path: { orderNo },
        body: { tradeType },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
      // 否则下单失败被误判为"订单状态已变更"（历史 bug）
      if (res?.error) throw res.error;
      const data = res?.data as Record<string, unknown> | undefined;
      if (data?.status === 'SUCCEEDED') {
        // 对账兜底：后端确认微信侧已支付并完成订单（回调丢失场景），
        // 提示已开通并刷新会员状态/订单列表，而非误导性的"状态已变更"
        globalShowToast(t('该订单已支付成功，会员已开通'), 'success');
        try {
          await refreshUser();
          await queryClient.invalidateQueries({
            queryKey: queryKeys.fileSystem.storageQuota,
          });
        } catch {
          // 刷新失败不阻断提示，页面可手动刷新兜底
        }
        await loadOrders();
        return;
      }
      if (!data || data.status !== 'PENDING') {
        setRepayError(t('订单状态已变更，无法继续支付'));
        globalShowToast(t('订单状态已变更，无法继续支付'), 'error');
        return;
      }
      setRepayPayment({
        orderNo: data.orderNo as string,
        amount: data.amount as number,
        codeUrl: (data.codeUrl as string | null) ?? null,
        payParams: (data.payParams as Record<string, unknown>) ?? null,
        redirectUrl: (data.redirectUrl as string | null) ?? null,
      });
    } catch (error) {
      // 透传后端真实原因（网关/风控等），不再固定"获取支付参数失败"
      const msg = getErrorMessage(error) || t('获取支付参数失败，请重试');
      setRepayError(msg);
      globalShowToast(msg, 'error');
    } finally {
      setRepayLoading(false);
    }
  }, [refreshUser, queryClient, loadOrders]);

  const handleApplyRefund = useCallback(async () => {
    if (!refundTarget) return;
    if (!refundReason.trim()) {
      setRefundError(t('请填写退款原因'));
      return;
    }
    setRefundSubmitting(true);
    setRefundError('');
    try {
      const res = await billingControllerApplyRefund({
        path: { orderNo: refundTarget.orderNo },
        body: { reason: refundReason.trim() },
      });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出（sdk-mutation-error-gotcha）
      if (res?.error) throw res.error;
      globalShowToast(t('退款申请已提交，请等待审核'), 'success');
      setRefundTarget(null);
      setRefundReason('');
      await loadOrders();
    } catch (error) {
      // 透传后端真实原因（已有待审核申请/状态不允许等）
      setRefundError(getErrorMessage(error) || t('退款申请提交失败，请重试'));
    } finally {
      setRefundSubmitting(false);
    }
  }, [refundTarget, refundReason, loadOrders]);

  const tierForPrice = paidTiers[selectedTierIdx] ?? paidTiers[0] ?? null;

  const getQuotaValue = useCallback((tier: VipTier, key: string): string => {
    const cfg = tier.configs as Record<string, unknown>;
    return formatConfigValue(key, cfg[key]);
  }, []);

  if (!MEMBERSHIP_ENABLED) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <Card variant="outlined" padding="lg" radius="2xl">
          <div
            className="text-center py-12"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Crown size={48} className="mx-auto mb-4" />
            <p className="text-base">{t('会员功能暂未开放')}</p>
          </div>
        </Card>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex justify-center py-24">
          <div
            className="w-8 h-8 rounded-full animate-spin"
            style={{
              border: '2px solid var(--border-default)',
              borderTopColor: 'var(--primary-500)',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-10">
        {/* ── 0. 当前会员状态 ── */}
        {membership && (
          <section>
            <Card
              variant={membership.isVip ? 'elevated' : 'outlined'}
              padding="md"
              radius="xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="p-2.5 rounded-xl"
                    style={{
                      background: membership.isVip
                        ? 'linear-gradient(135deg, var(--primary-400), var(--accent-400))'
                        : 'var(--bg-tertiary)',
                    }}
                  >
                    <Crown
                      size={24}
                      style={
                        membership.isVip
                          ? { color: 'var(--text-inverse)' }
                          : { color: 'var(--text-muted)' }
                      }
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-lg font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {membership.isVip
                          ? t('VIP{level}', {
                              level: String(membership.tierLevel),
                            })
                          : t('免费用户')}
                      </span>
                      {membership.isVip && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{
                            background: 'var(--primary-100)',
                            color: 'var(--primary-700)',
                          }}
                        >
                          {(() => {
                            // 永久会员 daysRemaining 为 Infinity，直接展示"永久有效"，跳过剩余天数计算
                            if (!Number.isFinite(membership.daysRemaining))
                              return t('永久有效');
                            const m = Math.floor(membership.daysRemaining / 30);
                            const d = membership.daysRemaining % 30;
                            if (m > 0 && d > 0)
                              return t('剩余 {months} 个月 {days} 天', {
                                months: String(m),
                                days: String(d),
                              });
                            if (m > 0)
                              return t('剩余 {months} 个月', {
                                months: String(m),
                              });
                            return t('剩余 {days} 天', {
                              days: String(membership.daysRemaining),
                            });
                          })()}
                        </span>
                      )}
                    </div>
                    {membership.isVip && membership.expiresAt && (
                      <p
                        className="text-xs mt-1"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {t('有效期至 {date}', {
                          date: new Date(
                            membership.expiresAt
                          ).toLocaleDateString('zh-CN'),
                        })}
                      </p>
                    )}
                  </div>
                </div>
                {membership.isVip && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpgrade()}
                    >
                      {t('续费')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleUpgrade()}
                    >
                      {t('升级')}
                    </Button>
                  </div>
                )}
              </div>
              {membership.isVip &&
                membership.daysRemaining > 0 &&
                membership.daysRemaining <= 7 && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-lg mt-3 text-xs"
                    style={{
                      background: 'var(--warning-light)',
                      border:
                        '1px solid color-mix(in srgb, var(--warning) 25%, transparent)',
                    }}
                  >
                    <AlertTriangle
                      size={14}
                      className="flex-shrink-0"
                      style={{ color: 'var(--warning)' }}
                    />
                    <span style={{ color: 'var(--text-primary)' }}>
                      {t('即将到期，请及时续费')}
                    </span>
                  </div>
                )}
            </Card>
          </section>
        )}

        {/* ── 1. 方案对比 ── */}
        <section>
          <h3
            className="text-base font-semibold mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Crown size={16} style={{ color: 'var(--primary-500)' }} />
            {t('方案对比')}
          </h3>
          {loading ? (
            <div className="flex justify-center py-12">
              <div
                className="w-8 h-8 rounded-full animate-spin"
                style={{
                  border: '2px solid var(--border-default)',
                  borderTopColor: 'var(--primary-500)',
                }}
              />
            </div>
          ) : tiers.length === 0 ? (
            <Card variant="filled" padding="lg" radius="xl">
              <p
                className="text-sm text-center"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {t('暂无可用方案')}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {tiers.map((tier) => {
                const isCurrent = isVip && membership?.tierLevel === tier.level;
                const priceYuan = tier.baseMonthlyPrice / 100;
                return (
                  <Card
                    key={tier.id}
                    variant={isCurrent ? 'elevated' : 'outlined'}
                    padding="md"
                    radius="xl"
                    className="relative flex flex-col"
                  >
                    {isCurrent && (
                      <span
                        className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap z-10"
                        style={{
                          background: 'var(--primary-500)',
                          color: 'var(--text-inverse)',
                        }}
                      >
                        {t('当前方案')}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                          background: 'var(--primary-500)',
                          color: 'var(--text-inverse)',
                        }}
                      >
                        <Crown size={16} />
                      </div>
                      <span
                        className="text-base font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {tier.name}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-4">
                      {tier.level > 0 && (
                        <span
                          className="text-sm"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          ¥
                        </span>
                      )}
                      <span
                        className="text-2xl font-extrabold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {tier.level === 0 ? t('免费') : priceYuan.toFixed(0)}
                      </span>
                      {tier.level > 0 && (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {t('/月')}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 space-y-2 mb-5">
                      {benefitItems.map(
                        ({ key, icon: Icon, color, title: fallbackTitle }) => {
                          const val = getQuotaValue(tier, key);
                          const label =
                            getConfigLabel(registry, key) || t(fallbackTitle);
                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 text-xs"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <Icon size={12} style={{ color }} />
                              <span className="flex-1 min-w-0">
                                <span style={{ color: 'var(--text-tertiary)' }}>
                                  {label}{' '}
                                </span>
                                <span className="font-medium">{val}</span>
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                    <Button
                      variant={
                        isCurrent
                          ? 'outline'
                          : tier.level > 0
                            ? 'primary'
                            : 'secondary'
                      }
                      size="sm"
                      onClick={() => handleUpgrade(tier.level)}
                      disabled={isCurrent}
                      className="w-full"
                    >
                      {isCurrent
                        ? t('当前方案')
                        : tier.level === 0
                          ? t('当前方案')
                          : isVip
                            ? t('升级')
                            : t('开通')}
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 2. 权益明细 ── */}
        <section>
          <h3
            className="text-base font-semibold mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <Shield size={16} style={{ color: 'var(--primary-500)' }} />
            {t('权益明细')}
          </h3>
          {loading ? (
            <div className="flex justify-center py-8">
              <div
                className="w-8 h-8 rounded-full animate-spin"
                style={{
                  border: '2px solid var(--border-default)',
                  borderTopColor: 'var(--primary-500)',
                }}
              />
            </div>
          ) : tiers.length === 0 ? (
            <Card variant="filled" padding="lg" radius="xl">
              <p
                className="text-sm text-center"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {t('暂无权益信息')}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {benefitItems.map(
                ({
                  key,
                  icon: Icon,
                  color,
                  title: fallbackTitle,
                  boundaryText,
                  example,
                }) => {
                  const currentCfg = tiers.find(
                    (t) => t.level === currentTierLevel
                  )?.configs as Record<string, unknown> | undefined;
                  const currentVal = currentCfg?.[key];
                  const hasStorageGauge =
                    key === 'quota.personal_storage_mb' && storageInfo;
                  const label =
                    getConfigLabel(registry, key) || t(fallbackTitle);

                  return (
                    <Card key={key} variant="outlined" padding="md" radius="xl">
                      <div className="flex items-start gap-4">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: `${color}15` }}
                        >
                          <Icon size={24} style={{ color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="text-base font-bold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {label}
                            </span>
                            {currentVal !== undefined && (
                              <Tag variant="primary" size="sm">
                                {t('当前: {val}', {
                                  val: formatConfigValue(key, currentVal),
                                })}
                              </Tag>
                            )}
                          </div>

                          {/* 存储空间进度条 */}
                          {hasStorageGauge && (
                            <div className="mb-3">
                              <div
                                className="flex items-center justify-between text-xs mb-1"
                                style={{ color: 'var(--text-tertiary)' }}
                              >
                                <span>
                                  {t('已用 {used}', {
                                    used: formatFileSize(storageInfo!.used),
                                  })}
                                </span>
                                <span>
                                  {t('总计 {total}', {
                                    total: formatFileSize(storageInfo!.total),
                                  })}
                                </span>
                              </div>
                              <div
                                className="h-2 rounded-full overflow-hidden"
                                style={{ background: 'var(--bg-tertiary)' }}
                              >
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(storageInfo!.usagePercent ?? 0, 100)}%`,
                                    background:
                                      (storageInfo!.usagePercent ?? 0) > 90
                                        ? 'var(--error)'
                                        : (storageInfo!.usagePercent ?? 0) > 70
                                          ? 'var(--warning)'
                                          : color,
                                  }}
                                />
                              </div>
                              <div
                                className="text-xs mt-1"
                                style={{ color: 'var(--text-tertiary)' }}
                              >
                                {t('使用率 {pct}%', {
                                  pct: String(
                                    (storageInfo!.usagePercent ?? 0).toFixed(1)
                                  ),
                                })}
                              </div>
                            </div>
                          )}

                          {/* 各 tier 配额对比 */}
                          <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3">
                            {tiers.map((tier) => {
                              const val = getQuotaValue(tier, key);
                              const isCurrentTier =
                                tier.level === currentTierLevel;
                              return (
                                <span
                                  key={tier.level}
                                  className="text-xs flex items-center gap-1"
                                  style={{
                                    color: isCurrentTier
                                      ? 'var(--primary-500)'
                                      : 'var(--text-muted)',
                                  }}
                                >
                                  {tier.level === 0
                                    ? t('免费')
                                    : `VIP${tier.level}`}
                                  <span className="font-semibold">{val}</span>
                                  {isCurrentTier && <Check size={10} />}
                                </span>
                              );
                            })}
                          </div>

                          {/* 超出后 */}
                          <div
                            className="flex items-start gap-2 p-3 rounded-lg mb-2 text-xs"
                            style={{ background: 'var(--bg-tertiary)' }}
                          >
                            <AlertTriangle
                              size={14}
                              className="flex-shrink-0 mt-0.5"
                              style={{ color: 'var(--warning)' }}
                            />
                            <div>
                              <span
                                className="font-semibold"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {t('超出后：')}
                              </span>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {t(boundaryText)}
                              </span>
                            </div>
                          </div>

                          {/* 举例 */}
                          <div
                            className="flex items-start gap-2 text-xs"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            <span
                              className="font-medium flex-shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              💡 {t('举例：')}
                            </span>
                            <span>{t(example)}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                }
              )}
            </div>
          )}
        </section>

        {/* ── 3. 常见问题 ── */}
        <section>
          <h3
            className="text-base font-semibold mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <HelpCircle size={16} style={{ color: 'var(--primary-500)' }} />
            {t('常见问题')}
          </h3>
          <Card variant="outlined" padding="none" radius="xl">
            {faqItems.map((item, idx) => {
              const open = expandedFaq === idx;
              return (
                <div
                  key={idx}
                  className="border-b last:border-b-0"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  <button
                    onClick={() => setExpandedFaq(open ? null : idx)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
                  >
                    <span
                      className="text-sm font-medium flex-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {t(item.q)}
                    </span>
                    {open ? (
                      <ChevronUp
                        size={16}
                        className="flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      />
                    ) : (
                      <ChevronDown
                        size={16}
                        className="flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      />
                    )}
                  </button>
                  {open && (
                    <div className="px-5 pb-4">
                      <div
                        className="p-3 rounded-lg text-sm"
                        style={{
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {t(item.a)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </section>

        {/* ── 4. 订单历史 ── */}
        <section>
          <h3
            className="text-base font-semibold mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <CreditCard size={16} style={{ color: 'var(--primary-500)' }} />
            {t('订单历史')}
          </h3>
          <Card variant="outlined" padding="none" radius="xl">
            {ordersLoading ? (
              <div className="flex justify-center py-12">
                <div
                  className="w-8 h-8 rounded-full animate-spin"
                  style={{
                    border: '2px solid var(--border-default)',
                    borderTopColor: 'var(--primary-500)',
                  }}
                />
              </div>
            ) : orders.length === 0 ? (
              <div
                className="py-12 text-center"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <CreditCard size={32} className="mx-auto mb-2" />
                <p className="text-sm">{t('暂无订单记录')}</p>
              </div>
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: 'var(--border-default)' }}
              >
                {orders.map((order) => {
                  const isPending = order.status === 'PENDING';
                  // 最近一条退款申请：PENDING 时展示"审核中"并禁用再次申请；REJECTED 后允许重新申请并展示驳回意见
                  const latestApplication =
                    order.refundApplications?.[0] ?? null;
                  const refundPending = latestApplication?.status === 'PENDING';
                  const refundRejected =
                    latestApplication?.status === 'REJECTED';
                  const canApplyRefund =
                    order.status === 'SUCCEEDED' && !refundPending;
                  const statusLabel = refundPending
                    ? t('退款审核中')
                    : refundRejected
                      ? t('退款已驳回')
                      : STATUS_LABELS[order.status] || order.status;
                  const statusVariant: TagVariant = refundPending
                    ? 'warning'
                    : refundRejected
                      ? 'error'
                      : STATUS_COLORS[order.status] || 'neutral';
                  return (
                    <div
                      key={order.id}
                      className={`flex items-center justify-between p-4 sm:px-6 ${isPending ? 'cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors' : ''}`}
                      onClick={
                        isPending ? () => handleRepay(order.orderNo) : undefined
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {order.description || order.orderNo}
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {new Date(order.createdAt).toLocaleDateString(
                            'zh-CN'
                          )}
                          <span className="ml-2 font-mono">
                            {order.orderNo}
                          </span>
                        </p>
                        {refundRejected && latestApplication?.reviewNote && (
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {t('驳回原因：{note}', {
                              note: latestApplication.reviewNote,
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          ¥{centsToYuan(order.amount)}
                        </span>
                        <Tag variant={statusVariant} size="sm">
                          {statusLabel}
                        </Tag>
                        {canApplyRefund && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRefundTarget(order);
                              setRefundReason('');
                              setRefundError('');
                            }}
                          >
                            {t('申请退款')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* ── 5. 继续支付弹窗 ── */}
      {repayLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: Z_LAYERS.MODAL,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 48 }}
          >
            <div
              className="w-8 h-8 rounded-full animate-spin"
              style={{
                border: '2px solid var(--border-default)',
                borderTopColor: 'var(--primary-500)',
              }}
            />
          </div>
        </div>
      )}
      <WechatPayModal
        open={!!repayPayment && !repayLoading}
        orderNo={repayPayment?.orderNo ?? ''}
        amount={repayPayment?.amount ?? 0}
        payParams={repayPayment?.payParams ?? null}
        codeUrl={repayPayment?.codeUrl ?? null}
        redirectUrl={repayPayment?.redirectUrl ?? null}
        onSuccess={async () => {
          setRepayPayment(null);
          setRepayError('');
          // 支付成功后刷新会员状态 + 订单列表，避免整页刷新才更新
          try {
            await refreshUser();
            await queryClient.invalidateQueries({
              queryKey: queryKeys.fileSystem.storageQuota,
            });
          } catch {
            // 刷新失败不阻塞后续
          }
          loadOrders();
        }}
        onError={(msg) => setRepayError(msg)}
        onClose={() => {
          setRepayPayment(null);
          setRepayError('');
        }}
      />

      {/* ── 5b. ?auto=1 自动下单：加载遮罩 + 错误提示 + 支付弹窗 ── */}
      {autoLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: Z_LAYERS.MODAL,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 48 }}
          >
            <div
              className="w-8 h-8 rounded-full animate-spin"
              style={{
                border: '2px solid var(--border-default)',
                borderTopColor: 'var(--primary-500)',
              }}
            />
          </div>
        </div>
      )}
      {autoError && !autoLoading && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: Z_LAYERS.MODAL,
            padding: '8px 16px',
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            color: 'var(--danger-500)',
          }}
        >
          {autoError}
        </div>
      )}
      <WechatPayModal
        open={!!autoPayment && !autoLoading}
        orderNo={autoPayment?.orderNo ?? ''}
        amount={autoPayment?.amount ?? 0}
        payParams={autoPayment?.payParams ?? null}
        codeUrl={autoPayment?.codeUrl ?? null}
        redirectUrl={autoPayment?.redirectUrl ?? null}
        orderLabel={autoPayment?.orderLabel}
        onSuccess={async () => {
          setAutoPayment(null);
          setAutoError('');
          // 支付成功后刷新会员状态 + 订单列表，避免整页刷新才更新
          try {
            await refreshUser();
            await queryClient.invalidateQueries({
              queryKey: queryKeys.fileSystem.storageQuota,
            });
          } catch {
            // 刷新失败不阻塞后续
          }
          loadOrders();
        }}
        onError={(msg) => setAutoError(msg)}
        onClose={() => {
          setAutoPayment(null);
          setAutoError('');
        }}
      />

      {/* ── 6. 申请退款弹窗 ── */}
      <Modal
        isOpen={!!refundTarget}
        onClose={() => !refundSubmitting && setRefundTarget(null)}
        title={t('申请退款')}
        size="sm"
      >
        <div className="space-y-4">
          {refundTarget && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('订单 {orderNo}，退款金额 {amount}', {
                orderNo: refundTarget.orderNo,
                amount: `¥${centsToYuan(refundTarget.amount)}`,
              })}
            </p>
          )}
          {refundTarget?.refundApplications?.[0]?.status === 'REJECTED' && (
            <p
              className="text-xs rounded-lg p-2"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
              }}
            >
              {t('上次退款申请被驳回：{note}', {
                note: refundTarget.refundApplications[0].reviewNote ?? '',
              })}
            </p>
          )}
          <Textarea
            placeholder={t('请填写退款原因（必填）')}
            value={refundReason}
            maxLength={500}
            rows={4}
            onChange={(e) => setRefundReason(e.target.value)}
          />
          {refundError && (
            <p className="text-xs" style={{ color: 'var(--danger-500)' }}>
              {refundError}
            </p>
          )}
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {t('提交后需管理员审核，审核结果将通过邮件通知')}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRefundTarget(null)}
              disabled={refundSubmitting}
            >
              {t('取消')}
            </Button>
            <Button
              variant="danger"
              onClick={handleApplyRefund}
              loading={refundSubmitting}
            >
              {t('提交申请')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
