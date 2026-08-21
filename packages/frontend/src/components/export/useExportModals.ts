/**
 * ExportModals 内部 hook（ADR-0040）
 *
 * 导出/另存为子系统编排：save-as 簇（state + SAVE_AS 订阅 + 成功/本地下载
 * handler）与下载/转换簇（useExportConvert）的组装。仅供
 * components/export/ExportModals.tsx 消费。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import { t } from '@/languages';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe, clearCurrentFileDeleted } from '@/services/drawingSession';
import { uploadSaveAsThumbnail } from './saveAsThumbnail';
import { useExportConvert } from './useExportConvert';

export interface ExportModalsOptions {
  fileId: string | null;
  canExport?: boolean;
  isAuthenticated?: boolean;
  loginPromptDismissedRef?: React.MutableRefObject<boolean>;
  currentFileHash?: string;
}

export function useExportModals({
  fileId,
  canExport,
  isAuthenticated,
  loginPromptDismissedRef,
  currentFileHash,
}: ExportModalsOptions) {
  const { showToast, showConfirm } = useNotification();
  const forceDownloadToLocal = useRef(false);

  // 订阅生命周期与 props 解耦：变化值走 ref，bus 订阅保持稳定
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const currentFileHashRef = useRef(currentFileHash);
  currentFileHashRef.current = currentFileHash;

  const [saveAsBlob, setSaveAsBlob] = useState<Blob | null>(null);

  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsFileName, setSaveAsFileName] = useState<string>('');
  const [saveAsPersonalSpaceId, setSaveAsPersonalSpaceId] = useState<
    string | null
  >(null);
  const [saveAsSourceNodeId, setSaveAsSourceNodeId] = useState<string | null>(
    null
  );
  const [saveAsFileHash, setSaveAsFileHash] = useState<string | null>(null);

  const convert = useExportConvert({
    fileId,
    canExport,
    saveAsBlob,
    forceDownloadToLocal,
    setSaveAsBlob,
    showToast,
  });

  useEffect(() => {
    return subscribe(CAD_EVENTS.SAVE_AS, (detail) => {
      if (loginPromptDismissedRef?.current) return;

      if (!isAuthenticatedRef.current) {
        convert.setDownloadingFileName(detail.currentFileName);
        setSaveAsBlob(detail.mxwebBlob);
        forceDownloadToLocal.current = true;
        convert.setShowDownloadFormatModal(true);
        return;
      }

      setSaveAsFileName(detail.currentFileName);
      setSaveAsBlob(detail.mxwebBlob);
      setSaveAsPersonalSpaceId(detail.personalSpaceId);
      setSaveAsSourceNodeId(detail.sourceNodeId ?? fileIdRef.current);
      setSaveAsFileHash(
        detail.sourceFileHash ?? currentFileHashRef.current ?? null
      );
      setShowSaveAsModal(true);
    });
  }, [
    loginPromptDismissedRef,
    convert.setDownloadingFileName,
    convert.setShowDownloadFormatModal,
  ]);

  const handleSaveAsSuccess = useCallback(
    async (result: {
      nodeId: string;
      fileName: string;
      path: string;
      projectId?: string;
      parentId: string;
    }) => {
      setShowSaveAsModal(false);
      setSaveAsBlob(null);
      clearCurrentFileDeleted();
      showToast(t('另存为成功'), 'success');

      const confirmPromise = showConfirm({
        title: t('打开新图纸'),
        message: t('"{fileName}" 已保存成功，是否在新标签页中打开？', {
          fileName: result.fileName,
        }),
        confirmText: t('打开'),
        cancelText: t('关闭'),
        type: 'info',
      });

      const thumbnailPromise = uploadSaveAsThumbnail(result.nodeId);

      const confirmed = await confirmPromise;
      if (confirmed) {
        window.open(
          `/cad-editor/${result.nodeId}?nodeId=${result.parentId}`,
          '_blank'
        );
      }

      await thumbnailPromise;
    },
    [showToast, showConfirm]
  );

  return {
    downloadFormat: convert.downloadFormat,
    extRefFormat: convert.extRefFormat,
    pdfExport: convert.pdfExport,
    dwgExport: convert.dwgExport,
    saveAs: {
      blob: saveAsBlob,
      setBlob: setSaveAsBlob,
      show: showSaveAsModal,
      setShow: setShowSaveAsModal,
      fileName: saveAsFileName,
      setFileName: setSaveAsFileName,
      personalSpaceId: saveAsPersonalSpaceId,
      setPersonalSpaceId: setSaveAsPersonalSpaceId,
      forceDownloadToLocal,
      sourceNodeId: saveAsSourceNodeId,
      sourceFileHash: saveAsFileHash,
    },
    handleExternalRefDownload: convert.handleExternalRefDownload,
    handleExtRefFormatDownload: convert.handleExtRefFormatDownload,
    handleDownloadWithFormat: convert.handleDownloadWithFormat,
    handlePdfExport: convert.handlePdfExport,
    handleDwgExport: convert.handleDwgExport,
    handleSaveAsSuccess,
  };
}
