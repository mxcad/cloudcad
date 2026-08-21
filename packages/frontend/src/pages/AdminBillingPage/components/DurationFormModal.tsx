import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { t } from '@/languages';
import type { DurationFormState } from '../hooks/useTierManagement';

interface DurationFormModalProps {
  isOpen: boolean;
  editingId: string | null;
  form: DurationFormState;
  saving: boolean;
  onClose: () => void;
  onFormChange: (form: DurationFormState) => void;
  onSave: () => void;
}

export function DurationFormModal({
  isOpen,
  editingId,
  form,
  saving,
  onClose,
  onFormChange,
  onSave,
}: DurationFormModalProps) {
  const updateForm = (patch: Partial<DurationFormState>) =>
    onFormChange({ ...form, ...patch });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingId ? t('编辑时长定价') : t('新增时长定价')}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('月数')}
          </label>
          <input
            type="number"
            value={String(form.months)}
            onChange={(e) => updateForm({ months: Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('倍率')}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="2"
            value={String(form.multiplierDecimal)}
            onChange={(e) =>
              updateForm({
                multiplierDecimal: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {form.multiplierDecimal < 1
              ? t('相当于 {discount}% 折扣', {
                  discount: String(
                    Math.round((1 - form.multiplierDecimal) * 100)
                  ),
                })
              : t('原价无折扣')}
          </p>
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('显示名')}
          </label>
          <input
            value={form.label}
            onChange={(e) => updateForm({ label: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('排序')}
          </label>
          <input
            type="number"
            value={String(form.sortOrder)}
            onChange={(e) => updateForm({ sortOrder: Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button variant="primary" onClick={onSave} loading={saving}>
            {editingId ? t('保存') : t('创建')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
