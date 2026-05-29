import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Download } from 'lucide-react';

export interface PdfOptions {
  width?: string;
  height?: string;
  colorPolicy?: 'mono' | 'color';
}

interface PdfExportModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onExport: (pdfOptions: PdfOptions) => void;
  loading?: boolean;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  fileName,
  onClose,
  onExport,
  loading = false,
}) => {
  const [pdfOptions, setPdfOptions] = useState<PdfOptions>({
    width: '2000',
    height: '2000',
    colorPolicy: 'mono',
  });

  const handleClose = () => {
    setPdfOptions({
      width: '2000',
      height: '2000',
      colorPolicy: 'mono',
    });
    onClose();
  };

  const handleExport = () => {
    onExport(pdfOptions);
  };

  const nameWithoutExt = (fileName || '').replace(/\.[^.]+$/, '');
  const displayFileName = `${nameWithoutExt}.pdf`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="导出 PDF"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
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

        {/* PDF 导出参数 */}
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
            PDF 导出参数
          </p>

          {/* 宽度和高度 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                className="block font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                宽度（像素）
              </label>
              <Input
                value={pdfOptions.width}
                onChange={(e) =>
                  setPdfOptions({ ...pdfOptions, width: e.target.value })
                }
                placeholder="2000"
              />
            </div>
            <div>
              <label
                className="block font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                高度（像素）
              </label>
              <Input
                value={pdfOptions.height}
                onChange={(e) =>
                  setPdfOptions({ ...pdfOptions, height: e.target.value })
                }
                placeholder="2000"
              />
            </div>
          </div>

          {/* 颜色策略 */}
          <div>
            <label
              className="block font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              颜色策略
            </label>
            <Select
              value={pdfOptions.colorPolicy}
              onChange={(val) =>
                setPdfOptions({
                  ...pdfOptions,
                  colorPolicy: val as 'mono' | 'color',
                })
              }
              options={[
                { value: 'mono', label: '黑白（单色）' },
                { value: 'color', label: '彩色' },
              ]}
              size="sm"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PdfExportModal;
