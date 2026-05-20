import React, { useState, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Download, Crop } from 'lucide-react';
import { useRangeExportStore } from '@/stores/rangeExportStore';
import { useLocation } from 'react-router-dom';

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
  /** 可选：文件节点 ID，用于范围导出跳转 */
  nodeId?: string;
}

export const DownloadFormatModal: React.FC<DownloadFormatModalProps> = ({
  isOpen,
  fileName,
  onClose,
  onDownload,
  loading = false,
  nodeId,
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

  const handleRangeExport = useCallback(() => {
    // 检查当前是否在 CAD 编辑器页面
    const isOnCadEditor = window.location.pathname.includes('/cad-editor');

    if (isOnCadEditor) {
      // 直接打开范围导出对话框
      onClose();
      useRangeExportStore.getState().setOpen(true);
    } else if (nodeId) {
      // 非 CAD 编辑器页面：在新标签页打开 CAD 编辑器并传入参数
      window.open(`/cad-editor/${nodeId}?openRangeExport=true`, '_blank');
    }
  }, [nodeId, onClose]);

  // 根据选择的格式动态调整文件名
  const getDisplayFileName = (
    originalFileName: string,
    selectedFormat: DownloadFormat
  ): string => {
    // 提取文件名（去除扩展名）
    const nameWithoutExt = (originalFileName || '').replace(/\.[^.]+$/, '');
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
          <p style={{ color: 'var(--text-secondary)' }}>
            <span className="font-medium">文件：</span>
            <span className="ml-2 font-mono">
              {getDisplayFileName(fileName, format)}
            </span>
          </p>
        </div>

        {/* 格式选择 */}
        <div>
          <label
            className="block font-medium mb-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            选择下载格式 *
          </label>
          <Select
            value={format}
            onChange={(val) => setFormat(val as DownloadFormat)}
            options={[
              { value: 'mxweb', label: 'MXWEB 格式（默认）' },
              { value: 'dwg', label: 'DWG 格式' },
              { value: 'dxf', label: 'DXF 格式' },
              { value: 'pdf', label: 'PDF 格式' },
            ]}
          />
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
        )}

        {/* 范围裁剪/打印入口 */}
        <div
          className="rounded-lg p-3"
          style={{
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
            border: '1px dashed var(--border-default, #e2e8f0)',
          }}
        >
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleRangeExport}
          >
            <Crop className="w-4 h-4 mr-2" />
            范围裁剪 / 打印
          </Button>
          <p
            className="text-xs mt-1 text-center"
            style={{ color: 'var(--text-tertiary)' }}
          >
            选择图纸区域后导出为 DWG/DXF/PDF/MXWEB
          </p>
        </div>

        {/* 格式说明 */}
        <div
          className="space-y-1"
          style={{ color: 'var(--text-tertiary)' }}
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
