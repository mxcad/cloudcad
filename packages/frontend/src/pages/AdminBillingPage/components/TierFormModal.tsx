import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { MbFileSizeInput } from '@/components/ui/FileSize';
import { t } from '@/languages';
import { isStorageConfigKey } from '@/utils/tierConfigUtils';
import type { ConfigRegistryEntry } from '@/utils/tierConfigUtils';
import type { TierFormState } from '../hooks/useTierManagement';

function ConfigField({
  entry,
  value,
  onChange,
}: {
  entry: ConfigRegistryEntry;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const label = entry.label;
  const desc = entry.description;

  if (entry.type === 'bool') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded"
          style={{ accentColor: 'var(--primary-500)' }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </span>
      </label>
    );
  }

  if (isStorageConfigKey(entry.key)) {
    return (
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </label>
        <MbFileSizeInput
          mbValue={Number(value) || 0}
          onChange={(mb) => onChange(mb)}
          min={0}
        />
        {desc && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {desc}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label
        className="block text-sm font-medium mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </label>
      <Input
        type="number"
        value={String(Number(value) || 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-xl text-sm"
        style={{ background: 'var(--bg-secondary)' }}
      />
      {desc && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {desc}
        </p>
      )}
    </div>
  );
}

interface TierFormModalProps {
  isOpen: boolean;
  editingId: string | null;
  /** 是否编辑系统默认等级（level 0）：名称/价格锁定，仅权益配置可改 */
  freeTier: boolean;
  form: TierFormState;
  saving: boolean;
  registryEntries: ConfigRegistryEntry[];
  registryLoading: boolean;
  onClose: () => void;
  onFormChange: (form: TierFormState) => void;
  onSave: () => void;
}

export function TierFormModal({
  isOpen,
  editingId,
  freeTier,
  form,
  saving,
  registryEntries,
  registryLoading,
  onClose,
  onFormChange,
  onSave,
}: TierFormModalProps) {
  const updateForm = (patch: Partial<TierFormState>) =>
    onFormChange({ ...form, ...patch });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingId ? t('编辑 VIP 等级') : t('新增 VIP 等级')}
      size="lg"
    >
      <div className="space-y-4">
        {!editingId && (
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('等级(数字)')}
            </label>
            <input
              type="number"
              value={String(form.level)}
              onChange={(e) => updateForm({ level: Number(e.target.value) })}
              min={1}
              max={99}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('名称')}
          </label>
          <input
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            disabled={freeTier}
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              opacity: freeTier ? 0.6 : 1,
            }}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('月基础价（元）')}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={String(form.baseMonthlyPriceYuan)}
            onChange={(e) =>
              updateForm({
                baseMonthlyPriceYuan: Math.max(
                  0,
                  parseFloat(e.target.value) || 0
                ),
              })
            }
            disabled={freeTier}
            className="w-full px-3 py-2 rounded-xl text-sm"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              opacity: freeTier ? 0.6 : 1,
            }}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {t('内部将以 {cents} 分存储', {
              cents: String(Math.round(form.baseMonthlyPriceYuan * 100)),
            })}
          </p>
          {freeTier && (
            <p className="text-xs mt-2" style={{ color: 'var(--warning)' }}>
              {t('系统默认等级，名称与价格不可修改')}
            </p>
          )}
        </div>

        {registryEntries.length > 0 && (
          <div>
            <p
              className="text-sm font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('权益配置')}
            </p>
            <div
              className="space-y-3 p-3 rounded-xl"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              {registryEntries.map((entry) => (
                <ConfigField
                  key={entry.key}
                  entry={entry}
                  value={form.configs[entry.key]}
                  onChange={(val) =>
                    updateForm({
                      configs: { ...form.configs, [entry.key]: val },
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {registryLoading && (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {t('加载配置项中...')}
          </p>
        )}

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
