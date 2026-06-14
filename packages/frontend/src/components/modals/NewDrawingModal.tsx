import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '@/components/ui/Input';

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="新建图纸"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={onCreate}>创建</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            名称
          </label>
          <Input
            value={drawingName}
            onChange={(e) => onDrawingNameChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onCreate()}
            placeholder="请输入图纸名称"
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
};

export default NewDrawingModal;
