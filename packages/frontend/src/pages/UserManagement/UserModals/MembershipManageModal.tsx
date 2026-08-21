import React, { useState, useEffect, useMemo } from 'react';
import { t } from '@/languages';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { dateOnlyToIso, isoToDateOnly, todayStartIso } from '@/utils/dateUtils';
import { Loader2, Crown } from 'lucide-react';
import { vipControllerGetActiveTiers } from '@/api-sdk';
import type { SelectOption } from '@/components/ui/Select';
import { getErrorMessage } from '@/utils/errorHandler';
import { FREE_TIER_LEVEL } from '@/constants/vip';
import styles from '../UserManagement.module.css';

const PRESET_DURATIONS = [
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
  { days: 90, label: '90 天' },
  { days: 180, label: '180 天' },
  { days: 365, label: '365 天' },
];

const ADJUST_QUICK_DAYS = [7, 30, 90, 180, 365];
const DAY_MS = 86400000;

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
  const [adjustDays, setAdjustDays] = useState(30);
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'subtract'>('add');
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
      setAdjustDays(30);
      setAdjustDirection('add');
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

  // 调整时长预览：计算新到期时间
  const adjustPreview = useMemo(() => {
    if (durationMode !== 'adjust' || Number(tierLevel) === 0) return null;
    const signedDays = adjustDirection === 'add' ? adjustDays : -adjustDays;
    if (signedDays === 0) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentExpiry = currentMembership?.expiresAt
      ? new Date(currentMembership.expiresAt)
      : null;
    const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newDate = new Date(base.getTime() + signedDays * DAY_MS);
    return {
      currentExpiry: currentExpiry && currentExpiry > now ? currentExpiry : null,
      newDate,
      signedDays,
      // 截止日期不能比当天更早：减少后的新到期时间早于今天零点则视为无效
      isPast: newDate < todayStart,
    };
  }, [durationMode, tierLevel, adjustDays, adjustDirection, currentMembership?.expiresAt]);

  // 计数器式调整：点击「增加/减少」每次立即生效。
  // 首次点击负责切换方向（保留当前天数），再次点击则按 ±1 天递增/递减，
  // 与快捷天数/自定义天数共用同一份 adjustDays 值。
  const handleAdjustAdd = () => {
    if (adjustDirection === 'subtract') {
      setAdjustDirection('add');
      return;
    }
    setAdjustDays((d) => Math.min(3650, d + 1));
  };

  const handleAdjustSubtract = () => {
    if (adjustDirection === 'add') {
      setAdjustDirection('subtract');
      return;
    }
    setAdjustDays((d) => Math.max(1, d - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const level = Number(tierLevel);

    if (level === 0) {
      await onSubmit({ tierLevel: 0 });
      return;
    }

    if (durationMode === 'adjust') {
      const signedDays = adjustDirection === 'add' ? adjustDays : -adjustDays;
      if (signedDays === 0) return;
      // 防御：调整后的到期时间不能早于今天（UI 已禁用保存，此处兜底）
      if (adjustPreview?.isPast) return;
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
              (durationMode === 'adjust' &&
                Number(tierLevel) > 0 &&
                (adjustDays === 0 || adjustPreview?.isPast === true))
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
                {/* 方向切换 */}
                <div className={styles.adjustDirection}>
                  <Button
                    variant={adjustDirection === 'add' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={handleAdjustAdd}
                    type="button"
                  >
                    + {t('增加')}
                  </Button>
                  <Button
                    variant={adjustDirection === 'subtract' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={handleAdjustSubtract}
                    type="button"
                  >
                    - {t('减少')}
                  </Button>
                </div>

                {/* 快捷天数按钮 */}
                <div className={styles.presetDurations}>
                  {ADJUST_QUICK_DAYS.map((days) => (
                    <Button
                      key={days}
                      variant={adjustDays === days ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setAdjustDays(days)}
                      type="button"
                    >
                      {days} {t('天')}
                    </Button>
                  ))}
                </div>

                {/* 手动输入天数 */}
                <div className={styles.adjustInput}>
                  <label className={styles.formLabel}>{t('自定义天数')}</label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={adjustDays}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v > 0) setAdjustDays(v);
                    }}
                    className={styles.adjustDaysInput}
                  />
                  <span className={styles.adjustDaysUnit}>{t('天')}</span>
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
                    <div
                      className={
                        adjustPreview.isPast
                          ? styles.adjustPreviewError
                          : styles.adjustPreviewNew
                      }
                    >
                      {t('新到期时间：{date}', {
                        date: adjustPreview.newDate.toLocaleDateString(),
                      })}
                    </div>
                    {adjustPreview.isPast && (
                      <div className={styles.adjustPreviewWarning}>
                        {t('调整后的到期时间不能早于今天')}
                      </div>
                    )}
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
