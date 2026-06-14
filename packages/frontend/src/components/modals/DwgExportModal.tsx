import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Select } from '@/components/ui/Select';
import { Download } from 'lucide-react';

export interface DwgOptions {
  dwgVersion: number;
}

const DWG_VERSION_OPTIONS = [
  { value: 23, label: 'CAD 2000（默认）' },
  { value: 25, label: 'CAD 2004' },
  { value: 27, label: 'CAD 2007' },
  { value: 29, label: 'CAD 2010' },
  { value: 33, label: 'CAD 2018' },
];

interface DwgExportModalProps {
  isOpen: boolean;
  fileName: string;
  format: 'dwg' | 'dxf';
  onClose: () => void;
  onExport: (dwgVersion: number) => void;
  loading?: boolean;
}

export const DwgExportModal: React.FC<DwgExportModalProps> = ({
  isOpen,
  fileName,
  format,
  onClose,
  onExport,
  loading = false,
}) => {
  const [dwgVersion, setDwgVersion] = useState<number>(23);

  const handleClose = () => {
    setDwgVersion(23);
    onClose();
  };

  const handleExport = () => {
    onExport(dwgVersion);
  };

  const nameWithoutExt = (fileName || '').replace(/\.[^.]+$/, '');
  const displayFileName = `${nameWithoutExt}.${format}`;
  const title = format === 'dwg' ? '导出 DWG' : '导出 DXF';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnOverlayClick={!loading}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleExport} loading={loading}>
            <Download className="w-4 h-4 mr-2" />
            导出
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* 文件名 */}
        <div
          className="p-4 rounded-lg"
          style={{
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
          }}
        >
          <p style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium">文件：</span>
            <span className="ml-2 font-mono">{displayFileName}</span>
          </p>
        </div>

        {/* 版本参数 */}
        <div
          className="rounded-lg p-4 space-y-4"
          style={{
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
            border: '1px solid var(--border-default, #e2e8f0)',
          }}
        >
          <p
            className="font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {format === 'dwg' ? 'DWG' : 'DXF'} 导出参数
          </p>

          <div>
            <label
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              图纸版本
            </label>
            <Select
              value={dwgVersion}
              onChange={(val) => setDwgVersion(Number(val))}
              options={DWG_VERSION_OPTIONS}
              size="sm"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DwgExportModal;
