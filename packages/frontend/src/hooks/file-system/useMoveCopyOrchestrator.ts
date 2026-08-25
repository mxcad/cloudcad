///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useCallback } from 'react';
import {
  nodeControllerBatchCopyNodes,
  nodeControllerBatchMoveNodes,
} from '@/api-sdk';
import { buildMoveAction, buildCopyAction } from './moveCopyActions';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { handleError } from '@/utils/errorHandler';
import { t } from '@/languages';
import type { FileSystemNode } from '@/types/filesystem';

type ToastType = 'info' | 'success' | 'error' | 'warning';

/** 移动/复制触发模式：剪贴板粘贴 / 选择文件夹模态 / 拖拽 */
export type MoveCopyMode = 'clipboard' | 'modal' | 'drag';

/**
 * 批量操作响应取值：clientSetup 的 responseTransformer 已解包信封，
 * res.data 即 BatchOperationResponseDto（类型由 SDK 生成保证）
 */
function extractBatchResult(payload: unknown): {
  successIds: string[];
  failedCount: number;
  errors?: string[];
  createdIds?: string[];
} {
  const r = (payload ?? {}) as {
    successIds?: string[];
    failedIds?: string[];
    failedCount?: number;
    errors?: string[];
    createdIds?: string[];
  };
  return {
    successIds: Array.isArray(r.successIds) ? r.successIds : [],
    failedCount:
      typeof r.failedCount === 'number'
        ? r.failedCount
        : Array.isArray(r.failedIds)
          ? r.failedIds.length
          : 0,
    errors: r.errors,
    createdIds: Array.isArray(r.createdIds) ? r.createdIds : undefined,
  };
}

export interface MoveCopyCallOptions {
  /** 各源节点的原父目录（undo rollback 用） */
  sourceParentIds?: Map<string, string>;
  /** undo 动作描述；缺省按模式生成（粘贴=移动 N 个项目，拖拽=拖拽移动） */
  description?: string;
  /** undo 动作的 projectId；缺省用 urlProjectId */
  projectId?: string;
  /** 全部失败时 handleError 的上下文标签 */
  failureLabel?: string;
  /** 至少一个节点成功后回调（如关闭模态框） */
  onSuccess?: () => void;
}

export interface UseMoveCopyOrchestratorOptions {
  /** 当前项目 id（undo 动作归属） */
  urlProjectId?: string;
  handleRefresh: () => void;
  showToast: (message: string, type?: ToastType) => void;
  canMove?: boolean;
  canCopy?: boolean;
  draggedNodes: FileSystemNode[];
  setDraggedNodes: (nodes: FileSystemNode[]) => void;
  setDropTargetId: (id: string | null) => void;
}

/**
 * 移动/复制统一编排器（FileSystemManager 主页面与 ProjectDrawingsPanel 侧栏共用）。
 *
 * 收敛 6 路移动/复制实现（剪贴板 / 选择文件夹模态 / 拖拽 × 主页面 / 侧栏）：
 * - move / copy：逐节点执行 + 失败计数 + 权限检查 + toast 汇总 + undo push（moveCopyActions 作底层）
 * - handleDragStart / handleDragOver / handleDragLeave / handleDrop：拖拽手势（Ctrl 判定 copy/move）
 *
 * 行为基准：主页面 useClipboardActions（toast 文案 / 失败计数 / undo push），侧栏对齐。
 * 成功提示按模式区分：clipboard=粘贴成功，modal=移动/复制成功，drag=不提示（保持原拖拽行为）。
 */
