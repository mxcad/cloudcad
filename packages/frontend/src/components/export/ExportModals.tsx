/**
 * ExportModals — 导出/另存为子系统自包含组件（ADR-0040）
 *
 * 内部拥有 5 组 modal state、5 个导出/另存为事件订阅（ADR-0039 类型化 bus）
 * 与全部 handler，渲染 DownloadFormatModal ×2 / PdfExportModal /
 * DwgExportModal / SaveAsModal。跨 modal 副作用（forceDownloadToLocal 复位、
 * blob 清理、save-as 转本地下载）全部收敛于组件内部，不外泄到页面。
 */
import { forwardRef, useImperativeHandle } from 'react';
import { DownloadFormatModal } from '../modals/DownloadFormatModal';
import { PdfExportModal } from '../modals/PdfExportModal';
import { DwgExportModal } from '../modals/DwgExportModal';
import { SaveAsModal } from '../modals/SaveAsModal';
import type { ExternalReferenceFile } from '@/types/filesystem';
import { useExportModals } from './useExportModals';
import type { ExportModalsOptions } from './useExportModals';

export interface ExportModalsHandle {
  /** 外部参照图纸 → 打开格式选择弹窗（CADEditorDirect 外部参照面板经命令调用） */
  openExtRefDownload: (file: ExternalReferenceFile) => void;
}

export interface ExportModalsProps extends ExportModalsOptions {}

export const ExportModals = forwardRef<ExportModalsHandle, ExportModalsProps>(
  function ExportModals(props, ref) {
    const {
      downloadFormat,
      extRefFormat,
      pdfExport,
      dwgExport,
      saveAs,
      handleExternalRefDownload,
      handleExtRefFormatDownload,
      handleDownloadWithFormat,
      handlePdfExport,
      handleDwgExport,
      handleSaveAsSuccess,
    } = useExportModals(props);

    useImperativeHandle(
      ref,
      () => ({
        openExtRefDownload: handleExternalRefDownload,
      }),
      [handleExternalRefDownload]
    );

    return (
      <>
        {/* 下载格式选择弹窗 */}
        <DownloadFormatModal
          isOpen={downloadFormat.show}
          fileName={downloadFormat.fileName}
          onClose={() => {
            downloadFormat.setShow(false);
            saveAs.forceDownloadToLocal.current = false;
            saveAs.setBlob(null);
          }}
          onDownload={handleDownloadWithFormat}
          loading={downloadFormat.loading}
        />
        {/* 外部参照下载格式选择弹窗 */}
        <DownloadFormatModal
          isOpen={extRefFormat.show}
          fileName={extRefFormat.file?.name || ''}
          onClose={() => {
            extRefFormat.setShow(false);
            extRefFormat.setFile(null);
          }}
          onDownload={handleExtRefFormatDownload}
          loading={extRefFormat.loading}
        />
        {/* PDF 导出参数弹窗 */}
        <PdfExportModal
          isOpen={pdfExport.show}
          fileName={pdfExport.fileName}
          onClose={() => {
            pdfExport.setShow(false);
            pdfExport.setBlob(null);
          }}
          onExport={handlePdfExport}
        />
        {/* DWG/DXF 导出参数弹窗 */}
        <DwgExportModal
          isOpen={dwgExport.show}
          fileName={dwgExport.fileName}
          format={dwgExport.format}
          onClose={() => {
            dwgExport.setShow(false);
            dwgExport.setBlob(null);
          }}
          onExport={handleDwgExport}
        />
        {/* 另存为弹窗 */}
        {saveAs.show && saveAs.blob && (
          <SaveAsModal
            isOpen={saveAs.show}
            currentFileName={saveAs.fileName}
            mxwebBlob={saveAs.blob}
            personalSpaceId={saveAs.personalSpaceId}
            sourceNodeId={saveAs.sourceNodeId}
            sourceFileHash={saveAs.sourceFileHash}
            onClose={() => {
              saveAs.setShow(false);
              saveAs.setBlob(null);
            }}
            onSuccess={handleSaveAsSuccess}
          />
        )}
      </>
    );
  }
);

export default ExportModals;
