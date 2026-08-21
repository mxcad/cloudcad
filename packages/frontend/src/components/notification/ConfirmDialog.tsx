import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Z_LAYERS } from '../../constants/layers';
import type { ConfirmDialogState } from './types';
import { renderConfirmIcon } from './ConfirmDialogIcon';

interface ConfirmDialogProps {
  state: ConfirmDialogState;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  state,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!state.isOpen) return null;
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={state.title}
      zIndex={Z_LAYERS.TOAST - 1}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {state.cancelText}
          </Button>
          <Button onClick={onConfirm}>{state.confirmText}</Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        {renderConfirmIcon(state.dialogType)}
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {state.message}
        </p>
      </div>
    </Modal>
  );
}
