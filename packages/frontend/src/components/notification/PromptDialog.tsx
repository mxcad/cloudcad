import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Z_LAYERS } from '../../constants/layers';
import type { PromptDialogState } from './types';

interface PromptDialogProps {
  state: PromptDialogState;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PromptDialog({
  state,
  value,
  onChange,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
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
          <Button onClick={onConfirm} disabled={!value.trim()}>
            {state.confirmText}
          </Button>
        </>
      }
    >
      <label
        className="block text-sm font-medium mb-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        {state.label}
      </label>
      {state.multiline ? (
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          size="lg"
          style={{ minHeight: '100px' }}
          placeholder={state.label}
        />
      ) : (
        <Input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              onConfirm();
            }
          }}
        />
      )}
    </Modal>
  );
}
