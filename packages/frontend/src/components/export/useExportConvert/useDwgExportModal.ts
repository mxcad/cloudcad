/**
 * ExportModals 内部 hook — DWG/DXF 导出簇（ADR-0040）
 *
 * DwgExportModal：state、EXPORT_DWG/EXPORT_DXF 订阅与 handleDwgExport。
 */
import { useState, useCallback, useEffect } from 'react';
import { saveAsFileDialog } from 'mxcad';
import { getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe } from '@/services/drawingSession';
import type { ExportDwgDetail } from '@/services/drawingSession';
import type { ToastType } from '@/components/ui/Toast';
import type { DwgExportState } from '../types';
import { uploadAndConvert } from './uploadAndConvert';

export interface DwgExportModalOptions {
  showToast: (message: string, type?: ToastType) => void;
}

export function useDwgExportModal({ showToast }: DwgExportModalOptions) {
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
  const [dwgExporting, setDwgExporting] = useState(false);

  const handleDwgExport = useCallback(
    async (dwgVersion: number) => {
      if (!dwgExportBlob) return;
      try {
        setDwgExporting(true);
        const blob = await uploadAndConvert(dwgExportBlob, dwgExportFormat, {
          dwgVersion,
        });
        const nameWithoutExt = dwgExportFileName.replace(/\.[^.]+$/, '');
        const saved = await saveAsFileDialog({
          blob,
          filename: `${nameWithoutExt}.${dwgExportFormat}`,
          types: [
            {
              description: `${dwgExportFormat.toUpperCase()} ${t('文件')}`,
              accept: {
                'application/octet-stream': [`.${dwgExportFormat}`],
              },
            },
          ],
        });
        if (saved !== false) {
          setShowDwgExportModal(false);
          setDwgExportBlob(null);
          showToast(
            `${dwgExportFormat.toUpperCase()} ${t('文件已保存到本地')}`,
            'success'
          );
        }
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      } finally {
        setDwgExporting(false);
      }
    },
    [dwgExportBlob, dwgExportFileName, dwgExportFormat, showToast]
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
    exporting: dwgExporting,
  };

  return {
    state,
    handleDwgExport,
  };
}
