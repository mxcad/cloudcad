///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { queryKeys } from '@/lib/queryKeys';
import { useMxCadUploadNative } from '../hooks/useMxCadUploadNative';
import { useAuth } from '../contexts/AuthContext';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferencePanel } from './modals/ExternalReferencePanel';
import { ImagePreviewModal } from './modals/ImagePreviewModal';
import { DownloadFormatModal } from './modals/DownloadFormatModal';
import { globalShowToast } from '../utils/notificationEvents';
import type { ExternalReferenceFile } from '../types/filesystem';
import type {
  DownloadFormat,
  PdfOptions,
  DwgOptions,
} from '../types/download-format';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { useUploadManager } from '../hooks/useUploadManager';
import type { UploadListener } from '../utils/uploadManager';
import {
  downloadExternalRefFile,
  fetchXrefViewBlobUrl,
  revokeXrefViewBlobUrl,
  type DownloadNodeQuery,
} from '../utils/download';
import { CAD_EXTENSIONS } from '../utils/fileUtils';
import { t } from '@/languages';

interface MxCadUploaderProps {
  nodeId?: string | (() => string);
  onSuccess?: () => void;
  onError?: (error: string) => void;
  showProgress?: boolean;
  buttonText?: string;
  buttonClassName?: string;
  onExternalReferenceSuccess?: () => void;
  onExternalReferenceSkip?: () => void;
  enableExternalReferenceCheck?: boolean;
  openAfterUpload?: boolean;
}

export interface MxCadUploaderRef {
  triggerUpload: () => void;
}

/**
 * MxCAD 文件上传组件（多文件上传版本）
 *
 * 集成 UploadManager 实现多文件并发上传管理。
 * - 文件选择器支持多文件（multiple）
 * - 上传队列管理面板在右下角
 * - openAfterUpload: 上传后是否打开图纸（默认true，列表页设为false）
 */
