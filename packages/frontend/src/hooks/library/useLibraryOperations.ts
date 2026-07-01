///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * useLibraryOperations - 共享的图书馆操作 hooks
 * 
 * 提供图书馆和图块库的通用操作函数，供 LibraryManager.tsx 和 ProjectDrawingsPanel.tsx 复用
 * 
 * 功能包括：
 * - 下载（支持多格式）
 * - 删除（永久删除）
 * - 重命名
 * - 移动/复制
 * - 批量操作
 */

import { useState, useCallback } from 'react';
import {
  libraryControllerDownloadDrawingNode,
  libraryControllerDownloadBlockNode,
  libraryControllerDeleteDrawingNode,
  libraryControllerDeleteBlockNode,
  libraryControllerRenameDrawingNode,
  libraryControllerRenameBlockNode,
  libraryControllerMoveDrawingNode,
  libraryControllerMoveBlockNode,
  libraryControllerCopyDrawingNode,
  libraryControllerCopyBlockNode,
} from '@/api-sdk';
import { sanitizeFileName } from '../../utils/fileUtils';
import { getErrorMessage } from '../../utils/errorHandler';
import { t } from '@/languages';

export type LibraryType = 'drawing' | 'block';

export interface LibraryOperationOptions {
  /** 库类型 */
  libraryType: LibraryType;
  /** 显示提示消息 */
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  /** 刷新列表回调 */
  refreshNodes: () => void;
  /** 显示确认对话框 */
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => Promise<void> | void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string
  ) => void;
  /** 乐观删除：直接从列表移除节点 */
  removeLocalNode?: (nodeId: string) => void;
  /** 乐观更新：直接修改列表中节点名称 */
  updateLocalNode?: (nodeId: string, updates: { name: string }) => void;
}

export interface LibraryNode {
  id: string;
  name: string;
  isFolder: boolean;
  path?: string;
}

export interface UseLibraryOperationsReturn {
  /** 下载节点（简单下载） */
  handleDownload: (nodeId: string) => Promise<void>;
  /** 下载节点（支持多格式） */
  handleDownloadWithFormat: (
    nodeId: string,
    nodeName: string,
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: {
      width?: string;
      height?: string;
      colorPolicy?: 'mono' | 'color';
    }
  ) => Promise<void>;
  /** 删除节点 */
  handleDelete: (node: LibraryNode) => void;
  /** 重命名节点 */
  handleRename: (
    nodeId: string,
    newName: string,
    onComplete?: () => void
  ) => Promise<void>;
  /** 移动节点 */
  handleMove: (nodeId: string, targetParentId: string) => Promise<void>;
  /** 复制节点 */
  handleCopy: (nodeId: string, targetParentId: string) => Promise<void>;
  /** 批量删除 */
  handleBatchDelete: (nodeIds: string[]) => Promise<void>;
  /** 批量移动 */
  handleBatchMove: (nodeIds: string[], targetParentId: string) => Promise<void>;
  /** 批量复制 */
  handleBatchCopy: (nodeIds: string[], targetParentId: string) => Promise<void>;
}

