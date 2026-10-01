import { useCallback } from 'react';
import { nodeControllerGetNode } from '@/api-sdk';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';

export interface UseFileInsertOptions {
  isHomeMode: boolean;
  isAuthenticated: boolean;
  personalSpaceId: string | null;
  loginPromptDismissedRef: React.MutableRefObject<boolean>;
  currentFileIdRef: React.MutableRefObject<string | null>;
  setLoginPromptAction: (action: string) => void;
  setShowLoginPrompt: (show: boolean) => void;
}

export function useFileInsert({
  isHomeMode,
  isAuthenticated,
  personalSpaceId,
  loginPromptDismissedRef,
  currentFileIdRef,
  setLoginPromptAction,
  setShowLoginPrompt,
}: UseFileInsertOptions) {
  const { showToast } = useNotification();

  const handleInsertFile = useCallback(
    async (file: { nodeId: string; filename: string }) => {
      if (isHomeMode) {
        if (isAuthenticated) {
          try {
            const { openUploadedFile } =
              await import('../services/mxcadManager');
            // URL 由打开成功事件（onFileOpened）统一写入，这里不再抢先写：
            // 抢先写会让失败打开留下「已打开」的假 URL
            await openUploadedFile(file.nodeId, personalSpaceId || '');
          } catch (error) {
            showToast(getErrorMessage(error), 'error');
          }
        } else {
          if (loginPromptDismissedRef.current) return;
          setLoginPromptAction(t('打开文件'));
          setShowLoginPrompt(true);
        }
        return;
      }

      try {
        const { data: targetFile } = await nodeControllerGetNode({
          path: { nodeId: file.nodeId },
        });

        if (targetFile?.deletedAt) {
          return;
        }

        const currentFileId = currentFileIdRef.current;
        if (!currentFileId) return;

        const { data: currentFile } = await nodeControllerGetNode({
          path: { nodeId: currentFileId },
        });

        let uploadTargetNodeId = currentFile?.parentId || '';
        if (currentFile?.isRoot && currentFile?.id) {
          uploadTargetNodeId = currentFile.id;
        }

        const { openUploadedFile } = await import('../services/mxcadManager');

        // URL 与 currentFileIdRef 同样由打开成功事件统一写入，不在打开前抢先写
        await openUploadedFile(file.nodeId, uploadTargetNodeId);
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t('打开文件失败'),
          'error'
        );
      }
    },
    [
      isHomeMode,
      isAuthenticated,
      personalSpaceId,
      loginPromptDismissedRef,
      currentFileIdRef,
      setLoginPromptAction,
      setShowLoginPrompt,
      showToast,
    ]
  );

  return { handleInsertFile };
}
