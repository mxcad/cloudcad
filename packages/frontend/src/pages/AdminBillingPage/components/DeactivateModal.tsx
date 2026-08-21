import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import type { DeactivateConfirm } from '../hooks/useTierManagement';

interface DeactivateModalProps {
  confirm: DeactivateConfirm | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeactivateModal({
  confirm,
  onClose,
  onConfirm,
}: DeactivateModalProps) {
  return (
    <Modal isOpen={!!confirm} onClose={onClose} title={t('确认下架')} size="sm">
      <p style={{ color: 'var(--text-secondary)' }}>
        {confirm?.type === 'tier'
          ? t('确定要下架该 VIP 等级吗？下架后将不再对外展示。')
          : t('确定要下架该时长定价吗？下架后将不再对外展示。')}
      </p>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={onClose}>
          {t('取消')}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {t('确认下架')}
        </Button>
      </div>
    </Modal>
  );
}
