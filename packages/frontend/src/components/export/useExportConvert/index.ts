/**
 * ExportModals 内部 hook — 下载/转换簇组装（ADR-0040）
 *
 * 组合 4 个导出簇子 hook（下载格式 / 外部参照 / PDF / DWG-DXF），
 * 对外暴露与旧 useExportConvert 完全一致的接口。
 * 仅供 components/export/useExportModals.ts 消费。
 */
import { useDownloadFormatModal } from './useDownloadFormatModal';
import { useExtRefFormatModal } from './useExtRefFormatModal';
import { usePdfExportModal } from './usePdfExportModal';
import { useDwgExportModal } from './useDwgExportModal';
import type { ToastType } from '@/components/ui/Toast';

export interface UseExportConvertOptions {
  fileId: string | null;
  canExport?: boolean;
  /** save-as 本地下载联动：pending 的 mxweb blob（主 hook 持有） */
  saveAsBlob: Blob | null;
  /** save-as 本地下载联动：强制本地下载标记（主 hook 持有） */
  forceDownloadToLocal: React.MutableRefObject<boolean>;
  setSaveAsBlob: React.Dispatch<React.SetStateAction<Blob | null>>;
  showToast: (message: string, type?: ToastType) => void;
}

export function useExportConvert(options: UseExportConvertOptions) {
  const { fileId, showToast } = options;
  const download = useDownloadFormatModal(options);
  const extRef = useExtRefFormatModal({ fileId, showToast });
  const pdf = usePdfExportModal({ showToast });
  const dwg = useDwgExportModal({ showToast });

  return {
    downloadFormat: download.state,
    extRefFormat: extRef.state,
    pdfExport: pdf.state,
    dwgExport: dwg.state,
    handleExternalRefDownload: extRef.handleExternalRefDownload,
    handleExtRefFormatDownload: extRef.handleExtRefFormatDownload,
    handleDownloadWithFormat: download.handleDownloadWithFormat,
    handlePdfExport: pdf.handlePdfExport,
    handleDwgExport: dwg.handleDwgExport,
    setDownloadingFileName: download.setDownloadingFileName,
    setShowDownloadFormatModal: download.setShowDownloadFormatModal,
  };
}
