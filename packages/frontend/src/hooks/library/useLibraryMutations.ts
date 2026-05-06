///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  libraryControllerCreateDrawingFolder,
  libraryControllerDeleteDrawingNode,
  libraryControllerRenameDrawingNode,
  libraryControllerMoveDrawingNode,
  libraryControllerCopyDrawingNode,
  libraryControllerCreateBlockFolder,
  libraryControllerDeleteBlockNode,
  libraryControllerRenameBlockNode,
  libraryControllerMoveBlockNode,
  libraryControllerCopyBlockNode,
} from '@/api-sdk';
import { queryKeys } from '../../lib/queryKeys';
import { handleApiError } from '../../utils/errorHandler';
import type { LibraryType } from './useLibraryQuery';

interface UseLibraryMutationsOptions {
  libraryType: LibraryType;
  onSuccess?: () => void;
}

// ---- API method resolvers ----

function getCreateFolderApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerCreateDrawingFolder
    : libraryControllerCreateBlockFolder;
}

function getDeleteNodeApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerDeleteDrawingNode
    : libraryControllerDeleteBlockNode;
}

function getRenameNodeApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerRenameDrawingNode
    : libraryControllerRenameBlockNode;
}

function getMoveNodeApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerMoveDrawingNode
    : libraryControllerMoveBlockNode;
}

function getCopyNodeApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerCopyDrawingNode
    : libraryControllerCopyBlockNode;
}

/**
 * 资源库写操作 Hook
 *
 * 提供 createFolder、deleteNode、renameNode、moveNode、copyNode、batchDeleteNodes
 * 每个操作是独立的 useMutation，成功后自动 invalidateQueries 刷新缓存。
 */
export function useLibraryMutations({
  libraryType,
  onSuccess,
}: UseLibraryMutationsOptions) {
  const queryClient = useQueryClient();

  /** 批量失效所有库相关查询 */
  const invalidateLibrary = () => {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.library.all,
    });
  };

  // ---- 创建文件夹 ----
  const createFolderMutation = useMutation({
    mutationFn: async (params: { name: string; parentId?: string }) => {
      const api = getCreateFolderApi(libraryType);
      const result = await api({ body: params });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      await invalidateLibrary();
      onSuccess?.();
    },
    onError: (error) => {
      handleApiError(error, '创建文件夹失败');
    },
  });

  // ---- 删除节点 ----
  const deleteNodeMutation = useMutation({
    mutationFn: async (params: { nodeId: string; permanently?: boolean }) => {
      const api = getDeleteNodeApi(libraryType);
      const result = await api({
        path: { nodeId: params.nodeId },
        query: { permanently: params.permanently ?? true },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      await invalidateLibrary();
      onSuccess?.();
    },
    onError: (error) => {
      handleApiError(error, '删除节点失败');
    },
  });

  // ---- 重命名节点 ----
  const renameNodeMutation = useMutation({
    mutationFn: async (params: { nodeId: string; name: string }) => {
      const api = getRenameNodeApi(libraryType);
      const result = await api({
        path: { nodeId: params.nodeId },
        body: { name: params.name },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      await invalidateLibrary();
      onSuccess?.();
    },
    onError: (error) => {
      handleApiError(error, '重命名失败');
    },
  });

  // ---- 移动节点 ----
  const moveNodeMutation = useMutation({
    mutationFn: async (params: { nodeId: string; targetParentId: string }) => {
      const api = getMoveNodeApi(libraryType);
      const result = await api({
        path: { nodeId: params.nodeId },
        body: { targetParentId: params.targetParentId },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      await invalidateLibrary();
      onSuccess?.();
    },
    onError: (error) => {
      handleApiError(error, '移动节点失败');
    },
  });

  // ---- 复制节点 ----
  const copyNodeMutation = useMutation({
    mutationFn: async (params: { nodeId: string; targetParentId: string }) => {
      const api = getCopyNodeApi(libraryType);
      const result = await api({
        path: { nodeId: params.nodeId },
        body: { targetParentId: params.targetParentId },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      await invalidateLibrary();
      onSuccess?.();
    },
    onError: (error) => {
      handleApiError(error, '复制节点失败');
    },
  });

  // ---- 批量删除 ----
  const batchDeleteMutation = useMutation({
    mutationFn: async (nodeIds: string[]) => {
      const api = getDeleteNodeApi(libraryType);
      for (const nodeId of nodeIds) {
        const result = await api({
          path: { nodeId },
          query: { permanently: true },
        });
        if (result.error) throw result.error;
      }
    },
    onSuccess: async () => {
      await invalidateLibrary();
      onSuccess?.();
    },
    onError: (error) => {
      handleApiError(error, '批量删除失败');
    },
  });

  return {
    createFolder: createFolderMutation.mutateAsync,
    deleteNode: deleteNodeMutation.mutateAsync,
    renameNode: renameNodeMutation.mutateAsync,
    moveNode: moveNodeMutation.mutateAsync,
    copyNode: copyNodeMutation.mutateAsync,
    batchDeleteNodes: batchDeleteMutation.mutateAsync,

    isCreatingFolder: createFolderMutation.isPending,
    isDeletingNode: deleteNodeMutation.isPending,
    isRenamingNode: renameNodeMutation.isPending,
    isMovingNode: moveNodeMutation.isPending,
    isCopyingNode: copyNodeMutation.isPending,
    isBatchDeleting: batchDeleteMutation.isPending,
  };
}
