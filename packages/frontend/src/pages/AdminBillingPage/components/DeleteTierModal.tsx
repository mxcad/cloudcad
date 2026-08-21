import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import type { DeleteTierConfirm } from '../hooks/useTierManagement';

interface DeleteTierModalProps {
  confirm: DeleteTierConfirm | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteTierModal({
  confirm,
  onClose,
  onConfirm,
}: DeleteTierModalProps) {
  return (
    <Modal isOpen={!!confirm} onClose={onClose} title={t('确认删除')} size="sm">
      <p style={{ color: 'var(--text-secondary)' }}>
        {t('确定要删除该 VIP 等级吗？删除后不可恢复。')}
      </p>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={onClose}>
          {t('取消')}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {t('确认删除')}
        </Button>
      </div>
    </Modal>
  );
}
