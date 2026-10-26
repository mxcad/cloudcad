import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Z_LAYERS } from '../../constants/layers';
import type { ThreeButtonDialogState } from './types';
import { renderConfirmIcon } from './ConfirmDialogIcon';

/**
 * 三按钮弹框——必须做选择，mustChoose：点遮罩/按 Esc 都不关闭，也不能点右上角 ×。
 * 保存/不保存/取消三者语义不同，任一「没点按钮」的关闭都只能是猜测，故只认按钮。
 */

interface ThreeButtonDialogProps {
  state: ThreeButtonDialogState;
  onConfirm: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function ThreeButtonDialog({
  state,
  onConfirm,
  onDiscard,
  onCancel,
}: ThreeButtonDialogProps) {
  if (!state.isOpen) return null;
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={state.title}
      mustChoose
      zIndex={Z_LAYERS.TOAST - 1}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {state.cancelText}
          </Button>
          <Button variant="outline" onClick={onDiscard}>
            {state.discardText}
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
