import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Crown, X, Minus, Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { usePlanSelectStore } from '@/stores/planSelectStore';
import {
  vipControllerGetActiveTiers,
  vipControllerGetActiveDurations,
  billingControllerCreateOrder,
} from '@/api-sdk';
import { Z_LAYERS } from '@/constants/layers';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { useMembership } from '@/hooks/useMembership';
import { useAuth } from '@/contexts/AuthContext';
import { useTierConfigRegistry } from '@/hooks/useTierConfigRegistry';
import { queryKeys } from '@/lib/queryKeys';
import {
  formatConfigValueShort,
  getConfigLabel,
} from '@/utils/tierConfigUtils';
import {
  formatYuan,
  centsToYuan,
  calculatePriceInCents,
  calculateOriginalPriceInCents,
} from '@/utils/priceUtils';
import WechatPayButton from './WechatPayButton';

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

interface OrderResult {
  orderNo: string;
  payParams: Record<string, any> | null;
  codeUrl: string | null;
  redirectUrl: string | null;
  amount: number;
}

function discountText(bps: number): string {
  if (bps >= 10000) return '';
  const map: Record<number, string> = {
    9000: t('九折'),
    8000: t('八折'),
    7000: t('七折'),
    6000: t('六折'),
    5000: t('五折'),
  };
  return map[bps] ?? t('{pct}折', { pct: String(Math.round(bps / 100)) });
}

const QUOTA_GUIDE_CONTENT: Record<
  string,
  { title: string; description: string }
> = {
  'quota.max_projects': {
    title: t('项目数量已达上限'),
    description: t('升级会员可创建和恢复更多项目'),
  },
  'quota.personal_storage_mb': {
    title: t('个人存储空间已满'),
    description: t('升级会员可扩展存储空间'),
  },
  'quota.project_size_mb': {
    title: t('项目体积超出限额'),
    description: t('升级会员可上传更大的项目'),
  },
  'quota.conversion_window_count': {
    title: t('图纸转换过于频繁'),
    description: t('升级会员可获取更高的转换频率上限'),
  },
  export_download: {
    title: t('导出下载为会员专属功能'),
    description: t('开通 VIP 后可将图纸导出为 PDF / DWG / DXF 下载'),
  },
};

type ViewState = 'selection' | 'payment';

