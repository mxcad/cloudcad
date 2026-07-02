///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FolderPlus, HardDrive, Save, Scissors, Copy, Trash2, Clipboard, X, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { FileSizeInput, formatFileSize } from '../components/ui/FileSize';
import { DownloadFormatModal } from '../components/modals/DownloadFormatModal';
import { RenameModal } from '../components/modals/RenameModal';
import { LibrarySelectFolderModal } from '../components/modals/LibrarySelectFolderModal';
import { useNotification } from '../contexts/NotificationContext';
import { getErrorMessage } from '../utils/errorHandler';
import { useLibrary } from '../hooks/useLibrary';
import { useLibraryOperations } from '../hooks/library/useLibraryOperations';
import { useLibraryModals } from '../hooks/library/useLibraryModals';
import { useLibraryPagination } from '../hooks/library/useLibraryPagination';
import { useLibraryQuota } from '../hooks/library/useLibraryQuota';
import { usePermission } from '../hooks/usePermission';
import { useFileSystemShortcuts } from '../hooks/file-system/useFileSystemShortcuts';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import {
  libraryControllerCopyDrawingNode,
  libraryControllerCopyBlockNode,
  libraryControllerDeleteDrawingNode,
  libraryControllerDeleteBlockNode,
} from '@/api-sdk';
import { SystemPermission } from '../constants/permissions';
import MxCadUploader from '../components/MxCadUploader';
import { EmptyFolderIcon } from '../components/FileIcons';
import type { FileSystemNode } from '../types/filesystem';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { t } from '@/languages';
import { DirectoryImportDialog } from '../components/DirectoryImportDialog';

import { FileSystemHeader } from './FileSystemManager/FileSystemHeader';
import { FileSystemContent } from './FileSystemManager/FileSystemContent';
import { FileSystemStates } from './FileSystemManager/FileSystemStates';

/**
 * 公共资源库管理页面
 *
 * 设计思想：
 * - 公共资源库是一个特殊的全局项目，不是某个人的资源库
 * - 使用与项目管理相同的 UI 和上传逻辑（MxCadUploader）
 * - 浏览/下载免登录，上传/删除需要管理员权限
 * - 无版本管理、无回收站（删除即永久删除）
 *
 * 功能：
 * - 普通用户：浏览、搜索、下载
 * - 管理员：+ 上传、创建文件夹、删除
 */
