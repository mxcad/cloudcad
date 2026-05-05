///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback } from 'react';
import { versionControlControllerGetFileHistory } from '@/api-sdk';
import type { FileSystemNode } from '@/types/filesystem';
import { handleError } from '@/utils/errorHandler';

export interface VersionHistoryEntry {
  revision: number;
  author: string;
  date: string;
  message: string;
}

export interface UseVersionHistoryReturn {
  showVersionHistoryModal: boolean;
  setShowVersionHistoryModal: (show: boolean) => void;
  versionHistoryNode: FileSystemNode | null;
  versionHistoryEntries: VersionHistoryEntry[];
  versionHistoryLoading: boolean;
  versionHistoryError: string | null;
  handleShowVersionHistory: (node: FileSystemNode) => Promise<void>;
  handleOpenHistoricalVersion: (revision: number) => void;
}

export function useVersionHistory(selectedProjectId: string | null): UseVersionHistoryReturn {
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [versionHistoryNode, setVersionHistoryNode] =
    useState<FileSystemNode | null>(null);
  const [versionHistoryEntries, setVersionHistoryEntries] = useState<
    VersionHistoryEntry[]
  >([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState<string | null>(
    null
  );

  const handleShowVersionHistory = useCallback(
    async (node: FileSystemNode) => {
      if (!node.path || !selectedProjectId) return;

      setVersionHistoryNode(node);
      setShowVersionHistoryModal(true);
      setVersionHistoryLoading(true);
      setVersionHistoryError(null);

      try {
        const { data: response } = await versionControlControllerGetFileHistory({
          query: { projectId: selectedProjectId, filePath: node.path, limit: 50 },
        });
        if (response?.success) {
          setVersionHistoryEntries(response.entries || []);
        } else {
          setVersionHistoryError(response?.message || '加载版本历史失败');
        }
      } catch (error: unknown) {
        handleError(error, 'useVersionHistory: 版本历史加载失败');
        setVersionHistoryError(
          error instanceof Error ? error.message : '加载版本历史失败'
        );
      } finally {
        setVersionHistoryLoading(false);
      }
    },
    [selectedProjectId]
  );

  const handleOpenHistoricalVersion = useCallback(
    (revision: number) => {
      if (!versionHistoryNode?.path || !versionHistoryNode.id) return;
      const url = `/cad-editor/${versionHistoryNode.id}?nodeId=${versionHistoryNode.parentId}&v=${revision}`;
      window.open(url, '_blank');
    },
    [versionHistoryNode]
  );

  return {
    showVersionHistoryModal,
    setShowVersionHistoryModal,
    versionHistoryNode,
    versionHistoryEntries,
    versionHistoryLoading,
    versionHistoryError,
    handleShowVersionHistory,
    handleOpenHistoricalVersion,
  };
}