export function useMoveCopyOrchestrator({
  urlProjectId,
  handleRefresh,
  showToast,
  canMove = false,
  canCopy = false,
  draggedNodes,
  setDraggedNodes,
  setDropTargetId,
}: UseMoveCopyOrchestratorOptions) {
  const pushAction = useFileSystemUndoRedoStore((s) => s.pushAction);

  const move = useCallback(
    async (
      sourceNodeIds: string[],
      targetParentId: string,
      mode: MoveCopyMode,
      options: MoveCopyCallOptions = {}
    ): Promise<string[]> => {
      if (!canMove) {
        showToast(t('没有移动权限'), 'error');
        return [];
      }
      const {
        sourceParentIds = new Map<string, string>(),
        description,
        projectId = urlProjectId,
        failureLabel,
        onSuccess,
      } = options;
      // 单次批量请求替代逐节点循环（部分成功语义由后端 batch 端点保证）
      let movedIds: string[] = [];
      let failedCount = 0;
      let lastError: unknown = null;
      try {
        const res = await nodeControllerBatchMoveNodes({
          body: { nodeIds: sourceNodeIds, targetParentId },
          throwOnError: true,
        });
        const result = extractBatchResult(res.data);
        movedIds = result.successIds;
        failedCount = result.failedCount;
        if (failedCount > 0) {
          lastError = new Error(result.errors?.[0] || t('部分项目移动失败'));
        }
      } catch (error) {
        failedCount += 1;
        lastError = error;
      }
      if (movedIds.length === 0) {
        const appError = lastError
          ? handleError(lastError, failureLabel || t('移动'), 'medium')
          : null;
        showToast(
          appError
            ? appError.message
            : mode === 'clipboard'
              ? t('粘贴失败')
              : t('操作失败，请重试'),
          'error'
        );
        return [];
      }
      if (failedCount > 0) {
        showToast(
          t('成功移动 {successCount} 项，{failedCount} 项失败', {
            successCount: String(movedIds.length),
            failedCount: String(failedCount),
          }),
          'warning'
        );
      } else if (mode === 'clipboard') {
        showToast(t('粘贴成功'), 'success');
      } else if (mode === 'modal') {
        showToast(t('移动成功'), 'success');
      }
      // drag 模式：保持原拖拽行为，不弹成功提示
      pushAction(
        buildMoveAction({
          nodeIds: movedIds,
          targetParentId,
          sourceParentIds,
          description:
            description ||
            (mode === 'drag'
              ? t('拖拽移动')
              : t(`移动 ${movedIds.length} 个项目`)),
          projectId,
        })
      );
      handleRefresh();
      onSuccess?.();
      return movedIds;
    },
    [canMove, urlProjectId, pushAction, handleRefresh, showToast]
  );

  const copy = useCallback(
    async (
      sourceNodeIds: string[],
      targetParentId: string,
      mode: MoveCopyMode,
      options: MoveCopyCallOptions = {}
    ): Promise<string[]> => {
      if (!canCopy) {
        showToast(t('没有复制权限'), 'error');
        return [];
      }
      const {
        description,
        projectId = urlProjectId,
        failureLabel,
        onSuccess,
      } = options;
      // 单次批量请求替代逐节点循环（部分成功语义由后端 batch 端点保证）
      let createdIds: string[] = [];
      let failedCount = 0;
      let lastError: unknown = null;
      try {
        const res = await nodeControllerBatchCopyNodes({
          body: { nodeIds: sourceNodeIds, targetParentId },
          throwOnError: true,
        });
        const result = extractBatchResult(res.data);
        createdIds = result.createdIds ?? [];
        failedCount = result.failedCount;
        if (failedCount > 0) {
          lastError = new Error(result.errors?.[0] || t('部分项目复制失败'));
        }
      } catch (error) {
        failedCount += 1;
        lastError = error;
      }
      if (createdIds.length === 0) {
        const appError = lastError
          ? handleError(lastError, failureLabel || t('复制'), 'medium')
          : null;
        showToast(
          appError
            ? appError.message
            : mode === 'clipboard'
              ? t('粘贴失败')
              : t('操作失败，请重试'),
          'error'
        );
        return [];
      }
      if (failedCount > 0) {
        showToast(
          mode === 'clipboard'
            ? t('成功粘贴 {successCount} 项，{failedCount} 项失败', {
                successCount: String(createdIds.length),
                failedCount: String(failedCount),
              })
            : t('成功复制 {successCount} 项，{failedCount} 项失败', {
                successCount: String(createdIds.length),
                failedCount: String(failedCount),
              }),
          'warning'
        );
      } else if (mode === 'clipboard') {
        showToast(t('粘贴成功'), 'success');
      } else if (mode === 'modal') {
        showToast(t('复制成功'), 'success');
      }
      // drag 模式：保持原拖拽行为，不弹成功提示
      pushAction(
        buildCopyAction({
          sourceNodeIds,
          targetParentId,
          description:
            description ||
            (mode === 'drag'
              ? t('拖拽复制')
              : t(`复制 ${createdIds.length} 个项目`)),
          projectId,
          initialCreatedIds: createdIds,
        })
      );
      handleRefresh();
      onSuccess?.();
      return createdIds;
    },
    [canCopy, urlProjectId, pushAction, handleRefresh, showToast]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      if (node.isRoot) {
        e.preventDefault();
        return;
      }
      if (!canMove && !canCopy) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = canCopy ? 'copyMove' : 'move';
      setDraggedNodes([node]);
    },
    [canMove, canCopy, setDraggedNodes]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      e.preventDefault();
      if (node.isFolder && !draggedNodes.some((dn) => dn.id === node.id)) {
        e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
        setDropTargetId(node.id);
      }
    },
    [draggedNodes, setDropTargetId]
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, [setDropTargetId]);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetNode: FileSystemNode) => {
      e.preventDefault();
      setDropTargetId(null);
      if (!targetNode.isFolder || draggedNodes.length === 0) return;

      const isCopy = e.ctrlKey || e.metaKey;
      // 环防护（D2）：目标位于任一被拖文件夹的已加载子树内时跳过该源
      // （未加载部分由后端 isDescendantOf 兜底拦截）
      const subtreeContains = (
        node: FileSystemNode,
        targetId: string
      ): boolean =>
        (node.children ?? []).some(
          (c) => c.id === targetId || subtreeContains(c, targetId)
        );
      const nodesToProcess = draggedNodes.filter(
        (n) => n.id !== targetNode.id && !subtreeContains(n, targetNode.id)
      );
      if (nodesToProcess.length === 0) {
        setDraggedNodes([]);
        return;
      }
      const sourceParentIds = new Map<string, string>();
      for (const node of nodesToProcess) {
        if (node.parentId) sourceParentIds.set(node.id, node.parentId);
      }
      const nodeIds = nodesToProcess.map((n) => n.id);
      try {
        if (isCopy) {
          await copy(nodeIds, targetNode.id, 'drag', { sourceParentIds });
        } else {
          await move(nodeIds, targetNode.id, 'drag', { sourceParentIds });
        }
      } finally {
        setDraggedNodes([]);
      }
    },
    [draggedNodes, move, copy, setDraggedNodes, setDropTargetId]
  );

  return {
    move,
    copy,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}

export type UseMoveCopyOrchestratorReturn = ReturnType<
  typeof useMoveCopyOrchestrator
>;
