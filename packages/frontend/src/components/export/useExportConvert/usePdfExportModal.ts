/**
 * ExportModals 内部 hook — PDF 导出簇（ADR-0040）
 *
 * PdfExportModal：state、EXPORT_PDF 订阅与 handlePdfExport。
 * 点导出立即关闭弹框，后台上传当前内存 mxweb blob（skipDb）后按 hash 创建非阻塞
 * 转换任务（任务显示在下载 tab，SSE 终态自动下载）。云图与本地图行为一致。
 */
import { useState, useCallback, useEffect } from 'react';
import { getErrorMessage } from '@/utils/errorHandler';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe } from '@/services/drawingSession';
import type { PdfOptions } from '@/types/download-format';
import type { ToastType } from '@/components/ui/Toast';
import type { PdfExportState } from '../types';
import { uploadBlobToHash } from './uploadAndConvert';
import { useBatchDownload } from '@/hooks/file-system';

export interface PdfExportModalOptions {
  showToast: (message: string, type?: ToastType) => void;
}

export function usePdfExportModal({ showToast }: PdfExportModalOptions) {
  const { createFileHashTask } = useBatchDownload(showToast);

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

  const handlePdfExport = useCallback(
    async (pdfOptions: PdfOptions) => {
      const blob = pdfExportBlob;
      if (!blob) return;
      const fileName = pdfExportFileName;
      // 点导出立即关闭弹框；上传（skipDb）+ 建非阻塞转换任务在后台进行，
      // 任务显示在下载 tab，SSE 终态自动下载。
      setShowPdfExportModal(false);
      setPdfExportBlob(null);
      try {
        const hash = await uploadBlobToHash(blob);
        await createFileHashTask(hash, fileName, 'pdf', {
          width: pdfOptions.width,
          height: pdfOptions.height,
          colorPolicy: pdfOptions.colorPolicy,
        });
      } catch (error) {
        // 上传失败（弹框已关闭，可重新触发命令）
        showToast(getErrorMessage(error), 'error');
      }
    },
    [pdfExportBlob, pdfExportFileName, createFileHashTask, showToast]
  );

  const state: PdfExportState = {
    show: showPdfExportModal,
    setShow: setShowPdfExportModal,
    blob: pdfExportBlob,
    setBlob: setPdfExportBlob,
    fileName: pdfExportFileName,
    setFileName: setPdfExportFileName,
  };

  return {
    state,
    handlePdfExport,
  };
}
