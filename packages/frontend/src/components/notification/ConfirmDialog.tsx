import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Z_LAYERS } from '../../constants/layers';
import type { ConfirmDialogState } from './types';
import { renderConfirmIcon } from './ConfirmDialogIcon';

/**
 * 确认弹框——必须做选择，mustChoose：点遮罩/按 Esc 都不关闭，也不能点右上角 ×，
 * 只能点「确定/取消」。否则删除确认被误触关掉＝静默取消（危险），
 * 未保存更改确认被误触关掉＝用户没决策过就丢了改动。
 */

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
      mustChoose
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
