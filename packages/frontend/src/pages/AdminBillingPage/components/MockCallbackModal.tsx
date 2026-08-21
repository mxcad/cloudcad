import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import type { AdminOrder } from '../types';

interface MockCallbackModalProps {
  isOpen: boolean;
  order: AdminOrder | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function MockCallbackModal({
  isOpen,
  order,
  onClose,
  onConfirm,
}: MockCallbackModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('模拟支付回调')}
      size="sm"
    >
      <div className="space-y-4">
        {order && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('将订单 {orderNo} 标记为已支付', { orderNo: order.orderNo })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {t('确认')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
