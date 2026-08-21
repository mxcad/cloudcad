import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { t } from '@/languages';
import { formatYuan } from '../constants';
import type { RefundApplicationItem } from '../types';

interface ReviewRefundModalProps {
  isOpen: boolean;
  application: RefundApplicationItem | null;
  /** approve=审核通过并立即退款；reject=驳回申请 */
  action: 'approve' | 'reject';
  note: string;
  revertMembership: boolean;
  submitting: boolean;
  onClose: () => void;
  onNoteChange: (value: string) => void;
  onRevertMembershipChange: (value: boolean) => void;
  onConfirm: () => void;
}

export function ReviewRefundModal({
  isOpen,
  application,
  action,
  note,
  revertMembership,
  submitting,
  onClose,
  onNoteChange,
  onRevertMembershipChange,
  onConfirm,
}: ReviewRefundModalProps) {
  const isApprove = action === 'approve';
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isApprove ? t('审核通过退款申请') : t('驳回退款申请')}
      size="sm"
    >
      <div className="space-y-4">
        {application && (
          <div
            className="text-sm space-y-1 rounded-xl p-3"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            <p>
              {t('用户')}:{' '}
              {application.user?.email ||
                application.user?.username ||
                application.userId}
            </p>
            <p>
              {t('订单')}: {application.order?.orderNo}
            </p>
            <p>
              {t('金额')}: {formatYuan(application.amount)}
            </p>
            <p>
              {t('申请原因')}: {application.reason}
            </p>
          </div>
        )}
        {isApprove && (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {t('审核通过后将立即执行退款（原路退回），结果会邮件通知用户')}
          </p>
        )}
        {isApprove && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={revertMembership}
              onChange={(e) => onRevertMembershipChange(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span>{t('回退会员等级和有效期')}</span>
          </label>
        )}
        <Textarea
          placeholder={t('审核意见(可选)')}
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => onNoteChange(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('取消')}
          </Button>
          <Button
            variant={isApprove ? 'primary' : 'danger'}
            onClick={onConfirm}
            loading={submitting}
          >
            {isApprove ? t('确认通过并退款') : t('确认驳回')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
