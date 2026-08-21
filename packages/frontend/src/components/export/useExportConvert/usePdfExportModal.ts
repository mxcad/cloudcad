/**
 * ExportModals 内部 hook — PDF 导出簇（ADR-0040）
 *
 * PdfExportModal：state、EXPORT_PDF 订阅与 handlePdfExport。
 */
import { useState, useCallback, useEffect } from 'react';
import { saveAsFileDialog } from 'mxcad';
import { getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe } from '@/services/drawingSession';
import type { PdfOptions } from '@/types/download-format';
import type { ToastType } from '@/components/ui/Toast';
import type { PdfExportState } from '../types';
import { uploadAndConvert } from './uploadAndConvert';

export interface PdfExportModalOptions {
  showToast: (message: string, type?: ToastType) => void;
}

export function usePdfExportModal({ showToast }: PdfExportModalOptions) {
  useEffect(() => {
    return subscribe(CAD_EVENTS.EXPORT_PDF, (detail) => {
      setPdfExportFileName(detail.fileName);
      setPdfExportBlob(detail.blob);
      setShowPdfExportModal(true);
    });
  }, []);

  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const [pdfExportBlob, setPdfExportBlob] = useState<Blob | null>(null);
  const [pdfExportFileName, setPdfExportFileName] = useState<string>('');
  const [pdfExporting, setPdfExporting] = useState(false);

  const handlePdfExport = useCallback(
    async (pdfOptions: PdfOptions) => {
      if (!pdfExportBlob) return;
      try {
        setPdfExporting(true);
        const blob = await uploadAndConvert(pdfExportBlob, 'pdf', {
          width: pdfOptions.width,
          height: pdfOptions.height,
          colorPolicy: pdfOptions.colorPolicy,
        });
        const nameWithoutExt = pdfExportFileName.replace(/\.[^.]+$/, '');
        const saved = await saveAsFileDialog({
          blob,
          filename: `${nameWithoutExt}.pdf`,
          types: [
            {
              description: t('PDF 文件'),
              accept: { 'application/octet-stream': ['.pdf'] },
            },
          ],
        });
        if (saved !== false) {
          setShowPdfExportModal(false);
          setPdfExportBlob(null);
          showToast(t('PDF 文件已保存到本地'), 'success');
        }
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      } finally {
        setPdfExporting(false);
      }
    },
    [pdfExportBlob, pdfExportFileName, showToast]
  );

  const state: PdfExportState = {
    show: showPdfExportModal,
    setShow: setShowPdfExportModal,
    blob: pdfExportBlob,
    setBlob: setPdfExportBlob,
    fileName: pdfExportFileName,
    setFileName: setPdfExportFileName,
    exporting: pdfExporting,
  };

  return {
    state,
    handlePdfExport,
  };
}