export const MxCadUploader = forwardRef<MxCadUploaderRef, MxCadUploaderProps>(
  (
    {
      nodeId,
      onSuccess,
      onError,
      showProgress = true,
      buttonText = t('上传 CAD 文件'),
      buttonClassName = '',
      onExternalReferenceSuccess,
      onExternalReferenceSkip,
      enableExternalReferenceCheck = true,
      openAfterUpload = true,
    },
    ref
  ) => {
    const { isAuthenticated } = useAuth();
    const [currentNodeId, setCurrentNodeId] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const { selectRawFiles } = useMxCadUploadNative();
    const { addFiles, manager } = useUploadManager({ maxConcurrent: 3 });
    const queryClient = useQueryClient();
    const unsubRef = useRef<(() => void) | null>(null);

    const externalReferenceUpload = useExternalReferenceUpload({
      nodeId: currentNodeId,
      onSuccess: () => {
        onExternalReferenceSuccess?.();
      },
      onError: (error) => {
        globalShowToast(t(`外部参照上传失败: ${error}`), 'error');
      },
      onSkip: () => {
        onExternalReferenceSkip?.();
      },
    });

    // 外部参照查看预览
    const [previewXref, setPreviewXref] = useState<{
      file: ExternalReferenceFile;
      url: string;
    } | null>(null);

    const handleViewXref = useCallback(
      async (file: ExternalReferenceFile) => {
        if (!currentNodeId) return;

        if (file.type === 'img') {
          try {
            // external-ref-view 需要 Bearer token，<img> 无法携带，走 SDK 取 blob
            const url = await fetchXrefViewBlobUrl(currentNodeId, file.name);
            setPreviewXref((prev) => {
              if (prev && prev.url !== url) revokeXrefViewBlobUrl(prev.url);
              return { file, url };
            });
          } catch (error) {
            globalShowToast(t('打开外部参照失败'), 'error');
          }
        } else {
          const fileUrl = `/api/v1/mxcad/external-ref-view/${encodeURIComponent(currentNodeId)}/${encodeURIComponent(file.name)}`;
          window.open(
            `/cad-editor?fileUrl=${encodeURIComponent(fileUrl)}`,
            '_blank'
          );
        }
      },
      [currentNodeId]
    );

    // 外部参照下载（图片直接下载，图纸走格式转换）
    const handleDownloadXref = useCallback(
      async (file: ExternalReferenceFile) => {
        if (!currentNodeId || !file.name) return;

        if (file.type === 'img') {
          try {
            // 走 SDK（自动带 token），避免 <a> 下载 401
            await downloadExternalRefFile(currentNodeId, file.name, {}, file.name);
          } catch (error) {
            globalShowToast(t('外部参照下载失败'), 'error');
          }
        } else {
          setDownloadingExtRefFile(file);
          setShowExtRefFormatModal(true);
        }
      },
      [currentNodeId]
    );

    // 外部参照格式下载
    const [showExtRefFormatModal, setShowExtRefFormatModal] = useState(false);
    const [downloadingExtRefFile, setDownloadingExtRefFile] =
      useState<ExternalReferenceFile | null>(null);
    const [extRefDownloading, setExtRefDownloading] = useState(false);

    const handleExtRefFormatDownload = async (
      format: DownloadFormat,
      pdfOptions?: PdfOptions,
      dwgOptions?: DwgOptions
    ) => {
      const file = downloadingExtRefFile;
      if (!file || !currentNodeId) return;
      setExtRefDownloading(true);
      try {
        const query: DownloadNodeQuery = { format };
        if (format === 'pdf' && pdfOptions) {
          if (pdfOptions.width) query.width = pdfOptions.width;
          if (pdfOptions.height) query.height = pdfOptions.height;
          if (pdfOptions.colorPolicy)
            query.colorPolicy = pdfOptions.colorPolicy;
        }
        if ((format === 'dwg' || format === 'dxf') && dwgOptions) {
          query.dwgVersion = String(dwgOptions.dwgVersion);
        }
        const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
        await downloadExternalRefFile(
          currentNodeId,
          file.name,
          query,
          `${nameWithoutExt}.${format}`
        );
      } catch (error) {
        globalShowToast(t('外部参照下载失败'), 'error');
      } finally {
        setExtRefDownloading(false);
        setShowExtRefFormatModal(false);
        setDownloadingExtRefFile(null);
      }
    };

    useEffect(() => {
      return () => {
        unsubRef.current?.();
        unsubRef.current = null;
      };
    }, []);

    const handleSelectFiles = useCallback(async () => {
      const effectiveNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;
      if (!isAuthenticated) {
        globalShowToast(t('请先登录后再上传文件'), 'warning');
        onError?.(t('用户未登录'));
        return;
      }

      const files = await selectRawFiles();
      if (files.length === 0) return;

      const allowedFiles = files.filter((file) => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        return CAD_EXTENSIONS.includes(ext);
      });

      if (allowedFiles.length === 0) {
        globalShowToast(
          t('所选文件类型不支持（支持 .dwg, .dxf, .mxweb）'),
          'warning'
        );
        return;
      }

      if (allowedFiles.length !== files.length) {
        globalShowToast(
          t(`已忽略 ${files.length - allowedFiles.length} 个不支持的文件类型`),
          'info'
        );
      }

      setCurrentNodeId(effectiveNodeId || '');

      if (!manager) {
        console.error('[MxCadUploader] UploadManager 未初始化，无法上传');
        globalShowToast(t('上传管理器未初始化，请刷新页面后重试'), 'error');
        return;
      }

      unsubRef.current?.();

      setIsUploading(true);
      let pendingCount = allowedFiles.length;

      const listener: UploadListener = async (event) => {
        if (event.type === 'task-processing') {
          const task = manager.getTask(event.taskId);
          if (!task?.result) return;

          try {
            if (openAfterUpload) {
              const { openUploadedFile } =
                await import('../services/mxcadManager');
              await openUploadedFile(task.result.nodeId, effectiveNodeId || '');
            } else {
              const { waitForFileReady } =
                await import('../services/mxcadManager');
              await waitForFileReady(task.result.nodeId);
            }

            manager.finalizeTask(event.taskId);
            onSuccess?.();

            pendingCount--;
            if (pendingCount <= 0) {
              setIsUploading(false);
              queryClient.invalidateQueries({
                queryKey: queryKeys.fileSystem.storageQuota,
              });
              queryClient.invalidateQueries({
                queryKey: queryKeys.fileSystem.all,
              });
            }

            // 异步检查外部参照，不阻塞上传完成状态更新
            const isSkipXrefCheck = task.fileName
              .toLowerCase()
              .endsWith('.mxweb');
            if (enableExternalReferenceCheck && !isSkipXrefCheck) {
              externalReferenceUpload.checkMissingReferences(
                task.result.nodeId,
                true,
                false
              );
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : t('文件处理失败');
            manager.failTask(event.taskId, errorMessage);
            globalShowToast(errorMessage, 'error');
            onError?.(errorMessage);

            pendingCount--;
            if (pendingCount <= 0) {
              setIsUploading(false);
              queryClient.invalidateQueries({
                queryKey: queryKeys.fileSystem.storageQuota,
              });
              queryClient.invalidateQueries({
                queryKey: queryKeys.fileSystem.all,
              });
            }
          }
        }

        if (event.type === 'task-failed') {
          pendingCount--;
          if (pendingCount <= 0) {
            setIsUploading(false);
            queryClient.invalidateQueries({
              queryKey: queryKeys.fileSystem.storageQuota,
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.fileSystem.all,
            });
          }
          const errorMsg = event.error || t('上传失败');
          globalShowToast(t(`文件上传失败: ${errorMsg}`), 'error');
        }
      };

      unsubRef.current = manager.subscribe(listener);

      addFiles(allowedFiles, effectiveNodeId || '');
    }, [
      isAuthenticated,
      nodeId,
      onSuccess,
      onError,
      selectRawFiles,
      addFiles,
      openAfterUpload,
      enableExternalReferenceCheck,
      externalReferenceUpload,
      setIsUploading,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        triggerUpload: handleSelectFiles,
      }),
      [handleSelectFiles]
    );

    return (
      <div className="mxcad-uploader">
        <Tooltip
          content={
            !isAuthenticated ? t('请先登录后再上传文件') : t('上传 CAD 文件')
          }
        >
          <Button
            data-tour="upload-btn"
            onClick={handleSelectFiles}
            disabled={isUploading || !isAuthenticated}
            variant="secondary"
            size="sm"
            loading={isUploading}
            icon={
              isUploading ? undefined : isAuthenticated ? Upload : undefined
            }
            className={buttonClassName}
          >
            {isUploading
              ? t('上传中...')
              : !isAuthenticated
                ? t('请先登录')
                : buttonText}
          </Button>
        </Tooltip>

        <ExternalReferencePanel
          isOpen={externalReferenceUpload.isOpen}
          files={externalReferenceUpload.files}
          loading={externalReferenceUpload.loading}
          mode="active"
          onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
          onReplace={externalReferenceUpload.replaceFile}
          onDownload={handleDownloadXref}
          onView={handleViewXref}
          onRefresh={externalReferenceUpload.refresh}
          onComplete={externalReferenceUpload.complete}
          onClose={externalReferenceUpload.close}
        />
        <ImagePreviewModal
          isOpen={!!previewXref}
          src={previewXref?.url || ''}
          alt={previewXref?.file.name || ''}
          onClose={() => {
            revokeXrefViewBlobUrl(previewXref?.url || '');
            setPreviewXref(null);
          }}
        />
        <DownloadFormatModal
          isOpen={showExtRefFormatModal}
          fileName={downloadingExtRefFile?.name || ''}
          onClose={() => {
            setShowExtRefFormatModal(false);
            setDownloadingExtRefFile(null);
          }}
          onDownload={handleExtRefFormatDownload}
          loading={extRefDownloading}
        />
      </div>
    );
  }
);

MxCadUploader.displayName = 'MxCadUploader';

export default MxCadUploader;
