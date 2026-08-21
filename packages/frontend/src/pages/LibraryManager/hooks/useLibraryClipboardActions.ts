import { useCallback } from 'react';
import {
  libraryControllerCopyDrawingNode,
  libraryControllerCopyBlockNode,
  libraryControllerDeleteDrawingNode,
  libraryControllerDeleteBlockNode,
} from '@/api-sdk';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { getErrorMessage } from '../../../utils/errorHandler';
import { t } from '@/languages';
import type { FileSystemNode } from '../../../types/filesystem';
import type { UseLibraryOperationsReturn } from '../../../hooks/library/useLibraryOperations';

type LibraryType = 'drawing' | 'block';
type ShowToast = (
  message: string,
  type: 'success' | 'error' | 'warning' | 'info'
) => void;
type ShowConfirm = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  type?: 'danger' | 'warning' | 'info',
  confirmText?: string
) => void;

export interface UseLibraryClipboardActionsOptions {
  libraryType: LibraryType;
  libraryId: string | null;
  nodes: FileSystemNode[];
  currentNode: FileSystemNode | null;
  selectedNodes: Set<string>;
  clipboardItems: string[];
  clipboardMode: 'copy' | 'cut' | null;
  refresh: () => void;
  clearSelection: () => void;
  showToast: ShowToast;
  showConfirm: ShowConfirm;
  libraryOperations: UseLibraryOperationsReturn;
}

export interface UseLibraryClipboardActionsReturn {
  clipboardHandleCopy: () => void;
  clipboardHandleCut: () => void;
  handleCopyClipboard: (node: FileSystemNode) => void;
  handleCutClipboard: (node: FileSystemNode) => void;
  clipboardHandlePaste: () => Promise<void>;
  clipboardHandleUndo: () => Promise<void>;
  clipboardHandleRedo: () => Promise<void>;
  handleDeleteSelected: () => void;
}

