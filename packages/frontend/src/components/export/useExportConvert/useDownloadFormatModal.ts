/**
 * ExportModals 内部 hook — 下载格式选择簇（ADR-0040）
 *
 * 节点下载 + save-as 本地下载联动的 DownloadFormatModal：state、EXPORT_FILE
 * 订阅与 handleDownloadWithFormat。saveAsBlob / forceDownloadToLocal /
 * setSaveAsBlob 由主 hook 注入（save-as 联动）。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { downloadControllerDownloadNodeWithFormat } from '@/api-sdk';
import { triggerBlobDownload } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe } from '@/services/drawingSession';
import {
  canExportDownload,
  handleVipFeatureRequiredError,
} from '@/utils/vipFeatureGuide';
import { useMembership } from '@/hooks/useMembership';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import type {
  DownloadFormat,
  PdfOptions,
  DwgOptions,
} from '@/types/download-format';
import type { ToastType } from '@/components/ui/Toast';
import type { DownloadFormatState } from '../types';
import { uploadAndConvert } from './uploadAndConvert';

export interface DownloadFormatModalOptions {
  canExport?: boolean;
  /** save-as 本地下载联动：pending 的 mxweb blob（主 hook 持有） */
  saveAsBlob: Blob | null;
  /** save-as 本地下载联动：强制本地下载标记（主 hook 持有） */
  forceDownloadToLocal: React.MutableRefObject<boolean>;
  setSaveAsBlob: React.Dispatch<React.SetStateAction<Blob | null>>;
  showToast: (message: string, type?: ToastType) => void;
}

export function useDownloadFormatModal({
  canExport,
  saveAsBlob,
  forceDownloadToLocal,
  setSaveAsBlob,
  showToast,
}: DownloadFormatModalOptions) {
  // 订阅生命周期与 props 解耦：变化值走 ref，bus 订阅保持稳定
  const canExportRef = useRef(canExport);
  canExportRef.current = canExport;

  useEffect(() => {
    return subscribe(CAD_EVENTS.EXPORT_FILE, (detail) => {
      if (!canExportRef.current) {
        showToast(t('您没有导出图纸的权限'), 'warning');
        return;
      }
      setDownloadingNodeId(detail.fileId);
      setDownloadingFileName(detail.fileName);
      setShowDownloadFormatModal(true);
    });
  }, [showToast]);

  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNodeId, setDownloadingNodeId] = useState<string>('');
  const [downloadingFileName, setDownloadingFileName] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  const membership = useMembership();
  const { config } = useRuntimeConfig();

  const handleDownloadWithFormat = useCallback(
    async (
      format: DownloadFormat,
      pdfOptions?: PdfOptions,
      dwgOptions?: DwgOptions
    ) => {
      // 导出下载方向（mxweb → 其他格式）预检：非 VIP 且开关未开放时弹购买引导，不发请求
      if (
        format !== 'mxweb' &&
        !canExportDownload(
          !!membership?.isVip,
          config.freeExportDownloadEnabled
        )
      ) {
        await handleVipFeatureRequiredError();
        return;
      }
      try {
        setDownloading(true);

        if (forceDownloadToLocal.current && saveAsBlob) {
          const params: Record<string, unknown> = {};
          if (pdfOptions) {
            params.width = pdfOptions.width;
            params.height = pdfOptions.height;
            params.colorPolicy = pdfOptions.colorPolicy;
          }
          if (dwgOptions) {
            params.dwgVersion = dwgOptions.dwgVersion;
          }

          const blob = await uploadAndConvert(saveAsBlob, format, params);
          const nameWithoutExt = downloadingFileName.replace(/\.[^.]+$/, '');
          triggerBlobDownload(blob, `${nameWithoutExt}.${format}`);
          setShowDownloadFormatModal(false);
          setSaveAsBlob(null);
          forceDownloadToLocal.current = false;
          showToast(t('文件已保存到本地'), 'success');
          return;
        }

        const result = await downloadControllerDownloadNodeWithFormat({
          path: { nodeId: downloadingNodeId },
          query: { format, ...pdfOptions, ...dwgOptions },
        });
        if (result?.error) throw result.error;
        const blobData = result?.data;
        const blob =
          blobData instanceof Blob
            ? blobData
            : new Blob([blobData as BlobPart]);
        const nameWithoutExt = downloadingFileName.replace(/\.[^.]+$/, '');
        triggerBlobDownload(blob, `${nameWithoutExt}.${format}`);
        setShowDownloadFormatModal(false);
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      } finally {
        setDownloading(false);
      }
    },
    [
      downloadingNodeId,
      downloadingFileName,
      saveAsBlob,
      showToast,
      setSaveAsBlob,
      membership?.isVip,
      config.freeExportDownloadEnabled,
    ]
  );

  const state: DownloadFormatState = {
    show: showDownloadFormatModal,
    setShow: setShowDownloadFormatModal,
    nodeId: downloadingNodeId,
    setNodeId: setDownloadingNodeId,
    fileName: downloadingFileName,
    setFileName: setDownloadingFileName,
    loading: downloading,
  };

  return {
    state,
    handleDownloadWithFormat,
    setDownloadingFileName,
    setShowDownloadFormatModal,
  };
}
