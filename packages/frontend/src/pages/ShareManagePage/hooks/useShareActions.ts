import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  shareControllerRevokeShare,
  shareControllerUpdateShare,
} from '@/api-sdk';
import type { ShareListItemDto } from '@/api-sdk';
import { useNotification } from '@/contexts/NotificationContext';
import { getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';
import { useCopy } from '@/hooks/useCopy';
import type { ShareFileInfo, SortConfig } from '../types';

interface UseShareActionsParams {
  fetchShares: (p: number, q: string, s: SortConfig) => Promise<void>;
  setItems: Dispatch<SetStateAction<ShareListItemDto[]>>;
  setTotal: Dispatch<SetStateAction<number>>;
  page: number;
  search: string;
  sort: SortConfig;
  selectedTokens: Set<string>;
}

export function useShareActions({
  fetchShares,
  setItems,
  setTotal,
  page,
  search,
  sort,
  selectedTokens,
}: UseShareActionsParams) {
  const { showToast } = useNotification();

  const {
    copiedMarker: copiedToken,
    copy: copyShareItem,
  } = useCopy({ successMessage: t('链接已复制'), failMessage: t('复制失败') });
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [shareFiles, setShareFiles] = useState<ShareFileInfo[]>([]);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const [editTarget, setEditTarget] = useState<{
    token: string;
    expiresAt: string | null;
  } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [showBatchRevokeConfirm, setShowBatchRevokeConfirm] = useState(false);
  const [batchRevoking, setBatchRevoking] = useState(false);

  const confirmRevoke = useCallback((token: string) => {
    setRevokeTarget(token);
    setShowRevokeConfirm(true);
  }, []);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const result = await shareControllerRevokeShare({
        path: { token: revokeTarget },
      });
      if (result.error) {
        showToast(getErrorMessage(result.error), 'error');
        return;
      }
      setItems((prev) => prev.filter((i) => i.token !== revokeTarget));
      setTotal((prev) => prev - 1);
      showToast(t('分享已撤销'), 'success');
      setShowRevokeConfirm(false);
      setRevokeTarget(null);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setRevoking(false);
    }
  }, [revokeTarget, setItems, setTotal, showToast]);

  const handleBatchRevoke = useCallback(async () => {
    setBatchRevoking(true);
    const tokens = Array.from(selectedTokens);
    let successCount = 0;
    let failCount = 0;
    for (const token of tokens) {
      try {
        const result = await shareControllerRevokeShare({ path: { token } });
        if (!result.error) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    if (successCount > 0) {
      showToast(
        `${t('已撤销')} ${successCount} ${t('个分享')}${failCount > 0 ? `，${failCount} ${t('个失败')}` : ''}`,
        'success'
      );
    } else if (failCount > 0) {
      showToast(`${t('撤销失败')} ${failCount} ${t('个')}`, 'error');
    }
    setShowBatchRevokeConfirm(false);
    setBatchRevoking(false);
    fetchShares(page, search, sort);
  }, [selectedTokens, fetchShares, page, search, sort, showToast]);

  const handleCopy = useCallback(
    async (linkUrl: string, token?: string) => {
      await copyShareItem(`${window.location.origin}${linkUrl}`, token ?? linkUrl);
    },
    [copyShareItem]
  );

  const handleEditExpiry = useCallback(
    (token: string, expiresAt: string | null) => {
      setEditTarget({ token, expiresAt });
      setShowEditModal(true);
    },
    []
  );

  const handleSaveEdit = useCallback(
    async (expiresAt: string | null) => {
      if (!editTarget) return;
      try {
        const result = await shareControllerUpdateShare({
          path: { token: editTarget.token },
          body: { expiresAt } as never,
        });
        if (result.error) {
          showToast(getErrorMessage(result.error), 'error');
          return;
        }
        showToast(t('有效期已更新'), 'success');
        setShowEditModal(false);
        setEditTarget(null);
        fetchShares(page, search, sort);
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      }
    },
    [editTarget, fetchShares, page, search, sort, showToast]
  );

  const openFileSelector = useCallback(() => setShowFileSelector(true), []);
  const closeFileSelector = useCallback(() => setShowFileSelector(false), []);

  const handleSelectFiles = useCallback((files: ShareFileInfo[]) => {
    setShowFileSelector(false);
    if (files.length > 0) {
      setShareFiles(files);
      setShowShareDialog(true);
    }
  }, []);

  const closeShareDialog = useCallback(() => {
    setShowShareDialog(false);
    setShareFiles([]);
    fetchShares(page, search, sort);
  }, [fetchShares, page, search, sort]);

  const closeEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditTarget(null);
  }, []);

  const closeRevokeConfirm = useCallback(() => {
    setShowRevokeConfirm(false);
    setRevokeTarget(null);
  }, []);

  const openBatchRevokeConfirm = useCallback(() => {
    setShowBatchRevokeConfirm(true);
  }, []);

  const closeBatchRevokeConfirm = useCallback(() => {
    setShowBatchRevokeConfirm(false);
  }, []);

  return {
    copiedToken,
    showFileSelector,
    shareFiles,
    showShareDialog,
    editTarget,
    showEditModal,
    showRevokeConfirm,
    revoking,
    showBatchRevokeConfirm,
    batchRevoking,
    confirmRevoke,
    handleRevoke,
    handleBatchRevoke,
    handleCopy,
    handleEditExpiry,
    handleSaveEdit,
    openFileSelector,
    closeFileSelector,
    handleSelectFiles,
    closeShareDialog,
    closeEditModal,
    closeRevokeConfirm,
    openBatchRevokeConfirm,
    closeBatchRevokeConfirm,
  };
}