export function useLibraryClipboardActions({
  libraryType,
  libraryId,
  nodes,
  currentNode,
  selectedNodes,
  clipboardItems,
  clipboardMode,
  refresh,
  clearSelection,
  showToast,
  showConfirm,
  libraryOperations,
}: UseLibraryClipboardActionsOptions): UseLibraryClipboardActionsReturn {
  const setClipboard = useFileSystemClipboardStore((s) => s.setClipboard);
  const clearClipboard = useFileSystemClipboardStore((s) => s.clearClipboard);

  const pushAction = useFileSystemUndoRedoStore((s) => s.pushAction);
  const undoStoreUndo = useFileSystemUndoRedoStore((s) => s.undo);
  const undoStoreRedo = useFileSystemUndoRedoStore((s) => s.redo);
  const undoStack = useFileSystemUndoRedoStore((s) => s.undoStack);
  const redoStack = useFileSystemUndoRedoStore((s) => s.redoStack);

  const clipboardHandleCopy = useCallback(() => {
    if (selectedNodes.size === 0) {
      showToast(t('请先选择要复制的文件'), 'info');
      return;
    }
    setClipboard(Array.from(selectedNodes), 'copy', libraryId || '');
    showToast(
      t('已复制 {count} 个项目', { count: String(selectedNodes.size) }),
      'info'
    );
  }, [selectedNodes, setClipboard, libraryId, showToast]);

  const clipboardHandleCut = useCallback(() => {
    if (selectedNodes.size === 0) {
      showToast(t('请先选择要剪切的文件'), 'info');
      return;
    }
    const nodeIds = Array.from(selectedNodes);
    const sourceParentIds: Record<string, string> = {};
    for (const id of nodeIds) {
      const node = nodes.find((n) => n.id === id);
      if (node?.parentId) sourceParentIds[id] = node.parentId;
    }
    setClipboard(nodeIds, 'cut', libraryId || '', sourceParentIds);
    showToast(
      t('已剪切 {count} 个项目', { count: String(selectedNodes.size) }),
      'info'
    );
  }, [selectedNodes, nodes, setClipboard, libraryId, showToast]);

  const handleCopyClipboard = useCallback(
    (node: FileSystemNode) => {
      useFileSystemClipboardStore
        .getState()
        .setClipboard([node.id], 'copy', libraryId || '', {
          [node.id]: node.parentId || '',
        });
      showToast(t('已复制'), 'info');
    },
    [libraryId, showToast]
  );

  const handleCutClipboard = useCallback(
    (node: FileSystemNode) => {
      useFileSystemClipboardStore
        .getState()
        .setClipboard([node.id], 'cut', libraryId || '', {
          [node.id]: node.parentId || '',
        });
      showToast(t('已剪切'), 'info');
    },
    [libraryId, showToast]
  );

  const clipboardHandlePaste = useCallback(async () => {
    if (clipboardItems.length === 0 || !clipboardMode) return;
    const targetParentId = currentNode?.id || libraryId;
    if (!targetParentId) {
      showToast(t('无法确定粘贴位置'), 'error');
      return;
    }
    try {
      if (clipboardMode === 'cut') {
        const movedIds: string[] = [];
        let failedCount = 0;
        let lastError: unknown = null;
        // 快照源父目录信息：clearClipboard 会清空 store 中的 sourceParentIds，
        // 撤销 rollback 必须基于此快照恢复原位置，而非撤销时才从 store 现读（此时已被清空）
        const origParentIds = {
          ...useFileSystemClipboardStore.getState().sourceParentIds,
        };
        for (const nodeId of clipboardItems) {
          try {
            await libraryOperations.handleMove(nodeId, targetParentId);
            movedIds.push(nodeId);
          } catch (e) {
            // 单个移动失败不影响其他节点，但必须计入失败数并如实反馈（配额超限等错误不可静默吞掉）
            failedCount += 1;
            lastError = e;
          }
        }
        if (movedIds.length > 0) clearClipboard();
        if (movedIds.length === 0) {
          showToast(
            lastError ? getErrorMessage(lastError) : t('粘贴失败'),
            'error'
          );
        } else if (failedCount > 0) {
          showToast(
            t('成功移动 {successCount} 项，{failedCount} 项失败', {
              successCount: String(movedIds.length),
              failedCount: String(failedCount),
            }),
            'warning'
          );
        } else {
          showToast(t('粘贴成功'), 'success');
        }
        if (movedIds.length > 0) {
          pushAction({
            type: 'move',
            description: t('移动 {count} 个项目', {
              count: String(movedIds.length),
            }),
            projectId: libraryId || undefined,
            // 供永久删除后清理 undo/redo 栈：被移动的节点 id 全集
            nodeIds: movedIds,
            execute: async () => {
              for (const nodeId of movedIds) {
                await libraryOperations.handleMove(nodeId, targetParentId);
              }
            },
            rollback: async () => {
              for (const [nodeId, srcParentId] of Object.entries(
                origParentIds
              )) {
                if (movedIds.includes(nodeId) && srcParentId) {
                  await libraryOperations.handleMove(nodeId, srcParentId);
                }
              }
            },
          });
        }
      } else {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryControllerCopyDrawingNode
            : libraryControllerCopyBlockNode;
        const deleteApi =
          libraryType === 'drawing'
            ? libraryControllerDeleteDrawingNode
            : libraryControllerDeleteBlockNode;

        const createdIdsRef: { current: string[] } = { current: [] };
        let failedCount = 0;
        let lastError: unknown = null;
        for (const nodeId of clipboardItems) {
          try {
            const result = await apiMethod({
              path: { nodeId },
              body: { targetParentId },
              throwOnError: true,
            });
            const data =
              (result as unknown as { data?: { id?: string } })?.data || result;
            const newId = (data as unknown as { id?: string })?.id || '';
            if (newId) createdIdsRef.current.push(newId);
          } catch (e) {
            // 单个复制失败不影响其他节点，但必须计入失败数并如实反馈（配额超限等错误不可静默吞掉）
            failedCount += 1;
            lastError = e;
          }
        }
        const successCount = createdIdsRef.current.length;
        if (successCount === 0) {
          showToast(
            lastError ? getErrorMessage(lastError) : t('粘贴失败'),
            'error'
          );
        } else if (failedCount > 0) {
          showToast(
            t('成功粘贴 {successCount} 项，{failedCount} 项失败', {
              successCount: String(successCount),
              failedCount: String(failedCount),
            }),
            'warning'
          );
        } else {
          showToast(t('粘贴成功'), 'success');
        }
        if (createdIdsRef.current.length > 0) {
          pushAction({
            type: 'paste-copy',
            description: t('复制 {count} 个项目', {
              count: String(successCount),
            }),
            projectId: libraryId || undefined,
            // 引用同一数组（execute 原地更新元素而非替换引用），
            // 供永久删除后清理 undo/redo 栈：复制产出的新节点 id 全集
            nodeIds: createdIdsRef.current,
            execute: async () => {
              const newIds: string[] = [];
              for (const nodeId of clipboardItems) {
                try {
                  const result = await apiMethod({
                    path: { nodeId },
                    body: { targetParentId },
                    throwOnError: true,
                  });
                  const data =
                    (result as unknown as { data?: { id?: string } })?.data ||
                    result;
                  const newId = (data as unknown as { id?: string })?.id || '';
                  if (newId) newIds.push(newId);
                } catch {
                  // skip
                }
              }
              // 原地更新：保持 action.nodeIds 与 createdIdsRef.current 指向同一数组
              createdIdsRef.current.length = 0;
              createdIdsRef.current.push(...newIds);
            },
            rollback: async () => {
              for (const id of createdIdsRef.current) {
                try {
                  await deleteApi({
                    path: { nodeId: id },
                    query: { permanently: true },
                    throwOnError: true,
                  });
                } catch (e) {
                  if (
                    e &&
                    typeof e === 'object' &&
                    'code' in e &&
                    (e as { code: string }).code === 'NOT_FOUND'
                  )
                    continue;
                  throw e;
                }
              }
            },
          });
        }
      }
      refresh();
    } catch {
      showToast(t('粘贴失败'), 'error');
    }
  }, [
    clipboardItems,
    clipboardMode,
    currentNode,
    libraryId,
    libraryOperations,
    clearClipboard,
    showToast,
    pushAction,
    refresh,
    libraryType,
  ]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedNodes.size === 0) return;
    const nodeIds = Array.from(selectedNodes);
    const count = nodeIds.length;
    showConfirm(
      t('确认删除'),
      t('确定要永久删除这 {count} 个项目吗？删除后无法恢复。', {
        count: String(count),
      }),
      async () => {
        try {
          // 统一走 useLibraryOperations.handleBatchDelete（toast/successCount/failedCount 语义以它为准）
          await libraryOperations.handleBatchDelete(nodeIds);
          clearSelection();
        } catch {
          // 错误 toast 已由 handleBatchDelete 统一提示
        }
      }
    );
  }, [selectedNodes, showConfirm, libraryOperations, clearSelection]);

  const clipboardHandleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    try {
      const action = undoStack[undoStack.length - 1];
      if (!action) return;
      await undoStoreUndo(libraryId || undefined);
      showToast(
        t('已撤销: {description}', { description: action.description }),
        'info'
      );
      refresh();
    } catch {
      showToast(t('撤销失败'), 'error');
    }
  }, [undoStack, undoStoreUndo, libraryId, showToast, refresh]);

  const clipboardHandleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    try {
      const action = redoStack[redoStack.length - 1];
      if (!action) return;
      await undoStoreRedo(libraryId || undefined);
      showToast(
        t('已重做: {description}', { description: action.description }),
        'info'
      );
      refresh();
    } catch {
      showToast(t('重做失败'), 'error');
    }
  }, [redoStack, undoStoreRedo, libraryId, showToast, refresh]);

  return {
    clipboardHandleCopy,
    clipboardHandleCut,
    handleCopyClipboard,
    handleCutClipboard,
    clipboardHandlePaste,
    clipboardHandleUndo,
    clipboardHandleRedo,
    handleDeleteSelected,
  };
}
