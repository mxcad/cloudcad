/**
 * ExportModals 内部 hook — 外部参照下载簇（ADR-0040）
 *
 * 外部参照图纸下载的 DownloadFormatModal：state 与
 * handleExternalRefDownload / handleExtRefFormatDownload。
 */
import { useState, useCallback } from "react";
import {
  mxcadFileAccessControllerGetFileDownloadExternalRef,
  publicFileControllerDownloadExternalRef,
} from "@/api-sdk";
import { triggerBlobDownload } from "@/utils/download";
import { getErrorMessage } from "@/utils/errorHandler";
import { t } from "@/languages";
import type {
  DownloadFormat,
  PdfOptions,
  DwgOptions,
} from "@/types/download-format";
import type { ExternalReferenceFile } from "@/types/filesystem";
import type { ToastType } from "@/components/ui";
import type { ExtRefFormatState } from "../types";

export interface ExtRefFormatModalOptions {
  fileId: string | null;
  /** 当前图纸文件 hash：游客态（fileId 为空）下载外部参照时经公开端点定位 */
  currentFileHash?: string;
  showToast: (message: string, type?: ToastType) => void;
}

export function useExtRefFormatModal({
  fileId,
  currentFileHash,
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
    [],
  );

  const handleExtRefFormatDownload = useCallback(
    async (
      format: DownloadFormat,
      pdfOptions?: PdfOptions,
      dwgOptions?: DwgOptions,
    ) => {
      const extRefFile = downloadingExtRefFile;
      if (!extRefFile) return;
      setExtRefDownloading(true);
      try {
        const query: Record<string, string> = { format };
        if (format === "pdf" && pdfOptions) {
          if (pdfOptions.width) query.width = pdfOptions.width;
          if (pdfOptions.height) query.height = pdfOptions.height;
          if (pdfOptions.colorPolicy)
            query.colorPolicy = pdfOptions.colorPolicy;
        }
        if ((format === "dwg" || format === "dxf") && dwgOptions) {
          query.dwgVersion = String(dwgOptions.dwgVersion);
        }
        // 登录态：走私有端点（nodeId）；游客态：走公开端点（fileHash）。
        // 两者皆无（无 fileId 且无 currentFileHash）时无法定位，静默返回。
        let blobData: Blob | File | undefined;
        if (fileId) {
          const result =
            await mxcadFileAccessControllerGetFileDownloadExternalRef({
              throwOnError: true,
              path: { nodeId: fileId, fileName: extRefFile.name },
              query,
            });
          blobData = result?.data as Blob | File | undefined;
        } else if (currentFileHash) {
          const result = await publicFileControllerDownloadExternalRef({
            throwOnError: true,
            path: { hash: currentFileHash, filename: extRefFile.name },
            query,
          });
          blobData = result?.data as Blob | File | undefined;
        }
        if (!blobData) return;
        const blob =
          blobData instanceof Blob
            ? blobData
            : new Blob([blobData as BlobPart]);
        const nameWithoutExt = extRefFile.name.replace(/\.[^.]+$/, "");
        triggerBlobDownload(blob, `${nameWithoutExt}.${format}`);
      } catch (error) {
        showToast(getErrorMessage(error), "error");
      } finally {
        setExtRefDownloading(false);
        setShowExtRefFormatModal(false);
        setDownloadingExtRefFile(null);
      }
    },
    [fileId, currentFileHash, downloadingExtRefFile, showToast],
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
