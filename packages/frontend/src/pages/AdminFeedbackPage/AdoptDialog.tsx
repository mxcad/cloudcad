import React, { useCallback, useEffect, useState } from 'react';
import { t } from '@/languages';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import type { FeedbackResponseDto } from '@/api-sdk';
import {
  FEEDBACK_TIER_OPTIONS,
  FEEDBACK_DURATION_OPTIONS,
} from '@/constants/feedback';
import { useAdoptFeedback } from './useFeedbackAdmin';

interface AdoptDialogProps {
  isOpen: boolean;
  feedback: FeedbackResponseDto | null;
  onClose: () => void;
  onAdopted: () => void;
}

const TIER_OPTIONS = FEEDBACK_TIER_OPTIONS.map((o) => ({
  value: o.value,
  label: t(o.labelKey),
}));
const DURATION_OPTIONS = FEEDBACK_DURATION_OPTIONS.map((o) => ({
  value: o.value,
  label: t(o.labelKey),
}));

/**
 * 采纳反馈弹窗：管理员选定奖励等级（VIP1-3）与时长（7/30/90 天）后采纳，
 * 创建 PENDING 奖励记录。匿名反馈自动标记 claimRequired，须客服认领发放。
 */
export const AdoptDialog: React.FC<AdoptDialogProps> = ({
  isOpen,
  feedback,
  onClose,
  onAdopted,
}) => {
  const { showToast } = useNotification();
  const adopt = useAdoptFeedback();
  const [tier, setTier] = useState('1');
  const [duration, setDuration] = useState('30');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTier('1');
      setDuration('30');
      setNote('');
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!feedback) return;
    try {
      await adopt.mutateAsync({
        id: feedback.id,
        body: {
          vipTierLevel: Number(tier),
          durationDays: Number(duration),
          note: note.trim() || undefined,
        },
      });
      showToast(t('已采纳，奖励待发放'), 'success');
      onAdopted();
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    }
  }, [feedback, tier, duration, note, adopt, showToast, onAdopted, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('采纳反馈并发放奖励')}
      maxWidth="max-w-[480px]"
      closeOnOverlayClick={!adopt.isPending}
    >
      {feedback && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--text-secondary)]">
            {t('反馈：')}「{feedback.title}」
          </p>

          <div className="space-y-2">
            <label className="block text-sm font-medium">{t('奖励会员等级')}</label>
            <Select
              value={tier}
              onChange={setTier}
              options={TIER_OPTIONS}
              disabled={adopt.isPending}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">{t('奖励时长')}</label>
            <Select
              value={duration}
              onChange={setDuration}
              options={DURATION_OPTIONS}
              disabled={adopt.isPending}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">
              {t('采纳说明（选填，展示给用户）')}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t('例如：已采纳该建议，将在下个版本中优化')}
              disabled={adopt.isPending}
            />
          </div>

          {feedback.claimRequired && (
            <p className="text-xs text-[var(--warning, #b45309)]">
              {t('匿名反馈：奖励将标记为待认领，须联系客服注册/绑定账号后发放。')}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={adopt.isPending}>
              {t('取消')}
            </Button>
            <Button onClick={handleSubmit} loading={adopt.isPending}>
              {t('确认采纳')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
