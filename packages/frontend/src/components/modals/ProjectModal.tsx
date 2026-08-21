import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import type { FileSystemNode, TransferMode, TransferSettings } from '../../types/filesystem';
import { t } from '@/languages';

export type { TransferMode, TransferSettings };

/** 跨项目转移 6 域字段（仅这些字段应被序列化进 transfer-settings 请求体） */
const TRANSFER_KEYS: (keyof TransferSettings)[] = [
  'transferOutToProject',
  'transferOutToPersonalSpace',
  'transferOutToLibrary',
  'transferInFromProject',
  'transferInFromPersonalSpace',
  'transferInFromLibrary',
];

/**
 * 仅提取跨项目转移字段。
 * transferSettings 传入的是整个 FileSystemNode（其 extends TransferSettings），
 * 若原样展开会把 id/name/parentId 等无关字段一并塞进 body，
 * 触发后端 DTO 的 forbidNonWhitelisted → "请求参数验证失败"。
 */
function pickTransferSettings(
  value: TransferSettings | null | undefined
): TransferSettings {
  const result: TransferSettings = {};
  for (const key of TRANSFER_KEYS) {
    if (value && value[key] !== undefined) result[key] = value[key];
  }
  return result;
}

interface ProjectModalProps {
  isOpen: boolean;
  editingProject: FileSystemNode | null;
  formData: { name: string; description: string };
  loading: boolean;
  onClose: () => void;
  onFormDataChange: (data: { name: string; description: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
  /** 跨项目转移设置（编辑项目当前值；PROJECT_TRANSFER_MANAGE 时显示） */
  transferSettings?: TransferSettings | null;
  /** 是否有跨项目转移管理权限（PROJECT_TRANSFER_MANAGE） */
  canManageTransferSettings?: boolean;
  /** 变更回调（选择即保存，外部调 PUT transfer-settings） */
  onTransferSettingsChange?: (settings: TransferSettings) => void;
}

/** 四态模式选项 + 出向/入向 6 域标签（组件内构建：模块级 t() 会失去语言切换响应式） */
function useTransferItems() {
  const modeOptions = [
    { value: 'NONE', label: t('禁止') },
    { value: 'COPY_ONLY', label: t('仅复制') },
    { value: 'MOVE_ONLY', label: t('仅移动') },
    { value: 'ALL', label: t('复制+移动') },
  ];
  const outItems: { key: keyof TransferSettings; label: string }[] = [
    { key: 'transferOutToProject', label: t('移出到其他项目') },
    { key: 'transferOutToPersonalSpace', label: t('移出到个人空间') },
    { key: 'transferOutToLibrary', label: t('移出到公共库') },
  ];
  const inItems: { key: keyof TransferSettings; label: string }[] = [
    { key: 'transferInFromProject', label: t('从其他项目移入') },
    { key: 'transferInFromPersonalSpace', label: t('从个人空间移入') },
    { key: 'transferInFromLibrary', label: t('从公共库移入') },
  ];
  return { modeOptions, outItems, inItems };
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  editingProject,
  formData,
  loading,
  onClose,
  onFormDataChange,
  onSubmit,
  transferSettings,
  canManageTransferSettings,
  onTransferSettingsChange,
}) => {
  // 本地维护当前值（打开时同步外部传入；变更即回调外部保存）
  const [localSettings, setLocalSettings] = useState<TransferSettings>(
    () => pickTransferSettings(transferSettings)
  );
  useEffect(() => {
    if (isOpen) setLocalSettings(pickTransferSettings(transferSettings));
  }, [isOpen, transferSettings]);

  const { modeOptions, outItems, inItems } = useTransferItems();

  const handleClose = () => {
    onFormDataChange({ name: '', description: '' });
    onClose();
  };

  const showTransferSection =
    !!editingProject &&
    canManageTransferSettings === true &&
    !!onTransferSettingsChange;

  const handleTransferChange = (key: keyof TransferSettings, value: string) => {
    const next = pickTransferSettings({
      ...localSettings,
      [key]: value as TransferMode,
    });
    setLocalSettings(next);
    onTransferSettingsChange?.(next);
  };

  const renderGroup = (
    items: { key: keyof TransferSettings; label: string }[]
  ) => (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-3">
          <span
            className="text-xs shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            {item.label}
          </span>
          <Select
            size="sm"
            value={localSettings[item.key] ?? 'ALL'}
            options={modeOptions}
            onChange={(value) => handleTransferChange(item.key, value)}
            className="w-[110px]"
          />
        </div>
      ))}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={editingProject ? t('编辑项目') : t('创建新项目')}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t('取消')}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={loading || !(formData?.name || '').trim()}
            data-tour="project-create-submit"
          >
            {loading ? t('处理中...') : editingProject ? t('保存') : t('创建')}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            className="block font-medium mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('名称 *')}
          </label>
          <Input
            required
            value={formData.name}
            onChange={(e) =>
              onFormDataChange({ ...formData, name: e.target.value })
            }
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            placeholder={t('请输入名称')}
            autoFocus
            maxLength={100}
            data-tour="project-name-input"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {formData.name.length}/100
          </p>
        </div>
        <div>
          <label
            className="block font-medium mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('描述')}
          </label>
          <Textarea
            value={formData.description}
            onChange={(e) =>
              onFormDataChange({ ...formData, description: e.target.value })
            }
            rows={3}
            resize="none"
            placeholder={t('请输入描述（可选）')}
            maxLength={500}
            data-tour="project-desc-input"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {formData.description.length}/500
          </p>
        </div>
        {showTransferSection && (
          <div
            className="border rounded-[3px] p-3 space-y-3"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <div>
              <div
                className="font-medium text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('跨项目转移')}
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {t(
                  '控制本项目文件可被跨项目复制/移动，以及可接收的来源；变更即时生效'
                )}
              </p>
            </div>
            {renderGroup(outItems)}
            <div
              className="border-t pt-2"
              style={{ borderColor: 'var(--border-default)' }}
            >
              {renderGroup(inItems)}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};

export default ProjectModal;
