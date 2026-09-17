import React, { useState, useEffect, useMemo } from 'react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { dateOnlyToIso, isoToDateOnly, todayStartIso } from '@/utils/dateUtils';
import { Loader2, Crown, Minus, Plus } from 'lucide-react';
import { vipControllerGetActiveTiers } from '@/api-sdk';
import type { SelectOption } from '@/components/ui/Select';
import { getErrorMessage } from '@/utils/errorHandler';
import { FREE_TIER_LEVEL } from '@/constants/vip';
import styles from '../UserManagement.module.css';

const PRESET_DURATIONS = [
  { days: 7, label: t('{n} 天', { n: '7' }) },
  { days: 30, label: t('{n} 天', { n: '30' }) },
  { days: 90, label: t('{n} 天', { n: '90' }) },
  { days: 180, label: t('{n} 天', { n: '180' }) },
  { days: 365, label: t('{n} 天', { n: '365' }) },
];

const ADJUST_QUICK_DAYS = [7, 30, 90, 180, 365];
const DAY_MS = 86400000;
const MAX_ADJUST_DAYS = 3650;

/** GET /api/v1/vip/tiers 返回的上架等级（SDK 该端点类型为 unknown，此处本地描述） */
interface VipTierDto {
  id: string;
  level: number;
  name: string;
  isActive: boolean;
}

interface MembershipManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { tierLevel: number; expiresAt?: string; adjustDays?: number }) => Promise<void>;
  loading: boolean;
  currentMembership?: {
    tierLevel?: number;
    expiresAt?: string | null;
  };
  userName: string;
  error?: string | null;
}

