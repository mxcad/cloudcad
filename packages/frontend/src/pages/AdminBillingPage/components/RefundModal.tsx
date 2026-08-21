import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import { formatYuan } from '../constants';
import type { AdminOrder } from '../types';

interface RefundModalProps {
  isOpen: boolean;
  order: AdminOrder | null;
  reason: string;
  onClose: () => void;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
}

export function RefundModal({
  isOpen,
  order,
  reason,
  onClose,
  onReasonChange,
  onConfirm,
}: RefundModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('退款')} size="sm">
      <div className="space-y-4">
        {order && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('订单 {orderNo} 退款 {amount}', {
              orderNo: order.orderNo,
              amount: formatYuan(order.amount),
            })}
          </p>
        )}
        <input
          placeholder={t('退款原因(可选)')}
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-sm"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('确认退款')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
