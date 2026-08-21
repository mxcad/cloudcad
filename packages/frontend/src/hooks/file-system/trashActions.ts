///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * trash 子域动作 Hook：restore/batchRestore/clearTrash（undo 联动 + 失败提示）。
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  nodeControllerBatchDeleteNodes,
  nodeControllerGetNode,
  nodeControllerRestoreNode,
  trashControllerClearProjectTrash,
  trashControllerClearTrash,
  trashControllerRestoreTrashItems,
} from '@/api-sdk';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';

import { t } from '@/languages';
import { queryKeys } from '@/lib/queryKeys';
import type { FileSystemNode } from '@/types/filesystem';
import { handleError } from '@/utils/errorHandler';

type ShowToastFn = (
  message: string,
  type: 'success' | 'error' | 'info' | 'warning'
) => void;

type ShowConfirmFn = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  type?: 'danger' | 'warning' | 'info',
  confirmText?: string
) => void;

interface UseTrashActionsOptions {
  urlProjectId?: string;
  showToast: ShowToastFn;
  showConfirm: ShowConfirmFn;
  /** 当前选中节点集合（组合层经 ref 注入） */
  selectedNodesRef: React.MutableRefObject<Set<string>>;
  /** 清除选择回调（组合层经 ref 注入） */
  clearSelectionRef: React.MutableRefObject<() => void>;
  /** 动作完成后刷新数据 */
  loadData: () => void;
}

export const useTrashActions = ({
  urlProjectId,
  showToast,
  showConfirm,
  selectedNodesRef,
  clearSelectionRef,
  loadData,
}: UseTrashActionsOptions) => {
  const queryClient = useQueryClient();
  const pushAction = useFileSystemUndoRedoStore((s) => s.pushAction);
  const clearUndoStack = useFileSystemUndoRedoStore((s) => s.clearStack);

  // ── 恢复节点 ────────────────────────────────────────────────────────
  const restore = useCallback(
    (node: FileSystemNode) => {
      showConfirm(
        t('确认恢复'),
        t('确定要恢复 ') + '"' + node.name + '"' + t(' 吗？'),
        async () => {
          try {
            if (node.isRoot) {
              // TODO: Replace with SDK when backend adds restoreProject endpoint
              await trashControllerRestoreTrashItems({
                body: { itemIds: [node.id] },
                throwOnError: true,
              } as unknown as Parameters<
                typeof trashControllerRestoreTrashItems
              >[0]);
            } else {
              await nodeControllerRestoreNode({
                path: { nodeId: node.id },
                throwOnError: true,
              });
            }
            showToast(t('已恢复 ') + '"' + node.name + '"', 'success');
            const { currentFileId } = useCADEditorStore.getState();
            if (currentFileId && currentFileId === node.id) {
              useCADEditorStore.getState().setIsCurrentFileDeleted(false);
            }
            loadData();
            queryClient.invalidateQueries({
              queryKey: queryKeys.fileSystem.storageQuota,
            });
          } catch (error) {
            const appError = handleError(error, t('恢复节点'), 'medium');
            showToast(appError.message, 'error');
          }
        },
        'warning'
      );
    },
    [showConfirm, showToast, loadData, queryClient]
  );

  // ── 批量恢复 ────────────────────────────────────────────────────────
  const batchRestore = useCallback(() => {
    const currentSelected = selectedNodesRef.current;
    if (currentSelected.size === 0) {
      return;
    }
    const nodeIds = Array.from(currentSelected);

    showConfirm(
      t('批量恢复'),
      t('确定要恢复选中的 ') + nodeIds.length + t(' 个项目吗？'),
      async () => {
        try {
          await trashControllerRestoreTrashItems({
            body: { itemIds: nodeIds },
            throwOnError: true,
          } as unknown as Parameters<
            typeof trashControllerRestoreTrashItems
          >[0]);
          showToast(t('已恢复 ') + nodeIds.length + t(' 个项目'), 'success');
          pushAction({
            type: 'delete',
            description: t('批量恢复 ') + nodeIds.length + t(' 个项目'),
            projectId: urlProjectId || undefined,
            nodeIds,
            execute: async () => {
              await trashControllerRestoreTrashItems({
                body: { itemIds: nodeIds },
                throwOnError: true,
              } as unknown as Parameters<
                typeof trashControllerRestoreTrashItems
              >[0]);
            },
            rollback: async () => {
              await nodeControllerBatchDeleteNodes({
                body: { nodeIds, permanently: false },
                throwOnError: true,
              });
            },
          });
          clearSelectionRef.current();
          loadData();
          queryClient.invalidateQueries({
            queryKey: queryKeys.fileSystem.storageQuota,
          });
        } catch (error) {
          const appError = handleError(error, t('批量恢复'), 'medium');
          showToast(appError.message, 'error');
        }
      },
      'warning',
      t('恢复')
    );
  }, [
    showConfirm,
    loadData,
    showToast,
    urlProjectId,
    queryClient,
  ]);

  /** 清空回收站后检查当前打开的文件是否受到影响 */
  async function checkCurrentFileAfterTrashClear(): Promise<void> {
    const { currentFileId } = useCADEditorStore.getState();
    if (!currentFileId) return;
    try {
      const nodeResp = await nodeControllerGetNode({
        path: { nodeId: currentFileId },
        throwOnError: true,
      });
      const node = nodeResp.data;
      if (node?.fileStatus === 'DELETED' || node?.deletedAt) {
        useCADEditorStore.getState().setIsCurrentFileDeleted(true);
      }
    } catch {
      // 404 → 节点已被永久删除
      useCADEditorStore.getState().setIsCurrentFileDeleted(true);
    }
  }

  // 清空回收站（项目内清空调用 clearProjectTrash，全局清空调用 clearTrash）
  const clearTrash = useCallback(
    (projectId?: string) => {
      if (projectId) {
        showConfirm(
          t('确认清空回收站'),
          t(
            '确定要清空项目回收站吗？此操作将彻底删除所有已删除的文件和文件夹，且不可恢复。'
          ),
          async () => {
            try {
              await trashControllerClearProjectTrash({
                path: { projectId },
                throwOnError: true,
              });
              showToast(t('项目回收站已清空'), 'success');
              clearUndoStack();
              await checkCurrentFileAfterTrashClear();
              loadData();
              queryClient.invalidateQueries({
                queryKey: queryKeys.fileSystem.storageQuota,
              });
            } catch (error) {
              const appError = handleError(error, t('清空回收站'), 'medium');
              showToast(appError.message, 'error');
            }
          },
          'danger'
        );
      } else {
        showConfirm(
          t('确认清空回收站'),
          t(
            '确定要清空回收站吗？此操作将彻底删除所有已删除的项目，且不可恢复。'
          ),
          async () => {
            try {
              await trashControllerClearTrash({ throwOnError: true });
              showToast(t('回收站已清空'), 'success');
              clearUndoStack();
              await checkCurrentFileAfterTrashClear();
              loadData();
              queryClient.invalidateQueries({
                queryKey: queryKeys.fileSystem.storageQuota,
              });
            } catch (error) {
              const appError = handleError(error, t('清空回收站'), 'medium');
              showToast(appError.message, 'error');
            }
          },
          'danger'
        );
      }
    },
    [showConfirm, showToast, loadData, queryClient]
  );

  return { restore, batchRestore, clearTrash };
};