export const LibraryManager: React.FC = () => {
  const { libraryType: urlLibraryType } = useParams<{
    libraryType: 'drawing' | 'block';
  }>();
  const navigate = useNavigate();

  // 根据 URL 参数确定库类型，默认为图纸库
  const libraryType: 'drawing' | 'block' =
    urlLibraryType === 'block' ? 'block' : 'drawing';

  useDocumentTitle(libraryType === 'drawing' ? t('图纸库') : t('图块库'));

  // 分页状态 - useLibraryPagination hook
  const {
    currentPage,
    pageSize,
    totalPages,
    total,
    setCurrentPage,
    setPageSize,
    handlePageChange,
    handleTotalPagesChange,
    handleTotalChange,
  } = useLibraryPagination();

  const {
    libraryId,
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    isFetching,
    searchTerm,
    viewMode,
    isFolderMode,
    setLibraryType,
    enterNode,
    refresh,
    setSearchTerm,
    setViewMode,
    createFolder,
    renameNode,
    moveNode,
    downloadNode,
    clearError,
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectNodes,
    batchDeleteNodes,
  } = useLibrary({
    page: currentPage,
    limit: pageSize,
    onPageChange: handlePageChange,
    onTotalPagesChange: handleTotalPagesChange,
    onTotalChange: handleTotalChange,
  });

  const { hasPermission } = usePermission();

  // 权限检查：只有管理员才能上传、创建文件夹、删除
  const canManage =
    libraryType === 'drawing'
      ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)
      : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE);

  // 使用全局通知
  const { showToast, showConfirm: showConfirmPromise } = useNotification();
  
  // Adapt Promise-based showConfirm to callback-style
  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      type?: 'danger' | 'warning' | 'info',
      confirmText?: string
    ) => {
      showConfirmPromise({ title, message, type, confirmText }).then(
        (confirmed) => {
          if (confirmed) {
            onConfirm();
          }
        }
      );
    },
    [showConfirmPromise]
  );

  // UI 状态 - useLibraryModals hook
  const {
    isCreateFolderModalOpen,
    openCreateFolderModal,
    closeCreateFolderModal,
    isRenameModalOpen,
    renamingNode,
    renameName,
    openRenameModal,
    closeRenameModal,
    setRenameName,
    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    openMoveModal,
    openCopyModal,
    openBatchMoveModal,
    openBatchCopyModal,
    closeSelectFolderModal,
    showDownloadFormatModal,
    downloadingNodeId,
    downloadingFileName,
    openDownloadFormatModal,
    closeDownloadFormatModal,
  } = useLibraryModals();

  // 存储配额状态 - useLibraryQuota hook
  const {
    quotaModalOpen,
    quotaLoading,
    libraryQuota,
    defaultLibraryQuota,
    libraryStorageInfo,
    openQuotaModal,
    closeQuotaModal,
    setLibraryQuota,
    saveLibraryQuota,
  } = useLibraryQuota({
    libraryId,
    libraryType,
    showToast,
  });

  // 批量导入对话框状态
  const [showDirectoryImport, setShowDirectoryImport] = React.useState(false);

  // 图书馆操作 Hooks（复用公开资源库的操作函数）
  const libraryOperations = useLibraryOperations({
    libraryType,
    showToast,
    refreshNodes: refresh,
    showConfirm,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // 剪贴板
  const clipboardItems = useFileSystemClipboardStore((s) => s.items);
  const clipboardMode = useFileSystemClipboardStore((s) => s.mode);
  const setClipboard = useFileSystemClipboardStore((s) => s.setClipboard);
  const clearClipboard = useFileSystemClipboardStore((s) => s.clearClipboard);

  // 撤销/重做
  const pushAction = useFileSystemUndoRedoStore((s) => s.pushAction);
  const undoStoreUndo = useFileSystemUndoRedoStore((s) => s.undo);
  const undoStoreRedo = useFileSystemUndoRedoStore((s) => s.redo);
  const undoStack = useFileSystemUndoRedoStore((s) => s.undoStack);
  const redoStack = useFileSystemUndoRedoStore((s) => s.redoStack);

  // 剪贴板操作
  const clipboardHandleCopy = useCallback(() => {
    if (selectedNodes.size === 0) {
      showToast(t('请先选择要复制的文件'), 'info');
      return;
    }
    setClipboard(Array.from(selectedNodes), 'copy', libraryId || '');
    showToast(t(`已复制 ${selectedNodes.size} 个项目`), 'info');
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
    showToast(t(`已剪切 ${selectedNodes.size} 个项目`), 'info');
  }, [selectedNodes, nodes, setClipboard, libraryId, showToast]);

  const clipboardHandlePaste = useCallback(async () => {
    if (clipboardItems.length === 0 || !clipboardMode) return;
    const targetParentId = currentNode?.id || libraryId;
    if (!targetParentId) {
      showToast(t('无法确定粘贴位置'), 'error');
      return;
    }
    try {
      if (clipboardMode === 'cut') {
        for (const nodeId of clipboardItems) {
          await moveNode(nodeId, targetParentId);
        }
        clearClipboard();
        showToast(t('粘贴成功'), 'success');
        pushAction({
          type: 'move',
          description: t(`移动 ${clipboardItems.length} 个项目`),
          projectId: libraryId || undefined,
          execute: async () => {
            for (const nodeId of clipboardItems) {
              await moveNode(nodeId, targetParentId);
            }
          },
          rollback: async () => {
            const origParentIds = useFileSystemClipboardStore.getState().sourceParentIds;
            for (const [nodeId, srcParentId] of Object.entries(origParentIds)) {
              if (srcParentId) {
                await moveNode(nodeId, srcParentId);
              }
            }
          },
        });
      } else {
        const apiMethod = libraryType === 'drawing'
          ? libraryControllerCopyDrawingNode
          : libraryControllerCopyBlockNode;
        const deleteApi = libraryType === 'drawing'
          ? libraryControllerDeleteDrawingNode
          : libraryControllerDeleteBlockNode;

        const createdIdsRef: { current: string[] } = { current: [] };
        for (const nodeId of clipboardItems) {
          try {
            const result = await apiMethod({ path: { nodeId }, body: { targetParentId }, throwOnError: true });
            const data = (result as unknown as { data?: { id?: string } })?.data || result;
            const newId = (data as unknown as { id?: string })?.id || '';
            if (newId) createdIdsRef.current.push(newId);
          } catch {
            // 单个复制失败不影响其他
          }
        }
        showToast(t('粘贴成功'), 'success');
        if (createdIdsRef.current.length > 0) {
          pushAction({
            type: 'paste-copy',
            description: t(`复制 ${clipboardItems.length} 个项目`),
            projectId: libraryId || undefined,
            execute: async () => {
              const newIds: string[] = [];
              for (const nodeId of clipboardItems) {
                try {
                  const result = await apiMethod({ path: { nodeId }, body: { targetParentId }, throwOnError: true });
                  const data = (result as unknown as { data?: { id?: string } })?.data || result;
                  const newId = (data as unknown as { id?: string })?.id || '';
                  if (newId) newIds.push(newId);
                } catch {
                  // skip
                }
              }
              createdIdsRef.current = newIds;
            },
            rollback: async () => {
              for (const id of createdIdsRef.current) {
                try {
                  await deleteApi({ path: { nodeId: id }, query: { permanently: true }, throwOnError: true });
                } catch (e) {
                  if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'NOT_FOUND') continue;
                  throw e;
                }
              }
            },
          });
        }
      }
      refresh();
    } catch (error) {
      showToast(t('粘贴失败'), 'error');
    }
  }, [clipboardItems, clipboardMode, currentNode, libraryId, moveNode, clearClipboard, showToast, pushAction, refresh, libraryType]);

  // 快捷键相关 callback（延迟到 handlers 定义完成后）
  const handleDeleteSelected = useCallback(() => {
    if (selectedNodes.size === 0) return;
    const nodeIds = Array.from(selectedNodes);
    const count = nodeIds.length;
    showConfirm(t('确认删除'), t(`确定要永久删除这 ${count} 个项目吗？删除后无法恢复。`), async () => {
      try {
        const { libraryControllerBatchDeleteDrawingNodes, libraryControllerBatchDeleteBlockNodes } = await import('@/api-sdk');
        const fn = libraryType === 'drawing' ? libraryControllerBatchDeleteDrawingNodes : libraryControllerBatchDeleteBlockNodes;
        const { data, error } = await fn({
          body: { nodeIds, permanently: true },
          throwOnError: false,
        });
        if (error) throw error;
        const result = data as unknown as { successCount: number; failedCount: number };
        if (result.failedCount > 0) {
          showToast(t(`成功删除 ${result.successCount} 项，${result.failedCount} 项失败`), 'warning');
        } else {
          showToast(t(`成功删除 ${count} 个项目`), 'success');
        }
        clearSelection();
        await refresh();
      } catch (error) {
        console.error('批量删除失败:', error);
        showToast(getErrorMessage(error), 'error');
      }
    });
  }, [selectedNodes, showConfirm, libraryType, showToast, clearSelection, refresh]);

  const clipboardHandleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    try {
      const action = undoStack[undoStack.length - 1];
      if (!action) return;
      await undoStoreUndo(libraryId || undefined);
      showToast(t(`已撤销: ${action.description}`), 'info');
      refresh();
    } catch (error) {
      showToast(t('撤销失败'), 'error');
    }
  }, [undoStack, undoStoreUndo, libraryId, showToast, refresh]);

  const clipboardHandleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    try {
      const action = redoStack[redoStack.length - 1];
      if (!action) return;
      await undoStoreRedo(libraryId || undefined);
      showToast(t(`已重做: ${action.description}`), 'info');
      refresh();
    } catch (error) {
      showToast(t('重做失败'), 'error');
    }
  }, [redoStack, undoStoreRedo, libraryId, showToast, refresh]);

  // 打开文件到 CAD 编辑器
  const handleOpenInEditor = useCallback(
    async (node: {
      id: string;
      name: string;
      isFolder?: boolean;
      path?: string;
    }) => {
      // 文件夹直接返回
      if (node.isFolder) {
        return;
      }

      // 统一使用新的路由格式
      try {
        const editorUrl = `/cad-editor/${node.id}?library=${libraryType}&back=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        window.open(editorUrl, '_blank');
        showToast(t(`正在打开：${node.name}`), 'success');
      } catch (err) {
        console.error('打开文件失败:', err);
        showToast(getErrorMessage(err), 'error');
      }
    },
    [libraryType, showToast]
  );

  // 下载文件（支持多格式）
  const handleDownloadWithFormat = useCallback(
    async (
      format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
      pdfOptions?: {
        width?: string;
        height?: string;
        colorPolicy?: 'mono' | 'color';
      }
    ) => {
      if (!downloadingNodeId) return;

      // 获取节点信息
      const node = nodes.find((n) => n.id === downloadingNodeId);
      if (!node) return;

      await libraryOperations.handleDownloadWithFormat(
        downloadingNodeId,
        node.name,
        format,
        pdfOptions
      );
      closeDownloadFormatModal();
    },
    [downloadingNodeId, nodes, libraryOperations, closeDownloadFormatModal]
  );

  // 创建文件夹
  const handleCreateFolder = useCallback(
    async (name: string) => {
      try {
        const parentId = currentNode?.id || libraryId || undefined;
        await createFolder(name, parentId);
        closeCreateFolderModal();
        showToast(t('文件夹创建成功'), 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('创建失败');
        showToast(message, 'error');
      }
    },
    [createFolder, currentNode, libraryId, showToast, closeCreateFolderModal]
  );

  // 删除确认（公共资源库直接永久删除，不走回收站）
  const handleDeleteConfirm = useCallback(
    (nodeId: string, nodeName: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      libraryOperations.handleDelete({
        id: node.id,
        name: node.name,
        isFolder: node.isFolder || false,
        path: node.path,
      });
    },
    [nodes, libraryOperations]
  );

  // 下载文件（免登录）
  const handleDownload = useCallback(
    async (nodeId: string) => {
      await libraryOperations.handleDownload(nodeId);
    },
    [libraryOperations]
  );

  // 重命名节点
  const handleRename = useCallback(
    (node: { id: string; name: string; isFolder?: boolean }) => {
      openRenameModal(node);
    },
    [openRenameModal]
  );

  const handleRenameSelected = useCallback(() => {
    if (selectedNodes.size !== 1) return;
    const nodeId = selectedNodes.values().next().value;
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      handleRename({ id: node.id, name: node.name });
    }
  }, [selectedNodes, nodes, handleRename]);

  useFileSystemShortcuts({
    containerRef,
    enabled: true,
    onUndo: clipboardHandleUndo,
    onRedo: clipboardHandleRedo,
    onCopy: clipboardHandleCopy,
    onCut: clipboardHandleCut,
    onPaste: clipboardHandlePaste,
    onDeleteSelected: handleDeleteSelected,
    onRenameSelected: handleRenameSelected,
    onClearSelection: clearSelection,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  });

  // 执行重命名
  const handleRenameSubmit = useCallback(
    async (newName: string) => {
      if (!renamingNode || !newName.trim()) return;
      try {
        await libraryOperations.handleRename(
          renamingNode.id,
          newName.trim(),
          () => closeRenameModal()
        );
      } catch (_err: unknown) {
        // 错误已在 libraryOperations 中处理
      }
    },
    [renamingNode, libraryOperations, closeRenameModal]
  );

  // 移动节点
  const handleMove = useCallback((node: { id: string; name: string }) => {
    openMoveModal(node);
  }, [openMoveModal]);

  // 复制节点
  const handleCopy = useCallback((node: { id: string; name: string }) => {
    openCopyModal(node);
  }, [openCopyModal]);

  // 选择文件夹确认（移动/复制）
  const handleSelectFolderConfirm = useCallback(
    async (targetParentId: string) => {
      try {
        // 批量移动/复制
        if (moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch') {
          const nodeIds = Array.from(selectedNodes);

          if (moveSourceNode?.id === 'batch') {
            // 批量移动
            await libraryOperations.handleBatchMove(nodeIds, targetParentId);
          } else {
            // 批量复制
            await libraryOperations.handleBatchCopy(nodeIds, targetParentId);
          }

          clearSelection();
        } else if (moveSourceNode) {
          // 单个移动
          await libraryOperations.handleMove(moveSourceNode.id, targetParentId);
        } else if (copySourceNode) {
          // 单个复制
          await libraryOperations.handleCopy(copySourceNode.id, targetParentId);
        }

        closeSelectFolderModal();
      } catch (_err: unknown) {
        // 错误已在 libraryOperations 中处理
      }
    },
    [
      moveSourceNode,
      copySourceNode,
      selectedNodes,
      clearSelection,
      libraryOperations,
      closeSelectFolderModal,
    ]
  );

  // 搜索处理 - 触发重新加载（通过更新 searchTerm 状态）
  const handleSearchSubmit = useCallback(() => {
    // 搜索时重置到第一页
    setCurrentPage(1);
    // useLibrary 会自动监听 searchTerm 变化并重新加载
  }, [setCurrentPage]);

  // 库类型切换
  const handleSwitchLibrary = useCallback(
    (type: 'drawing' | 'block') => {
      // 切换库类型时清空搜索状态
      setSearchTerm('');
      setLibraryType(type);
    },
    [setLibraryType, setSearchTerm]
  );

  // 面包屑导航
  const handleBreadcrumbNav = useCallback(
    (crumb: { id: string; name: string; isRoot?: boolean }) => {
      setSearchTerm('');
      if (crumb.id === libraryId) {
        navigate(`/library/${libraryType}`);
      } else {
        navigate(`/library/${libraryType}/${crumb.id}`);
      }
    },
    [libraryType, libraryId, navigate, setSearchTerm]
  );

  // 返回上一级
  const handleGoBack = useCallback(() => {
    setSearchTerm('');
    if (breadcrumbs.length > 1) {
      const parent = breadcrumbs[breadcrumbs.length - 2];
      if (parent) {
        if (parent.id === libraryId) {
          navigate(`/library/${libraryType}`);
        } else {
          navigate(`/library/${libraryType}/${parent.id}`);
        }
      }
    }
  }, [breadcrumbs, libraryType, libraryId, navigate, setSearchTerm]);

  // 是否在库根目录
  const isAtRoot = !currentNode?.id || currentNode.id === libraryId;

  // 节点权限映射
  const nodePermissions = useMemo(() => {
    const map = new Map<string, { canEdit: boolean; canDelete: boolean; canManageMembers: boolean; canManageRoles: boolean }>();
    for (const node of nodes) {
      map.set(node.id, {
        canEdit: canManage,
        canDelete: canManage,
        canManageMembers: false,
        canManageRoles: false,
      });
    }
    return map;
  }, [nodes, canManage]);

  // 选中 / 剪贴板底部操作栏
  const showSelectionBar = selectedNodes.size > 0;
  const showClipboardBar = !showSelectionBar && clipboardItems.length > 0;
  const handleCancelBar = useCallback(() => {
    clearSelection();
    clearClipboard();
  }, [clearSelection, clearClipboard]);

  const bottomBar = (showSelectionBar || showClipboardBar) ? (
    <div className="flex items-center gap-2 sm:gap-4">
      {showSelectionBar && (
        <>
          <div className="relative flex items-center justify-center min-w-[44px] min-h-[44px]">
            <CheckSquare size={20} style={{ color: 'var(--primary-500)' }} />
            <span
              className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full"
              style={{ background: 'var(--primary-500)', color: 'var(--text-inverse)' }}
            >
              {selectedNodes.size > 99 ? '99+' : selectedNodes.size}
            </span>
          </div>
          <span className="hidden sm:inline text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{t("已选中")} {selectedNodes.size} {t("项")}</span>
          <div className="hidden sm:block w-px h-4" style={{ background: 'var(--border-default)' }} />
          {canManage && (
            <>
              <Button variant="secondary" icon={Scissors} onClick={clipboardHandleCut} style={{ color: 'var(--text-secondary)' }}><span className="hidden sm:inline">{t("剪切")}</span></Button>
              <Button variant="secondary" icon={Copy} onClick={clipboardHandleCopy} style={{ color: 'var(--text-secondary)' }}><span className="hidden sm:inline">{t("复制")}</span></Button>
              <Button variant="secondary" icon={Trash2} onClick={handleDeleteSelected} style={{ color: 'var(--error)' }}><span className="hidden sm:inline">{t("删除")}</span></Button>
            </>
          )}
        </>
      )}
      <div className="flex items-center gap-0 rounded-lg" style={{ border: '1px solid var(--border-default)', overflow: 'hidden' }}>
          <Button variant="secondary" icon={Clipboard} onClick={clipboardHandlePaste} disabled={clipboardItems.length === 0} style={{ color: 'var(--text-secondary)', border: 'none', borderRadius: 0 }} className="relative px-3">
            <span className="hidden sm:inline">{t("粘贴")}</span>
          {clipboardItems.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-none" style={{ background: 'var(--primary-500)', color: '#fff' }}>
              {clipboardItems.length}
            </span>
          )}
        </Button>
        {clipboardItems.length > 0 && (
          <Button variant="secondary" onClick={clearClipboard} style={{ color: 'var(--text-muted)', border: 'none', borderRadius: 0, padding: '0 8px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </Button>
        )}
      </div>
      <Button variant="secondary" icon={X} onClick={handleCancelBar} style={{ color: 'var(--text-muted)' }}>
        <span className="hidden sm:inline">{t("取消")}</span>
      </Button>
    </div>
  ) : undefined;

  const isEmpty = nodes.length === 0 && !loading && !error;

  // 自定义空状态视图
  const emptyView = (
    <div className="flex flex-col items-center justify-center h-full">
      <EmptyFolderIcon size={80} className="text-slate-300 mb-6 animate-float" />
      <h3 className="text-xl font-bold text-slate-900 mb-2" style={{ color: 'var(--text-primary)' }}>
        {isFolderMode ? t('文件夹是空的') : t('资源库暂无内容')}
      </h3>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        {canManage
          ? t('上传文件或创建文件夹开始使用')
          : t('资源库暂无内容，请稍后再来')}
      </p>
      {canManage && (
        <div className="flex gap-2">
          <Button onClick={openCreateFolderModal} variant="outline">
            {t('创建文件夹')}
          </Button>
        </div>
      )}
    </div>
  );

  // 库类型 Select + 管理员快捷操作（自定义右侧按钮）
  const renderExtraActions = useMemo(() => (
    <>
      <Select
        value={libraryType}
        onChange={(val) => handleSwitchLibrary(val as 'drawing' | 'block')}
        options={[
          { value: 'drawing', label: t('图纸库') },
          { value: 'block', label: t('图块库') },
        ]}
        size="sm"
      />
      {canManage && (
        <Tooltip content={t('存储配额')}>
          <Button
            onClick={openQuotaModal}
            variant="secondary"
            size="sm"
            className="hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <HardDrive size={16} />
          </Button>
        </Tooltip>
      )}
      {canManage && (
        <Button
          onClick={() => setShowDirectoryImport(true)}
          variant="secondary"
          size="sm"
          className="hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="hidden sm:inline">{t("批量导入")}</span>
        </Button>
      )}
    </>
  ), [libraryType, canManage, handleSwitchLibrary, openQuotaModal, setShowDirectoryImport]);

  return (
    <>
    <div ref={containerRef} className="h-full flex flex-col overflow-hidden p-6">
        {/* 顶部导航栏：复用 FileSystemHeader */}
        <div className="flex-shrink-0 max-w-7xl mx-auto w-full space-y-6 relative">
          <FileSystemHeader
            mode="project"
            isAtRoot={false}
            isTrashView={false}
            isPersonalSpaceMode={false}
            isProjectRootMode={false}
            loading={loading}
            isFetching={isFetching}
            searchTerm={searchTerm}
            viewMode={viewMode}
            selectedNodes={selectedNodes}
            nodesCount={nodes.length}
            projectFilter="all"
            breadcrumbs={breadcrumbs}
            canCreateProject={false}
            uploadButton={canManage && (
              <MxCadUploader
                nodeId={() => currentNode?.id || libraryId || ''}
                openAfterUpload={false}
                onSuccess={() => {                 refresh(); showToast(t('文件上传成功'), 'success');  }}
                buttonText=""
                buttonClassName="hover:bg-[var(--bg-tertiary)]"
              />
            )}
            onSetSearchTerm={setSearchTerm}
            onSetViewMode={setViewMode}
            onSearchSubmit={handleSearchSubmit}
            onSelectAll={handleSelectAll}
            onToggleTrashView={() => {}}
            onClearTrash={() => {}}
            onProjectFilterChange={() => {}}
            onRefresh={refresh}
            onCreateFolder={canManage ? openCreateFolderModal : undefined}
            onCreateProject={() => {}}
            onGoBack={handleGoBack}
            onBreadcrumbNavigate={handleBreadcrumbNav}
            showToast={showToast}
            clipboardCount={clipboardItems.length}
            clipboardMode={clipboardMode}
            onCopy={clipboardHandleCopy}
            onCut={clipboardHandleCut}
            onPaste={clipboardHandlePaste}
            hideTrashButton={true}
            hideBackButton={isAtRoot}
            renderExtraActions={renderExtraActions}
          />
        </div>

        {/* 主内容区 */}
        <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full mt-6 flex flex-col gap-3">
          <div
            className="flex-1 min-h-0 rounded-2xl shadow-sm overflow-hidden"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="h-full rounded-2xl flex flex-col overflow-hidden">
              {loading || error || isEmpty ? (
                <div className="flex-1 flex items-center justify-center">
                  <FileSystemStates
                    loading={loading}
                    error={error}
                    isEmpty={isEmpty}
                    isAtRoot={false}
                    isTrashView={false}
                    searchTerm={searchTerm}
                    canCreateProject={false}
                    projectFilter="all"
                    onRefresh={refresh}
                    onCreateProject={() => {}}
                    renderEmptyView={emptyView}
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col">
                  <FileSystemContent
                    nodes={nodes}
                    viewMode={viewMode}
                    isTrashView={false}
                    isAtRoot={false}
                    selectedNodes={selectedNodes}
                    dropTargetId={null}
                    nodePermissions={nodePermissions}
                    projectPermissions={{}}
                    paginationMeta={{
                      total,
                      page: currentPage,
                      limit: pageSize,
                      totalPages: Math.max(totalPages, 1),
                    }}
                    onNodeSelect={(nodeId, ctrlKey) => handleNodeSelect(nodeId, ctrlKey)}
                    onFileOpen={(node) => {
                      if (node.isFolder) {
                        enterNode(node);
                      } else {
                        handleOpenInEditor(node);
                      }
                    }}
                    onDownload={(node) => {
                      if (!node.isFolder) {
                        openDownloadFormatModal(node.id, node.name);
                      }
                    }}
                    onDelete={(node) => handleDeleteConfirm(node.id, node.name)}
                    onPermanentlyDelete={() => {}}
                    onRename={(node) => handleRename({ id: node.id, name: node.name })}
                    onRefresh={refresh}
                    onRestore={undefined}
                    onEdit={undefined}
                    onDeleteNode={undefined}
                    onShowMembers={undefined}
                    onShowRoles={undefined}
                    onMove={canManage ? (node) => handleMove({ id: node.id, name: node.name }) : undefined}
                    onCopy={canManage ? (node) => handleCopy({ id: node.id, name: node.name }) : undefined}
                    onShowVersionHistory={undefined}
                    onShare={undefined}
                    onDragStart={() => {}}
                    onDragOver={() => {}}
                    onDragLeave={() => {}}
                    onDrop={() => {}}
                    onPageChange={(newPage) => { setCurrentPage(newPage); }}
                    onPageSizeChange={(newPageSize) => { setPageSize(newPageSize); setCurrentPage(1); }}
                    onRubberBandSelect={selectNodes}
                    onBatchDelete={canManage ? (() => {
                      const nodeIds = Array.from(selectedNodes);
                      const count = nodeIds.length;
    showConfirm(t('确认删除'), t(`确定要永久删除这 ${count} 个项目吗？删除后无法恢复。`), async () => {
                        try {
                          const { libraryControllerBatchDeleteDrawingNodes, libraryControllerBatchDeleteBlockNodes } = await import('@/api-sdk');
                          const fn = libraryType === 'drawing'
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
          showToast(t(`成功删除 ${count} 个项目`), 'success');
                          }
                          clearSelection();
                          await refresh();
                        } catch (error) {
                          console.error('批量删除失败:', error);
                          showToast(getErrorMessage(error), 'error');
                        }
                      });
                    }) : undefined}
                    onBatchMove={canManage ? clipboardHandleCut : undefined}
                    onBatchCopy={canManage ? clipboardHandleCopy : undefined}
                    loading={loading || isFetching}
                    onScrollPageChange={() => {}}
                    isSearchResult={false}
                    onOpen={(node) => {
                      if (node.isFolder) {
                        enterNode(node);
                      } else {
                        handleOpenInEditor(node);
                      }
                    }}
                    onOpenInNewTab={(node) => {
                      if (!node.isFolder) {
                        handleOpenInEditor(node);
                      }
                    }}
                    onCopyClipboard={canManage ? (node) => clipboardHandleCopy() : undefined}
                    onCut={canManage ? (node) => clipboardHandleCut() : undefined}
                    onCreateFolderInCurrentDir={canManage ? openCreateFolderModal : undefined}
                    onPasteInCurrentDir={clipboardHandlePaste}
                    clipboardHasItems={clipboardItems.length > 0}
                  />
                </div>
              )}
            </div>
          </div>
          {bottomBar && (
            <div className="flex-shrink-0 flex justify-center">
              <div className="inline-flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3 rounded-full shadow-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                {bottomBar}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      <Modal
        isOpen={isCreateFolderModalOpen}
        onClose={closeCreateFolderModal}
        title={t('新建文件夹')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const name = formData.get('name') as string;
            if (name.trim()) {
              handleCreateFolder(name.trim());
            }
          }}
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="folderName"
                className="block text-sm font-medium mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('文件夹名称')}
              </label>
              <Input
                type="text"
                id="folderName"
                name="name"
                required
                placeholder={t('请输入文件夹名称')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateFolderModal}
              >
                {t('取消')}
              </Button>
              <Button type="submit" variant="primary">
                {t('创建')}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* 重命名模态框 */}
      <RenameModal
        isOpen={isRenameModalOpen}
        editingNode={renamingNode as unknown as FileSystemNode | null}
        newName={renameName}
        loading={false}
        onClose={closeRenameModal}
        onNameChange={setRenameName}
        onRename={() => handleRenameSubmit(renameName)}
      />

      {/* 选择文件夹弹窗（移动/复制） */}
      <LibrarySelectFolderModal
        isOpen={showSelectFolderModal}
        libraryType={libraryType}
        currentNodeId={moveSourceNode?.id || copySourceNode?.id || ''}
        onConfirm={handleSelectFolderConfirm}
        onClose={closeSelectFolderModal}
      />

      {/* 下载格式选择弹窗 */}
      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        fileName={downloadingFileName || ''}
        onClose={closeDownloadFormatModal}
        onDownload={handleDownloadWithFormat}
      />

      {/* 批量导入对话框 */}
      <DirectoryImportDialog
        open={showDirectoryImport}
        onClose={() => setShowDirectoryImport(false)}
        targetParentId={currentNode?.id || libraryId || ''}
        libraryType={libraryType}
        onSuccess={(success) => {
          refresh();
          showToast(success ? t('批量导入成功') : t('批量导入完成（部分文件导入失败）'), success ? 'success' : 'warning');
        }}
      />

      {/* 存储配额配置模态框 */}
      <Modal
        isOpen={quotaModalOpen}
        onClose={closeQuotaModal}
        title={t('配置公共资源库存储配额')}
        className="max-w-md"
        footer={
          <div className="modal-footer">
            <Button
              variant="secondary"
              onClick={closeQuotaModal}
              disabled={quotaLoading}
            >
              {t('取消')}
            </Button>
            <Button
              onClick={saveLibraryQuota}
              loading={quotaLoading}
              icon={Save}
              className="submit-btn"
            >
              {t('保存')}
            </Button>
          </div>
        }
      >
        <div className="quota-config-content">
          <div className="quota-library-info">
            <div className="library-icon-lg">
              <HardDrive size={24} />
            </div>
            <div className="library-info-text">
              <p className="library-name">
                {libraryType === 'drawing' ? t('图纸库') : t('图块库')}
              </p>
              <p className="library-type">{t('公共资源库')}</p>
            </div>
          </div>

          <div className="quota-form">
            <label className="quota-label">
              <HardDrive size={16} />
              <span>{t('库存储配额')}</span>
            </label>
            <FileSizeInput
              value={libraryQuota > 0 ? libraryQuota * 1024 * 1024 * 1024 : 0}
              onChange={(bytes) => {
                if (bytes === undefined) return;
                setLibraryQuota(parseFloat((bytes / (1024 * 1024 * 1024)).toFixed(2)));
              }}
              min={0}
              defaultUnit="GB"
              units={['MB', 'GB', 'TB']}
            />
            <p className="quota-hint">
              {t('默认配额：{quota} GB').replace('{quota}', String(defaultLibraryQuota))}
              {libraryQuota === 0 && <span style={{ color: 'var(--text-muted)' }}>{t('（跟随系统）')}</span>}
            </p>
            {libraryStorageInfo && (
              <div className="quota-preview">
                <div className="quota-bar">
                  <div
                    className="quota-bar-fill"
                    style={{
                      width: `${Math.min(libraryStorageInfo.usagePercent || 0, 100)}%`,
                    }}
                  />
                </div>
                <p className="quota-text">
                  {t('已使用：')}{formatFileSize(libraryStorageInfo.used)} /{' '}
                  {formatFileSize(libraryStorageInfo.total)} (
                  {libraryStorageInfo.usagePercent?.toFixed(1)}%)
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default LibraryManager;
