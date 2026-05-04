import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { File } from 'lucide-react';
import { Download } from 'lucide-react';

export type DownloadFormat = 'dwg' | 'dxf' | 'mxweb' | 'pdf';

export interface PdfOptions {
  width?: string;
  height?: string;
  colorPolicy?: 'mono' | 'color';
}

interface DownloadFormatModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onDownload: (format: DownloadFormat, pdfOptions?: PdfOptions) => void;
  loading?: boolean;
}

export const DownloadFormatModal: React.FC<DownloadFormatModalProps> = ({
  isOpen,
  fileName,
  onClose,
  onDownload,
  loading = false,
}) => {
  const [format, setFormat] = useState<DownloadFormat>('mxweb');
  const [pdfOptions, setPdfOptions] = useState<PdfOptions>({
    width: '2000',
    height: '2000',
    colorPolicy: 'mono',
  });

  const handleClose = () => {
    setFormat('mxweb');
    setPdfOptions({
      width: '2000',
      height: '2000',
      colorPolicy: 'mono',
    });
    onClose();
  };

  const handleDownload = () => {
    if (format === 'pdf') {
      onDownload(format, pdfOptions);
    } else {
      onDownload(format);
    }
  };

  const formatLabels: Record<
    DownloadFormat,
    { label: string; icon: React.ReactNode }
  > = {
    dwg: {
      label: 'DWG 格式',
      icon: <File className="w-4 h-4" />,
    },
    dxf: {
      label: 'DXF 格式',
      icon: <File className="w-4 h-4" />,
    },
    mxweb: {
      label: 'MXWEB 格式（默认）',
      icon: <File className="w-4 h-4" />,
    },
    pdf: {
      label: 'PDF 格式',
      icon: <File className="w-4 h-4" />,
    },
  };

  // 根据选择的格式动态调整文件名
  const getDisplayFileName = (
    originalFileName: string,
    selectedFormat: DownloadFormat
  ): string => {
    // 提取文件名（去除扩展名）
    const nameWithoutExt = originalFileName.replace(/\.[^.]+$/, '');
    // 添加对应格式的扩展名
    return `${nameWithoutExt}.${selectedFormat}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="选择下载格式"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleDownload} loading={loading}>
            <Download className="w-4 h-4 mr-2" />
            下载
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
          <p
            className="text-sm"
            style={{ color: 'var(--text-secondary, #334155)' }}
          >
            <span className="font-medium">文件：</span>
            <span className="ml-2 font-mono text-sm">
              {getDisplayFileName(fileName, format)}
            </span>
          </p>
        </div>

        {/* 格式选择 */}
        <div>
          <label
            className="block text-sm font-medium mb-3"
            style={{ color: 'var(--text-secondary, #334155)' }}
          >
            选择下载格式 *
          </label>
          <div className="space-y-2">
            {(Object.keys(formatLabels) as DownloadFormat[]).map((f) => (
              <label
                key={f}
                className="flex items-center p-4 border rounded-lg cursor-pointer transition-all"
                style={{
                  borderColor:
                    format === f
                      ? 'var(--primary-500, #6366f1)'
                      : 'var(--border-default, #e2e8f0)',
                  backgroundColor:
                    format === f
                      ? 'rgba(99, 102, 241, 0.1)'
                      : 'transparent',
                  boxShadow:
                    format === f ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (format !== f) {
                    e.currentTarget.style.borderColor =
                      'var(--border-strong, #cbd5e1)';
                    e.currentTarget.style.backgroundColor =
                      'var(--bg-tertiary, #f1f5f9)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (format !== f) {
                    e.currentTarget.style.borderColor =
                      'var(--border-default, #e2e8f0)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <input
                  type="radio"
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={(e) =>
                    setFormat(e.target.value as DownloadFormat)
                  }
                  className="w-4 h-4"
                  style={{
                    accentColor: 'var(--primary-500, #6366f1)',
                  }}
                />
                <span
                  className="ml-3"
                  style={{ color: 'var(--text-primary, #0f172a)' }}
                >
                  {formatLabels[f].label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* PDF 参数（仅在选择 PDF 格式时显示） */}
        {format === 'pdf' && (
          <div
            className="rounded-lg p-4 space-y-4"
            style={{
              backgroundColor: 'var(--bg-secondary, #f8fafc)',
              border: '1px solid var(--border-default, #e2e8f0)',
            }}
          >
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-secondary, #334155)' }}
            >
              PDF 导出参数
            </p>

            {/* 宽度和高度 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary, #334155)' }}
                >
                  宽度（像素）
                </label>
                <input
                  type="text"
                  value={pdfOptions.width}
                  onChange={(e) =>
                    setPdfOptions({ ...pdfOptions, width: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-md text-sm"
                  style={{
                    backgroundColor: 'var(--bg-secondary, #ffffff)',
                    border: '1px solid var(--border-default, #e2e8f0)',
                    color: 'var(--text-primary, #0f172a)',
                  }}
                  placeholder="2000"
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary, #334155)' }}
                >
                  高度（像素）
                </label>
                <input
                  type="text"
                  value={pdfOptions.height}
                  onChange={(e) =>
                    setPdfOptions({ ...pdfOptions, height: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-md text-sm"
                  style={{
                    backgroundColor: 'var(--bg-secondary, #ffffff)',
                    border: '1px solid var(--border-default, #e2e8f0)',
                    color: 'var(--text-primary, #0f172a)',
                  }}
                  placeholder="2000"
                />
              </div>
            </div>

            {/* 颜色策略 */}
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary, #334155)' }}
              >
                颜色策略
              </label>
              <select
                value={pdfOptions.colorPolicy}
                onChange={(e) =>
                  setPdfOptions({
                    ...pdfOptions,
                    colorPolicy: e.target.value as 'mono' | 'color',
                  })
                }
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{
                  backgroundColor: 'var(--bg-secondary, #ffffff)',
                  border: '1px solid var(--border-default, #e2e8f0)',
                  color: 'var(--text-primary, #0f172a)',
                }}
              >
                <option value="mono">黑白（单色）</option>
                <option value="color">彩色</option>
              </select>
            </div>
          </div>
        )}

        {/* 格式说明 */}
        <div
          className="text-xs space-y-1"
          style={{ color: 'var(--text-tertiary, #64748b)' }}
        >
          <p>
            • <strong>MXWEB</strong>：CloudCAD 专用格式，可直接在线编辑
          </p>
          <p>
            • <strong>DWG</strong>：AutoCAD 原生格式，需要转换时间
          </p>
          <p>
            • <strong>DXF</strong>：Drawing Exchange Format，需要转换时间
          </p>
          <p>
            • <strong>PDF</strong>：便携式文档格式，需要转换时间
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default DownloadFormatModal;