export function MembershipManageModal({
  isOpen,
  onClose,
  onSubmit,
  loading,
  currentMembership,
  userName,
  error,
}: MembershipManageModalProps) {
  const [tierLevel, setTierLevel] = useState('0');
  const [durationMode, setDurationMode] = useState<'preset' | 'custom' | 'adjust'>(
    'preset'
  );
  const [presetDays, setPresetDays] = useState(30);
  const [customDate, setCustomDate] = useState('');
  // 计数器模型：signedDays 是「调整量」（有符号天数）的唯一事实源，
  // +/− 按钮、快捷天数、输入框全部读写它，每次点击立即生效
  const [signedDays, setSignedDays] = useState(30);
  // 输入框草稿（string）：允许中间态输入（如 "-"、"清空"），blur 时规范化回钳制值
  const [daysDraft, setDaysDraft] = useState('30');
  const [tierOptions, setTierOptions] = useState<SelectOption[]>([
    { value: '0', label: t('免费用户') },
  ]);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [tiersError, setTiersError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const currentTier = currentMembership?.tierLevel ?? 0;
      setTierLevel(String(currentTier));
      if (currentTier > 0 && currentMembership?.expiresAt) {
        setDurationMode('custom');
        setCustomDate(currentMembership.expiresAt.slice(0, 10));
      } else {
        setDurationMode('preset');
        setPresetDays(30);
        setCustomDate('');
      }
      setSignedDays(30);
      setDaysDraft('30');
    }
  }, [isOpen, currentMembership]);

  // 会员等级列表只展示"上架"的等级（GET /vip/tiers 仅返回启用等级），
  // 不硬编码 0-10：已下架等级不再出现在可选列表中
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setTiersLoading(true);
    setTiersError(null);
    vipControllerGetActiveTiers()
      .then((result) => {
        if (cancelled) return;
        if (result.error) throw result.error;
        const tiers = ((result.data ?? []) as VipTierDto[]).filter(
          (tier) => tier && typeof tier.level === 'number'
        );
        // 后端守卫保证 level 0（系统默认等级）恒上架存在，直接使用接口数据即可；
        // 此处防御异常（如库中记录被手动删除），缺失时补一条免费选项
        const options: SelectOption[] = tiers.map((tier) => ({
          value: String(tier.level),
          // level 0（免费档）直接显示「免费用户」，避免「VIP0」中突兀的数字 0
          label:
            tier.level === FREE_TIER_LEVEL
              ? t('免费用户')
              : t('VIP{level}', { level: String(tier.level) }),
        }));
        if (!tiers.some((tier) => tier.level === FREE_TIER_LEVEL)) {
          options.unshift({ value: '0', label: t('免费用户') });
        }
        // 当前等级已下架时补充为只读选项，保证下拉能显示现有会员等级
        const currentTier = currentMembership?.tierLevel ?? 0;
        if (
          currentTier > 0 &&
          !tiers.some((tier) => tier.level === currentTier)
        ) {
          options.push({
            value: String(currentTier),
            label: `${t('VIP{level}', { level: String(currentTier) })}（${t('已下架')}）`,
          });
        }
        setTierOptions(options);
      })
      .catch((err) => {
        if (cancelled) return;
        setTiersError(getErrorMessage(err) || t('获取会员列表失败'));
        // 降级：仅保留免费选项，避免展示未经验证的硬编码等级
        setTierOptions([{ value: '0', label: t('免费用户') }]);
      })
      .finally(() => {
        if (!cancelled) setTiersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentMembership?.tierLevel]);

  // 调整基准：当前到期时间晚于此刻则从到期时间起算，否则从此刻起算（与后端 user-crud 一致）
  const adjustBase = useMemo(() => {
    const now = new Date();
    const currentExpiry = currentMembership?.expiresAt
      ? new Date(currentMembership.expiresAt)
      : null;
    return currentExpiry && currentExpiry > now ? currentExpiry : now;
  }, [currentMembership?.expiresAt]);

  // 下限：调整后的到期时间不得早于此刻。base + minSigned*天 ≥ 此刻的最小整数。
  // base=此刻时为 0（只能延长）；base 为未来到期时间时为负数（可回拨到不早于现在）
  const minSignedDays = useMemo(
    () => Math.ceil((Date.now() - adjustBase.getTime()) / DAY_MS),
    [adjustBase]
  );

  const clampSignedDays = (v: number) =>
    Math.max(minSignedDays, Math.min(MAX_ADJUST_DAYS, v));

  // 调整时长预览：状态被钳制恒合法，新到期时间永不早于此刻
  const adjustPreview = useMemo(() => {
    if (durationMode !== 'adjust' || Number(tierLevel) === 0) return null;
    if (signedDays === 0) return null;
    const now = new Date();
    const currentExpiry = currentMembership?.expiresAt
      ? new Date(currentMembership.expiresAt)
      : null;
    const hasExpiry = currentExpiry !== null && currentExpiry > now;
    const newDate = new Date(adjustBase.getTime() + signedDays * DAY_MS);
    return {
      currentExpiry: hasExpiry ? currentExpiry : null,
      newDate,
      signedDays,
    };
  }, [durationMode, tierLevel, signedDays, adjustBase, currentMembership?.expiresAt]);

  // 计数器式调整：每次点击立即 ±1 天，方向由所点按钮决定，无隐式切换
  const handleAdjustStep = (delta: number) => {
    const next = clampSignedDays(signedDays + delta);
    setSignedDays(next);
    setDaysDraft(String(next));
  };

  const handleDaysDraftChange = (text: string) => {
    setDaysDraft(text);
    const v = parseInt(text, 10);
    if (!isNaN(v)) setSignedDays(clampSignedDays(v));
  };

  const normalizeDaysDraft = () => {
    const v = parseInt(daysDraft, 10);
    if (isNaN(v) || String(clampSignedDays(v)) !== daysDraft) {
      setDaysDraft(String(signedDays));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const level = Number(tierLevel);

    if (level === 0) {
      await onSubmit({ tierLevel: 0 });
      return;
    }

    if (durationMode === 'adjust') {
      // 防御：signedDays 已被钳制在 [minSignedDays, MAX] 内（新到期不早于此刻），0 天无意义
      if (signedDays === 0) return;
      await onSubmit({ tierLevel: level, adjustDays: signedDays });
      return;
    }

    let expiresAt: string | undefined;
    if (durationMode === 'preset') {
      const date = new Date();
      date.setDate(date.getDate() + presetDays);
      expiresAt = date.toISOString();
    } else if (durationMode === 'custom') {
      if (!customDate) return;
      expiresAt = new Date(customDate).toISOString();
    }

    if (level > 0 && !expiresAt) return;

    await onSubmit({ tierLevel: level, expiresAt });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className={styles.modalTitleWithIcon}>
          <Crown size={20} />
          {t('管理会员 - {name}', { name: userName })}
        </span>
      }
      className="max-w-md"
      footer={
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('取消')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              (durationMode === 'adjust' && Number(tierLevel) > 0 && signedDays === 0)
            }
            className={styles.submitBtn}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t('处理中...')}
              </>
            ) : (
              t('保存')
            )}
          </Button>
        </div>
      }
    >
      <form className={styles.membershipForm} onSubmit={handleSubmit}>
        {(error || tiersError) && (
          <div className={styles.formErrorBanner}>{error || tiersError}</div>
        )}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            {t('VIP 等级')} <span className={styles.required}>*</span>
          </label>
          <Select
            value={tierLevel}
            onChange={(value) => {
              setTierLevel(value);
              if (value === '0') {
                setDurationMode('preset');
              }
            }}
            options={tierOptions}
            placeholder={t('请选择等级')}
            loading={tiersLoading}
            disabled={tiersLoading}
          />
        </div>

        {Number(tierLevel) > 0 && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              {t('会员时长')} <span className={styles.required}>*</span>
            </label>
            <div className={styles.durationModeTabs}>
              <Button
                variant={durationMode === 'preset' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setDurationMode('preset')}
                type="button"
              >
                {t('预设时长')}
              </Button>
              <Button
                variant={durationMode === 'custom' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setDurationMode('custom')}
                type="button"
              >
                {t('自定义日期')}
              </Button>
              <Button
                variant={durationMode === 'adjust' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setDurationMode('adjust')}
                type="button"
              >
                {t('调整时长')}
              </Button>
            </div>

            {durationMode === 'preset' && (
              <div className={styles.presetDurations}>
                {PRESET_DURATIONS.map((d) => (
                  <Button
                    key={d.days}
                    variant={presetDays === d.days ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setPresetDays(d.days)}
                    type="button"
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            )}

            {durationMode === 'custom' && (
              <DatePicker
                size="md"
                value={dateOnlyToIso(customDate)}
                minDate={todayStartIso()}
                onChange={(v) => setCustomDate(isoToDateOnly(v))}
              />
            )}

            {durationMode === 'adjust' && (
              <div className={styles.adjustDurationSection}>
                {/* 计数器：±1 天每次点击立即生效，到底/到顶自动禁用对应按钮 */}
                <div className={styles.adjustStepper}>
                  <button
                    type="button"
                    className={styles.adjustStepBtn}
                    onClick={() => handleAdjustStep(-1)}
                    disabled={signedDays <= minSignedDays}
                    aria-label={t('减少一天')}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    value={daysDraft}
                    onChange={(e) => handleDaysDraftChange(e.target.value)}
                    onBlur={normalizeDaysDraft}
                    className={styles.adjustDaysInput}
                    aria-label={t('调整天数')}
                  />
                  <span className={styles.adjustDaysUnit}>{t('天')}</span>
                  <button
                    type="button"
                    className={styles.adjustStepBtn}
                    onClick={() => handleAdjustStep(1)}
                    disabled={signedDays >= MAX_ADJUST_DAYS}
                    aria-label={t('增加一天')}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {/* 快捷天数：绝对赋值调整量，服务最常见的延长场景 */}
                <div className={styles.presetDurations}>
                  {ADJUST_QUICK_DAYS.map((days) => (
                    <Button
                      key={days}
                      variant={signedDays === days ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        setSignedDays(days);
                        setDaysDraft(String(days));
                      }}
                      type="button"
                    >
                      {days} {t('天')}
                    </Button>
                  ))}
                </div>

                {/* 预览新到期时间 */}
                {adjustPreview && (
                  <div className={styles.adjustPreview}>
                    {adjustPreview.currentExpiry && (
                      <div className={styles.adjustPreviewCurrent}>
                        {t('当前到期：{date}', {
                          date: adjustPreview.currentExpiry.toLocaleDateString(),
                        })}
                      </div>
                    )}
                    {!adjustPreview.currentExpiry && (
                      <div className={styles.adjustPreviewCurrent}>
                        {t('当前无到期时间，从今天起算')}
                      </div>
                    )}
                    <div className={styles.adjustPreviewNew}>
                      {t('新到期时间：{date}', {
                        date: adjustPreview.newDate.toLocaleDateString(),
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {Number(tierLevel) === 0 &&
          currentMembership?.tierLevel &&
          currentMembership.tierLevel > 0 && (
            <div className={styles.formNotice}>
              {t('将移除该用户的 VIP 会员资格（当前 VIP{level}）', {
                level: String(currentMembership.tierLevel),
              })}
            </div>
          )}
      </form>
    </Modal>
  );
}