export default function PlanSelectOverlay() {
  const { isOpen, close, purchasing, setPurchasing, setPaymentOrder } =
    usePlanSelectStore();
  const reason = usePlanSelectStore((s) => s.reason);
  const initialTierLevel = usePlanSelectStore((s) => s.initialTierLevel);
  const membership = useMembership();
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const { registry } = useTierConfigRegistry();
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [durations, setDurations] = useState<DurationPricing[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [months, setMonths] = useState(1);
  const [view, setView] = useState<ViewState>('selection');
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [orderError, setOrderError] = useState('');

  const selectedTier = useMemo(
    () => tiers.find((t) => t.id === selectedTierId) ?? null,
    [tiers, selectedTierId]
  );

  const matchedDuration = useMemo(() => {
    const exact = durations.find((d) => d.months === months);
    if (exact) return exact;
    if (durations.length === 0) return null;
    return durations.reduce((prev, curr) =>
      Math.abs(curr.months - months) < Math.abs(prev.months - months)
        ? curr
        : prev
    );
  }, [durations, months]);

  useEffect(() => {
    if (!matchedDuration) return;
    if (matchedDuration.months !== months) setMonths(matchedDuration.months);
  }, [matchedDuration, months]);

  const priceInYuan = useMemo(() => {
    if (!selectedTier || !matchedDuration) return 0;
    // 与后端 billing.service 保持一致：先 round 到分再转元
    return (
      calculatePriceInCents(
        selectedTier.baseMonthlyPrice,
        matchedDuration.multiplierBps,
        matchedDuration.months
      ) / 100
    );
  }, [selectedTier, matchedDuration]);

  const originalPrice = useMemo(() => {
    if (!selectedTier || !matchedDuration) return 0;
    return (
      calculateOriginalPriceInCents(
        selectedTier.baseMonthlyPrice,
        matchedDuration.months
      ) / 100
    );
  }, [selectedTier, matchedDuration]);

  const saving = originalPrice - priceInYuan;
  const hasSaving =
    matchedDuration && matchedDuration.multiplierBps < 10000 && saving > 0;

  const configEntries = useMemo(() => {
    if (!selectedTier?.configs) return [];
    return Object.entries(
      selectedTier.configs as Record<string, unknown>
    ).slice(0, 6);
  }, [selectedTier]);

  const features = useMemo(() => {
    return configEntries.map(([k, v]) => {
      const label = getConfigLabel(registry, k);
      const val = formatConfigValueShort(k, v);
      return `${label}: ${val}`;
    });
  }, [configEntries, registry]);

  useEffect(() => {
    if (!isOpen) {
      setView('selection');
      setOrderResult(null);
      setOrderError('');
      setMonths(1);
      return;
    }
    setLoading(true);
    setSelectedTierId(null);
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
        const currentLevel = membership?.tierLevel ?? 0;
        const isVip = membership?.isVip ?? false;
        const tiersData = ((tiersRes?.data ?? []) as VipTier[])
          .filter((t) => t.level > 0)
          .filter((t) => !isVip || t.level >= currentLevel);
        const durData = (durRes?.data ?? []) as DurationPricing[];
        setTiers(tiersData);
        setDurations(durData);
        if (tiersData.length > 0) {
          const initial =
            initialTierLevel != null
              ? tiersData.find((t) => t.level === initialTierLevel)
              : undefined;
          setSelectedTierId((initial ?? tiersData[0]!).id);
        }
      } catch (error) {
        console.error('[PlanSelectOverlay] 加载套餐失败:', error);
        setOrderError(t('加载套餐失败，请重试'));
      } finally {
        setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [isOpen, membership?.isVip, membership?.tierLevel, initialTierLevel]);

  const detectTradeType = useCallback(():
    'JSAPI' | 'NATIVE' | 'MWEB' | 'APP' => {
    const ua = navigator.userAgent;
    // 微信浏览器内降级为 NATIVE（展示二维码，长按识别支付），系统暂无公众号 openid 获取流程，JSAPI 缺 openid 会下单失败
    if (/MicroMessenger/i.test(ua)) return 'NATIVE';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'MWEB';
    return 'NATIVE';
  }, []);

  const handleBuy = useCallback(async () => {
    if (!selectedTier || !matchedDuration) return;
    setPurchasing(true);
    setOrderError('');
    try {
      const tradeType = detectTradeType();
      const body: {
        vipTierId: string;
        durationPricingId: string;
        tradeType: 'JSAPI' | 'NATIVE' | 'MWEB' | 'APP';
        redirectUrl?: string;
      } = {
        vipTierId: selectedTier.id,
        durationPricingId: matchedDuration.id,
        tradeType,
      };
      if (tradeType === 'MWEB') {
        const returnUrl = new URL(window.location.href);
        returnUrl.searchParams.set('paymentReturn', '1');
        body.redirectUrl = returnUrl.toString();
      }
      const res = await billingControllerCreateOrder({ body });
      // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
      // 否则下单失败被误判为"创建订单失败"固定文案（历史 bug）
      if (res?.error) throw res.error;
      const orderData = res?.data as Record<string, unknown> | undefined;
      if (orderData?.status === 'SUCCEEDED') {
        // 对账兜底：复用的 PENDING 单在微信侧已支付（回调丢失）时后端直接
        // 完成订单并返回终态，刷新会员并关闭弹窗（与支付成功链路同效）
        try {
          await refreshUser();
          await queryClient.invalidateQueries({
            queryKey: queryKeys.fileSystem.storageQuota,
          });
        } catch {
          // 刷新失败不阻断关闭，页面可手动刷新兜底
        }
        close();
        return;
      }
      if (!orderData || orderData.status !== 'PENDING') {
        setOrderError(t('创建订单失败'));
        setPurchasing(false);
        return;
      }
      const result: OrderResult = {
        orderNo: orderData.orderNo as string,
        payParams: (orderData.payParams as Record<string, unknown>) ?? null,
        codeUrl: (orderData.codeUrl as string) ?? null,
        redirectUrl: (orderData.redirectUrl as string) ?? null,
        amount: orderData.amount as number,
      };
      setOrderResult(result);
      setPaymentOrder(result);
      setView('payment');
    } catch (error) {
      setOrderError(getErrorMessage(error) || t('创建订单失败，请重试'));
    } finally {
      setPurchasing(false);
    }
  }, [
    selectedTier,
    matchedDuration,
    detectTradeType,
    setPurchasing,
    setPaymentOrder,
    refreshUser,
    queryClient,
    close,
  ]);

  // 支付成功后刷新 AuthContext.user，保证 useMembership 相关的会员 UI 即时更新
  const handlePaymentSuccess = useCallback(async () => {
    try {
      await refreshUser();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.fileSystem.storageQuota,
      });
    } catch {
      // 刷新失败不阻塞关闭，页面可手动刷新兜底
    } finally {
      close();
    }
  }, [refreshUser, queryClient, close]);

  const handlePaymentError = useCallback((msg: string) => {
    setOrderError(msg);
  }, []);

  const handleBack = useCallback(() => {
    setView('selection');
    setOrderResult(null);
    setOrderError('');
  }, []);

  if (!isOpen) return null;

  const currentLabel = selectedTier
    ? `${selectedTier.name} · ${months} ${t('个月')}`
    : '';
  const guideContent = reason
    ? QUOTA_GUIDE_CONTENT[reason.restrictionKey]
    : undefined;

  return createPortal(
    <div className="plan-select-root" style={{ zIndex: Z_LAYERS.MODAL }}>
      <div className="plan-select-backdrop" onClick={close} />
      <div
        className={`plan-select-modal ${view === 'payment' ? 'view-payment' : ''}`}
      >
        {view === 'payment' && orderResult ? (
          /* ====== 支付视图 ====== */
          <div className="ps-payment">
            <div className="ps-header">
              <button className="ps-btn-back" onClick={handleBack}>
                ← {t('返回')}
              </button>
              <h2>{t('微信支付')}</h2>
              <div style={{ width: 40 }} />
            </div>
            <div className="ps-body">
              <WechatPayButton
                payParams={orderResult.payParams}
                codeUrl={orderResult.codeUrl}
                redirectUrl={orderResult.redirectUrl}
                orderNo={orderResult.orderNo}
                amount={orderResult.amount}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                onClose={close}
              />
            </div>
          </div>
        ) : (
          /* ====== 选择视图 ====== */
          <div className="ps-selection">
            <div className="ps-header">
              <h2>{t('升级方案')}</h2>
              <button className="ps-btn-close" onClick={close}>
                <X size={16} />
              </button>
            </div>

            <div className="ps-body">
              {guideContent && (
                <div className="ps-guide">
                  <div className="ps-guide-title">{guideContent.title}</div>
                  <div className="ps-guide-desc">
                    {guideContent.description}
                  </div>
                </div>
              )}
              {loading ? (
                <div className="ps-loading">
                  <div className="ps-spinner" />
                </div>
              ) : tiers.length === 0 ? (
                <p
                  className="ps-empty"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t('暂无可用方案')}
                </p>
              ) : (
                <>
                  <div className="ps-picker-scroll">
                    {tiers.map((tier) => {
                      const sel = tier.id === selectedTierId;
                      const isCurrentTier =
                        membership?.isVip &&
                        membership.tierLevel === tier.level;
                      return (
                        <button
                          key={tier.id}
                          className={`ps-tier-opt ${sel ? 'selected' : ''} ${isCurrentTier ? 'is-current' : ''}`}
                          onClick={() => setSelectedTierId(tier.id)}
                          data-tier-id={tier.id}
                        >
                          <span className="ps-opt-badge">
                            <Crown size={14} />
                          </span>
                          <span className="ps-opt-name">{tier.name}</span>
                          <span className="ps-opt-price">
                            <b>¥{centsToYuan(tier.baseMonthlyPrice)}</b>/
                            {t('月')}
                          </span>
                          {isCurrentTier && (
                            <span className="ps-opt-tag">{t('续费')}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selectedTier && features.length > 0 && (
                    <div className="ps-detail">
                      <div className="ps-features">
                        {features.map((f) => (
                          <span key={f} className="ps-feat-chip">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="ps-divider" />

                  <div className="ps-dur-label">{t('购买时长')}</div>
                  <div className="ps-dur-bar">
                    <div className="ps-stepper">
                      <button
                        onClick={() => setMonths(Math.max(1, months - 1))}
                        disabled={months <= 1}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        value={months}
                        min={1}
                        max={12}
                        onChange={(e) => {
                          let v = parseInt(e.target.value) || 1;
                          if (v < 1) v = 1;
                          if (v > 12) v = 12;
                          setMonths(v);
                        }}
                      />
                      <button
                        onClick={() => setMonths(Math.min(12, months + 1))}
                        disabled={months >= 12}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="ps-chips">
                      {[1, 3, 6, 12]
                        .filter((m) => durations.some((d) => d.months === m))
                        .map((m) => {
                          const dur = durations.find((d) => d.months === m);
                          const disc =
                            dur && dur.multiplierBps < 10000
                              ? discountText(dur.multiplierBps)
                              : '';
                          const rawOrig = selectedTier
                            ? calculateOriginalPriceInCents(
                                selectedTier.baseMonthlyPrice,
                                m
                              ) / 100
                            : 0;
                          const rawDisc =
                            dur && selectedTier
                              ? calculatePriceInCents(
                                  selectedTier.baseMonthlyPrice,
                                  dur.multiplierBps,
                                  m
                                ) / 100
                              : 0;
                          const save = rawOrig - rawDisc;
                          return (
                            <button
                              key={m}
                              className={`ps-chip ${months === m ? 'active' : ''} ${disc ? 'has-disc' : ''}`}
                              onClick={() => setMonths(m)}
                            >
                              <span className="ps-chip-m">
                                {m}
                                {t('个月')}
                              </span>
                              {disc && (
                                <span className="ps-chip-disc">
                                  {disc}{' '}
                                  {t('省¥{amount}', {
                                    amount: formatYuan(save),
                                  })}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  <div className="ps-divider" />

                  <div className="ps-price-row">
                    <div>
                      <div className="ps-price-label">{currentLabel}</div>
                      {hasSaving && matchedDuration && (
                        <div className="ps-price-save">
                          {discountText(matchedDuration.multiplierBps)} ·{' '}
                          {t('省 ¥{amount}', { amount: formatYuan(saving) })}
                        </div>
                      )}
                    </div>
                    <div className="ps-price-amount">
                      <span className="ps-price-curr">¥</span>
                      {formatYuan(priceInYuan)}
                      {hasSaving && (
                        <span className="ps-price-orig">
                          ¥{formatYuan(originalPrice)}
                        </span>
                      )}
                    </div>
                  </div>

                  {orderError && <p className="ps-error">{orderError}</p>}
                </>
              )}
            </div>

            {!loading && tiers.length > 0 && (
              <div className="ps-footer-section">
                <button
                  className="ps-btn-buy"
                  onClick={handleBuy}
                  disabled={purchasing || !selectedTier || !matchedDuration}
                >
                  {purchasing
                    ? t('处理中...')
                    : membership?.isVip &&
                        selectedTier &&
                        membership.tierLevel === selectedTier.level
                      ? `${t('立即续费')} · ¥${formatYuan(priceInYuan)}`
                      : `${t('立即升级')} · ¥${formatYuan(priceInYuan)}`}
                </button>

                <div className="ps-footer">
                  <span>{t('随时可取消')}</span>
                  <span>{t('付款后立即生效')}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .plan-select-root {
          position: fixed; inset: 0;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: psFadeIn 0.2s ease-out;
        }
        @media (min-width: 640px) {
          .plan-select-root { align-items: center; padding: 16px; }
        }
        @keyframes psFadeIn { from { opacity: 0; } to { opacity: 1; } }

        .plan-select-backdrop {
          position: absolute; inset: 0;
          background: var(--bg-overlay);
          backdrop-filter: blur(4px);
          cursor: pointer;
        }

        .plan-select-modal {
          position: relative;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          background: var(--bg-elevated);
          border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
          display: flex; flex-direction: column;
          overflow: hidden;
          overscroll-behavior: contain;
          animation: psSlideUp 0.35s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 -4px 32px var(--shadow-color, rgba(0,0,0,0.12));
        }
        @media (min-width: 640px) {
          .plan-select-modal {
            border-radius: var(--radius-2xl);
            animation: psScaleIn 0.3s cubic-bezier(0.16,1,0.3,1);
            box-shadow: var(--shadow-2xl);
          }
        }
        @keyframes psSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes psScaleIn { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        .ps-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px 8px;
          flex-shrink: 0;
        }
        .ps-header h2 {
          font-size: 16px; font-weight: 700;
          color: var(--text-primary);
        }
        .ps-btn-close {
          width: 32px; height: 32px; border-radius: 50%;
          border: none; background: var(--bg-tertiary);
          color: var(--text-muted); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: 0.15s;
        }
        .ps-btn-close:hover { background: var(--border-default); color: var(--text-primary); }

        .ps-btn-back {
          border: none; background: transparent;
          font-size: 13px; color: var(--text-tertiary); cursor: pointer;
          padding: 4px 8px; border-radius: 6px;
          transition: 0.15s;
        }
        .ps-btn-back:hover { background: var(--bg-tertiary); color: var(--text-primary); }

        .ps-body {
          flex: 1; overflow-y: auto;
          min-height: 0;
          padding: 8px 20px 20px;
          scrollbar-width: thin;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }

        .ps-loading {
          display: flex; justify-content: center; padding: 40px 0;
        }
        .ps-spinner {
          width: 28px; height: 28px; border-radius: 50%;
          border: 2px solid var(--border-default);
          border-top-color: var(--primary-500);
          animation: psSpin 0.6s linear infinite;
        }
        @keyframes psSpin { to { transform: rotate(360deg); } }
        .ps-empty { text-align: center; padding: 40px 0; font-size: 13px; }

        .ps-guide {
          padding: 12px 16px;
          background: color-mix(in srgb, var(--primary-500) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--primary-500) 25%, transparent);
          border-radius: var(--radius-xl);
          margin-bottom: 14px;
        }
        .ps-guide-title {
          font-size: 14px; font-weight: 700; color: var(--text-primary);
        }
        .ps-guide-desc {
          font-size: 12px; color: var(--text-secondary); margin-top: 4px;
        }

        .ps-picker-scroll {
          display: flex; flex-wrap: wrap; gap: 6px;
          padding-bottom: 4px; margin-bottom: 12px;
        }

        .ps-tier-opt {
          flex: 1 1 auto;
          min-width: 90px;
          border: 1.5px solid var(--border-default);
          border-radius: var(--radius-xl);
          padding: 14px 20px;
          cursor: pointer; transition: all 0.15s;
          background: var(--bg-secondary);
          min-width: 90px;
          position: relative;
          text-align: center;
          font-family: inherit;
          display: flex; flex-direction: column; align-items: center; gap: 4px;
        }
        .ps-tier-opt:hover { border-color: var(--primary-400); }
        .ps-tier-opt.selected {
          border-color: var(--primary-500);
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary-500) 6%, transparent), transparent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-500) 15%, transparent);
        }
        .ps-opt-badge {
          width: 24px; height: 24px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          background: var(--primary-500); color: var(--text-inverse);
          flex-shrink: 0;
        }
        .ps-opt-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
        .ps-opt-price { font-size: 11px; color: var(--text-tertiary); text-align: center; }
        .ps-opt-price b { color: var(--text-primary); font-weight: 700; }
        .ps-opt-tag {
          font-size: 9px; font-weight: 700; color: var(--primary-500);
          background: color-mix(in srgb, var(--primary-500) 10%, transparent);
          padding: 1px 8px; border-radius: 10px; margin-top: 2px; line-height: 1.4;
        }
        .ps-tier-opt.is-current { border-color: var(--primary-300); background: color-mix(in srgb, var(--primary-500) 4%, transparent); }

        .ps-detail {
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-radius: var(--radius-xl);
          border: 1px solid var(--border-default);
          margin-bottom: 12px;
        }
        .ps-features { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
        .ps-feat-chip {
          font-size: 11px; color: var(--text-secondary);
          padding: 3px 10px;
          background: var(--bg-tertiary);
          border-radius: 6px;
        }

        .ps-divider { height: 1px; background: var(--border-default); margin: 14px 0; }

        .ps-dur-label {
          font-size: 13px; font-weight: 600; color: var(--text-primary);
          margin-bottom: 8px;
        }
        .ps-dur-bar {
          display: flex; align-items: center; gap: 8px;
          flex-wrap: wrap;
        }
        .ps-stepper {
          display: flex; align-items: center;
          border: 1.5px solid var(--border-default);
          border-radius: var(--radius-lg);
          background: var(--bg-secondary);
          overflow: hidden;
          flex-shrink: 0;
        }
        .ps-stepper button {
          width: 38px; height: 42px;
          border: none; background: transparent;
          color: var(--text-secondary); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: 0.1s;
        }
        .ps-stepper button:active { background: var(--bg-tertiary); }
        .ps-stepper button:disabled { opacity: 0.3; cursor: not-allowed; }
        .ps-stepper input {
          width: 46px; height: 42px;
          border: none; border-left: 1.5px solid var(--border-default); border-right: 1.5px solid var(--border-default);
          text-align: center;
          font-size: 17px; font-weight: 700; color: var(--text-primary);
          background: transparent;
          outline: none; -moz-appearance: textfield;
        }
        .ps-stepper input::-webkit-outer-spin-button,
        .ps-stepper input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        .ps-chips { display: flex; gap: 4px; flex-wrap: wrap; }
        .ps-chip {
          padding: 6px 14px;
          border-radius: 20px;
          border: 1.5px solid var(--border-default);
          background: var(--bg-secondary);
          cursor: pointer; transition: 0.15s;
          font-family: inherit;
          display: flex; flex-direction: column; align-items: center; gap: 1px;
        }
        .ps-chip:hover { border-color: var(--primary-400); }
        .ps-chip.active {
          background: var(--primary-500); border-color: var(--primary-500);
          color: var(--text-inverse);
        }
        .ps-chip-m { font-size: 12px; color: var(--text-tertiary); line-height: 1.2; }
        .ps-chip.active .ps-chip-m { color: var(--text-inverse); }
        .ps-chip-disc {
          font-size: 9px; font-weight: 700;
          color: var(--success);
          line-height: 1; white-space: nowrap;
        }
        .ps-chip.active .ps-chip-disc { color: color-mix(in srgb, var(--text-inverse) 90%, transparent); }
        .ps-chip.has-disc { padding-top: 5px; padding-bottom: 5px; }
        .ps-chip.has-disc .ps-chip-m { font-size: 11px; }

        .ps-price-row {
          display: flex; align-items: baseline; justify-content: space-between;
        }
        .ps-price-label { font-size: 12px; color: var(--text-tertiary); }
        .ps-price-save { font-size: 12px; color: var(--success); font-weight: 600; margin-top: 2px; }
        .ps-price-amount {
          font-size: 28px; font-weight: 800; color: var(--text-primary);
          letter-spacing: -1px; line-height: 1;
        }
        .ps-price-curr { font-size: 18px; }
        .ps-price-orig {
          font-size: 14px; font-weight: 400; color: var(--text-muted);
          text-decoration: line-through; margin-left: 6px;
        }

        .ps-error {
          font-size: 12px; color: var(--error);
          margin-top: 8px; text-align: center;
        }

        .ps-btn-buy {
          width: 100%; padding: 14px 0;
          border-radius: var(--radius-lg);
          border: none;
          font-size: 16px; font-weight: 700; cursor: pointer;
          color: var(--text-inverse);
          background: linear-gradient(135deg, var(--primary-600), var(--accent-600));
          transition: all 0.15s;
          font-family: inherit;
        }
        .ps-btn-buy:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px color-mix(in srgb, var(--primary-500) 35%, transparent);
        }
        .ps-btn-buy:disabled { opacity: 0.5; cursor: not-allowed; }

        .ps-footer {
          display: flex; justify-content: space-between;
          font-size: 11px; color: var(--text-muted);
          margin-top: 12px;
        }

        .ps-footer-section {
          flex-shrink: 0;
          padding: 12px 20px calc(16px + env(safe-area-inset-bottom));
          border-top: 1px solid var(--border-default);
          background: var(--bg-elevated);
        }

        .ps-selection {
          display: flex; flex-direction: column;
          flex: 1; min-height: 0;
          overflow: hidden;
        }
        .ps-payment { display: flex; flex-direction: column; height: 100%; }
        .ps-payment .ps-body { flex: 1; padding-top: 12px; }
      `}</style>
    </div>,
    document.body
  );
}
