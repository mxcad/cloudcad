/**
 * ExportModals 内部 hook — 外部参照下载簇（ADR-0040）
 *
 * 外部参照图纸下载的 DownloadFormatModal：state 与
 * handleExternalRefDownload / handleExtRefFormatDownload。
 */
import { useState, useCallback } from 'react';
import { mxcadFileAccessControllerGetFileDownloadExternalRef } from '@/api-sdk';
import { triggerBlobDownload } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';
import type {
  DownloadFormat,
  PdfOptions,
  DwgOptions,
} from '@/types/download-format';
import type { ExternalReferenceFile } from '@/types/filesystem';
import type { ToastType } from '@/components/ui/Toast';
import type { ExtRefFormatState } from '../types';

export interface ExtRefFormatModalOptions {
  fileId: string | null;
  showToast: (message: string, type?: ToastType) => void;
}

export function useExtRefFormatModal({
  fileId,
  showToast,
}: ExtRefFormatModalOptions) {
  const [showExtRefFormatModal, setShowExtRefFormatModal] = useState(false);
  const [downloadingExtRefFile, setDownloadingExtRefFile] =
    useState<ExternalReferenceFile | null>(null);
  const [extRefDownloading, setExtRefDownloading] = useState(false);

  const handleExternalRefDownload = useCallback(
    (file: ExternalReferenceFile) => {
      setDownloadingExtRefFile(file);
      setShowExtRefFormatModal(true);
    },
    []
  );

  const handleExtRefFormatDownload = useCallback(
    async (
      format: DownloadFormat,
      pdfOptions?: PdfOptions,
      dwgOptions?: DwgOptions
    ) => {
      const extRefFile = downloadingExtRefFile;
      if (!extRefFile || !fileId) return;
      setExtRefDownloading(true);
      try {
        const query: Record<string, string> = { format };
        if (format === 'pdf' && pdfOptions) {
          if (pdfOptions.width) query.width = pdfOptions.width;
          if (pdfOptions.height) query.height = pdfOptions.height;
          if (pdfOptions.colorPolicy)
            query.colorPolicy = pdfOptions.colorPolicy;
        }
        if ((format === 'dwg' || format === 'dxf') && dwgOptions) {
          query.dwgVersion = String(dwgOptions.dwgVersion);
        }
        const result =
          await mxcadFileAccessControllerGetFileDownloadExternalRef({
            path: { nodeId: fileId, fileName: extRefFile.name },
            query,
          });
        if (result?.error) throw result.error;
        const blobData = result?.data;
        const blob =
          blobData instanceof Blob
            ? blobData
            : new Blob([blobData as BlobPart]);
        const nameWithoutExt = extRefFile.name.replace(/\.[^.]+$/, '');
        triggerBlobDownload(blob, `${nameWithoutExt}.${format}`);
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      } finally {
        setExtRefDownloading(false);
        setShowExtRefFormatModal(false);
        setDownloadingExtRefFile(null);
      }
    },
    [fileId, downloadingExtRefFile, showToast]
  );

  const state: ExtRefFormatState = {
    show: showExtRefFormatModal,
    setShow: setShowExtRefFormatModal,
    file: downloadingExtRefFile,
    setFile: setDownloadingExtRefFile,
    loading: extRefDownloading,
  };

  return {
    state,
    handleExternalRefDownload,
    handleExtRefFormatDownload,
  };
}
