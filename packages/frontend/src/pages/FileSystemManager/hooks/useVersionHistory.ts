///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback } from 'react';
import { versionControlApi } from '@/services/versionControlApi';
import { ProjectPermission } from '@/constants/permissions';
import { handleError } from '@/utils/errorHandler';
import type { FileSystemNode } from '@/types/filesystem';

interface VersionHistoryEntry {
  revision: number;
  author: string;
  date: string;
  message: string;
}

interface UseVersionHistoryOptions {
  urlProjectId: string | undefined;
  projectPermissions: Record<string, boolean>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export function useVersionHistory({
  urlProjectId,
  projectPermissions,
  showToast,
}: UseVersionHistoryOptions) {
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [versionHistoryNode, setVersionHistoryNode] = useState<FileSystemNode | null>(null);
  const [versionHistoryEntries, setVersionHistoryEntries] = useState<VersionHistoryEntry[]>([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState<string | null>(null);

  const closeVersionHistory = useCallback(() => {
    setShowVersionHistoryModal(false);
    setVersionHistoryNode(null);
    setVersionHistoryEntries([]);
    setVersionHistoryError(null);
  }, []);

  const handleShowVersionHistory = useCallback(
    async (node: FileSystemNode) => {
      if (!projectPermissions[ProjectPermission.VERSION_READ]) {
        showToast('您没有权限查看版本历史', 'warning');
        return;
      }

      if (!node.path) {
        return;
      }

      setVersionHistoryNode(node);
      setShowVersionHistoryModal(true);
      setVersionHistoryLoading(true);
      setVersionHistoryError(null);

      try {
        const response = await versionControlApi.getFileHistory(
          urlProjectId || '',
          node.path,
          50
        );
        if (response.data?.success) {
          setVersionHistoryEntries(response.data.entries || []);
        } else {
          setVersionHistoryError(response.data?.message || '加载版本历史失败');
        }
      } catch (error: unknown) {
        handleError(error, '版本历史加载失败');
        setVersionHistoryError(
          error instanceof Error ? error.message : '加载版本历史失败'
        );
      } finally {
        setVersionHistoryLoading(false);
      }
    },
    [urlProjectId, projectPermissions, showToast]
  );

  const handleOpenHistoricalVersion = useCallback(
    (revision: number) => {
      if (!versionHistoryNode?.path || !versionHistoryNode.id) {
        return;
      }

      const url = `/cad-editor/${versionHistoryNode.id}?nodeId=${versionHistoryNode.parentId}&v=${revision}`;
      window.open(url, '_blank');
    },
    [versionHistoryNode]
  );

  return {
    showVersionHistoryModal,
    versionHistoryNode,
    versionHistoryEntries,
    versionHistoryLoading,
    versionHistoryError,
    handleShowVersionHistory,
    handleOpenHistoricalVersion,
    closeVersionHistory,
  };
}
