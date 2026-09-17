/**
 * ExportModals 内部 hook — DWG/DXF 导出簇（ADR-0040）
 *
 * DwgExportModal：state、EXPORT_DWG/EXPORT_DXF 订阅与 handleDwgExport。
 * 点导出立即关闭弹框，后台上传当前内存 mxweb blob（skipDb）后按 hash 创建非阻塞
 * 转换任务（任务显示在下载 tab，SSE 终态自动下载）。云图与本地图行为一致。
 */
import { useState, useCallback, useEffect } from 'react';
import { getErrorMessage } from '@/utils/errorHandler';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe } from '@/services/drawingSession';
import type { ExportDwgDetail } from '@/services/drawingSession';
import type { ToastType } from '@/components/ui/Toast';
import type { DwgExportState } from '../types';
import { uploadBlobToHash } from './uploadAndConvert';
import { useBatchDownload } from '@/hooks/file-system';

export interface DwgExportModalOptions {
  showToast: (message: string, type?: ToastType) => void;
}

export function useDwgExportModal({ showToast }: DwgExportModalOptions) {
  const { createFileHashTask } = useBatchDownload(showToast);

  useEffect(() => {
    const handleDwgExportEvent = (detail: ExportDwgDetail) => {
      setDwgExportFileName(detail.fileName);
      setDwgExportBlob(detail.blob);
      setDwgExportFormat(detail.format);
      setShowDwgExportModal(true);
    };
    const unsubDwg = subscribe(CAD_EVENTS.EXPORT_DWG, handleDwgExportEvent);
    const unsubDxf = subscribe(CAD_EVENTS.EXPORT_DXF, handleDwgExportEvent);
    return () => {
      unsubDwg();
      unsubDxf();
    };
  }, []);

  const [showDwgExportModal, setShowDwgExportModal] = useState(false);
  const [dwgExportBlob, setDwgExportBlob] = useState<Blob | null>(null);
  const [dwgExportFileName, setDwgExportFileName] = useState<string>('');
  const [dwgExportFormat, setDwgExportFormat] = useState<'dwg' | 'dxf'>('dwg');

  const handleDwgExport = useCallback(
    async (dwgVersion: number) => {
      const blob = dwgExportBlob;
      if (!blob) return;
      const fileName = dwgExportFileName;
      const format = dwgExportFormat;
      // 点导出立即关闭弹框；上传（skipDb）+ 建非阻塞转换任务在后台进行，
      // 任务显示在下载 tab，SSE 终态自动下载。云图与本地图走同一条路。
      setShowDwgExportModal(false);
      setDwgExportBlob(null);
      try {
        const hash = await uploadBlobToHash(blob);
        await createFileHashTask(hash, fileName, format, { dwgVersion });
      } catch (error) {
        // 上传失败（弹框已关闭，可重新触发命令）
        showToast(getErrorMessage(error), 'error');
      }
    },
    [
      dwgExportBlob,
      dwgExportFileName,
      dwgExportFormat,
      createFileHashTask,
      showToast,
    ]
  );

  const state: DwgExportState = {
    show: showDwgExportModal,
    setShow: setShowDwgExportModal,
    blob: dwgExportBlob,
    setBlob: setDwgExportBlob,
    fileName: dwgExportFileName,
    setFileName: setDwgExportFileName,
    format: dwgExportFormat,
    setFormat: setDwgExportFormat,
  };

  return {
    state,
    handleDwgExport,
  };
}
