import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '@/components/ui/Input';
import { t } from '@/languages';

const MXWEB_SUFFIX = '.mxweb';

interface NewDrawingModalProps {
  isOpen: boolean;
  drawingName: string;
  loading: boolean;
  onClose: () => void;
  onDrawingNameChange: (name: string) => void;
  onCreate: () => void;
}

export const NewDrawingModal: React.FC<NewDrawingModalProps> = ({
  isOpen,
  drawingName,
  loading,
  onClose,
  onDrawingNameChange,
  onCreate,
}) => {
  const handleClose = () => {
    onDrawingNameChange('');
    onClose();
  };

  const handleNameChange = (value: string) => {
    if (value.endsWith(MXWEB_SUFFIX)) {
      value = value.slice(0, -MXWEB_SUFFIX.length);
    }
    onDrawingNameChange(value);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("新建图纸")}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t("取消")}
          </Button>
          <Button onClick={onCreate}>{t("创建")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {t("名称")}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ flex: 1 }}>
              <Input
                value={drawingName}
                onChange={(e) => handleNameChange(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && onCreate()}
                placeholder={t("请输入图纸名称")}
                autoFocus
              />
            </div>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', userSelect: 'none' }}>
              {MXWEB_SUFFIX}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default NewDrawingModal;
