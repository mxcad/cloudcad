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
            await openUploadedFile(file.nodeId, personalSpaceId || '');
            window.history.replaceState(
              null,
              '',
              `/cad-editor/${file.nodeId}?nodeId=${personalSpaceId || ''}`
            );
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

        window.history.replaceState(
          null,
          '',
          `/cad-editor/${file.nodeId}?nodeId=${uploadTargetNodeId}`
        );

        await openUploadedFile(file.nodeId, uploadTargetNodeId);

        currentFileIdRef.current = file.nodeId;
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