export function useLibraryOperations({
  libraryType,
  showToast,
  refreshNodes,
  showConfirm,
  removeLocalNode,
  updateLocalNode,
}: LibraryOperationOptions): UseLibraryOperationsReturn {
  // 下载节点（简单下载）
  const handleDownload = useCallback(
    async (nodeId: string) => {
      try {
        const { data: blobData } =
          libraryType === 'drawing'
            ? await libraryControllerDownloadDrawingNode({ path: { nodeId }, parseAs: 'blob' })
            : await libraryControllerDownloadBlockNode({ path: { nodeId }, parseAs: 'blob' });

        const blob = blobData instanceof Blob ? blobData : new Blob([blobData as unknown as BlobPart]);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'file');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        showToast(t('下载已开始'), 'success');
      } catch (error) {
        console.error('下载失败:', error);
        showToast(getErrorMessage(error), 'error');
      }
    },
    [libraryType, showToast]
  );

  // 下载节点（支持多格式）
  const handleDownloadWithFormat = useCallback(
    async (
      nodeId: string,
      nodeName: string,
      format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
      pdfOptions?: {
        width?: string;
        height?: string;
        colorPolicy?: 'mono' | 'color';
      }
    ) => {
      try {
        const { data: blobData } =
          libraryType === 'drawing'
            ? await libraryControllerDownloadDrawingNode({ path: { nodeId }, parseAs: 'blob' })
            : await libraryControllerDownloadBlockNode({ path: { nodeId }, parseAs: 'blob' });

        const blob = blobData instanceof Blob ? blobData : new Blob([blobData as unknown as BlobPart]);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const fileName =
          sanitizeFileName(nodeName).replace(/\.[^.]+$/, '') + `.${format}`;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        showToast(t('已下载：{fileName}', { fileName }), 'success');
      } catch (error) {
        console.error('下载失败:', error);
        showToast(getErrorMessage(error), 'error');
      }
    },
    [libraryType, showToast]
  );

  // 删除节点
  const handleDelete = useCallback(
    (node: LibraryNode) => {
      showConfirm(
        t('确认删除'),
        t('确定要永久删除 "{name}" 吗？公共资源库中的文件删除后无法恢复。', { name: node.name }),
        async () => {
          try {
            const apiMethod =
              libraryType === 'drawing'
                ? libraryControllerDeleteDrawingNode
                : libraryControllerDeleteBlockNode;
            await apiMethod({ path: { nodeId: node.id }, query: { permanently: true }, throwOnError: true });
            showToast(t('删除成功'), 'success');
            if (removeLocalNode) {
              removeLocalNode(node.id);
            } else {
              refreshNodes();
            }
          } catch (error) {
            console.error('删除失败:', error);
            showToast(getErrorMessage(error), 'error');
          }
        },
        'danger',
        t('删除')
      );
    },
    [libraryType, showToast, refreshNodes, showConfirm, removeLocalNode]
  );

  // 重命名节点
  const handleRename = useCallback(
    async (nodeId: string, newName: string, onComplete?: () => void) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryControllerRenameDrawingNode
            : libraryControllerRenameBlockNode;
        await apiMethod({ path: { nodeId }, body: { name: newName }, throwOnError: true });
        showToast(t('重命名成功'), 'success');
        if (updateLocalNode) {
          updateLocalNode(nodeId, { name: newName });
        } else {
          refreshNodes();
        }
        onComplete?.();
      } catch (error) {
        console.error('重命名失败:', error);
        showToast(getErrorMessage(error), 'error');
        throw error;
      }
    },
    [libraryType, showToast, refreshNodes, updateLocalNode]
  );

  // 移动节点
  const handleMove = useCallback(
    async (nodeId: string, targetParentId: string) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryControllerMoveDrawingNode
            : libraryControllerMoveBlockNode;
        await apiMethod({ path: { nodeId }, body: { targetParentId }, throwOnError: true });
        showToast(t('移动成功'), 'success');
        refreshNodes();
      } catch (error) {
        console.error('移动失败:', error);
        showToast(getErrorMessage(error), 'error');
        throw error;
      }
    },
    [libraryType, showToast, refreshNodes]
  );

  // 复制节点
  const handleCopy = useCallback(
    async (nodeId: string, targetParentId: string) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryControllerCopyDrawingNode
            : libraryControllerCopyBlockNode;
        await apiMethod({ path: { nodeId }, body: { targetParentId }, throwOnError: true });
        showToast(t('复制成功'), 'success');
        refreshNodes();
      } catch (error) {
        console.error('复制失败:', error);
        showToast(getErrorMessage(error), 'error');
        throw error;
      }
    },
    [libraryType, showToast, refreshNodes]
  );

  // 批量删除
  const handleBatchDelete = useCallback(
    async (nodeIds: string[]) => {
      try {
        const {
          libraryControllerBatchDeleteDrawingNodes,
          libraryControllerBatchDeleteBlockNodes,
        } = await import('@/api-sdk');
        const fn =
          libraryType === 'drawing'
            ? libraryControllerBatchDeleteDrawingNodes
            : libraryControllerBatchDeleteBlockNodes;
        const { data, error } = await fn({
          body: { nodeIds, permanently: true },
          throwOnError: false,
        });
        if (error) throw error;
        const result = data as unknown as { successCount: number; failedCount: number };
        if (result.failedCount > 0) {
          showToast(t(`成功删除 ${result.successCount} 项，${result.failedCount} 项失败`), 'warning');
        } else {
          showToast(t(`成功删除 ${nodeIds.length} 个项目`), 'success');
        }
        refreshNodes();
      } catch (error) {
        console.error('批量删除失败:', error);
        showToast(getErrorMessage(error), 'error');
        throw error;
      }
    },
    [libraryType, showToast, refreshNodes]
  );

  // 批量移动
  const handleBatchMove = useCallback(
    async (nodeIds: string[], targetParentId: string) => {
      try {
        const {
          libraryControllerBatchMoveDrawingNodes,
          libraryControllerBatchMoveBlockNodes,
        } = await import('@/api-sdk');
        const fn =
          libraryType === 'drawing'
            ? libraryControllerBatchMoveDrawingNodes
            : libraryControllerBatchMoveBlockNodes;
        const { data, error } = await fn({
          body: { nodeIds, targetParentId },
          throwOnError: false,
        });
        if (error) throw error;
        const result = data as unknown as { successCount: number; failedCount: number };
        if (result.failedCount > 0) {
          showToast(t(`成功移动 ${result.successCount} 项，${result.failedCount} 项失败`), 'warning');
        } else {
          showToast(t(`成功移动 ${nodeIds.length} 个项目`), 'success');
        }
        refreshNodes();
      } catch (error) {
        console.error('批量移动失败:', error);
        showToast(getErrorMessage(error), 'error');
        throw error;
      }
    },
    [libraryType, showToast, refreshNodes]
  );

  // 批量复制
  const handleBatchCopy = useCallback(
    async (nodeIds: string[], targetParentId: string) => {
      try {
        const {
          libraryControllerBatchCopyDrawingNodes,
          libraryControllerBatchCopyBlockNodes,
        } = await import('@/api-sdk');
        const fn =
          libraryType === 'drawing'
            ? libraryControllerBatchCopyDrawingNodes
            : libraryControllerBatchCopyBlockNodes;
        const { data, error } = await fn({
          body: { nodeIds, targetParentId },
          throwOnError: false,
        });
        if (error) throw error;
        const result = data as unknown as { successCount: number; failedCount: number };
        if (result.failedCount > 0) {
          showToast(t(`成功复制 ${result.successCount} 项，${result.failedCount} 项失败`), 'warning');
        } else {
          showToast(t(`成功复制 ${nodeIds.length} 个项目`), 'success');
        }
        refreshNodes();
      } catch (error) {
        console.error('批量复制失败:', error);
        showToast(getErrorMessage(error), 'error');
        throw error;
      }
    },
    [libraryType, showToast, refreshNodes]
  );

  return {
    handleDownload,
    handleDownloadWithFormat,
    handleDelete,
    handleRename,
    handleMove,
    handleCopy,
    handleBatchDelete,
    handleBatchMove,
    handleBatchCopy,
  };
}
