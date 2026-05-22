///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckSquare } from 'lucide-react';
import { Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { FileNameInput } from '../components/ui/FileNameInput';
import { SearchInput } from '../components/search/SearchInput';
import { DownloadFormatModal } from '../components/modals/DownloadFormatModal';
import { RenameModal } from '../components/modals/RenameModal';
import { LibrarySelectFolderModal } from '../components/modals/LibrarySelectFolderModal';
import { useNotification, useConfirmDialog } from '../contexts/NotificationContext';
import { Pagination } from '../components/ui/Pagination';
import { BreadcrumbNavigation } from '../components/BreadcrumbNavigation';
import { FileItem } from '../components/FileItem';
import { useLibrary } from '../hooks/useLibrary';
import { useLibraryOperations } from '../hooks/library/useLibraryOperations';
import { useLibraryModals } from '../hooks/library/useLibraryModals';
import { useLibraryPagination } from '../hooks/library/useLibraryPagination';
import { useLibraryQuota } from '../hooks/library/useLibraryQuota';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';
// TODO: Replace with SDK when backend adds delete endpoints
import { deleteDrawingNode, deleteBlockNode } from '../utils/libraryApi';
import MxCadUploader, { MxCadUploaderRef } from '../components/MxCadUploader';
import {
  EmptyFolderIcon,
  RefreshIcon,
} from '../components/FileIcons';
import { ViewToggle } from '@/components/common/ViewToggle';
import type { FileSystemNode } from '../types/filesystem';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { DirectoryImportDialog } from '../components/DirectoryImportDialog';
import { formatFileSize } from '../utils/fileUtils';
import { HardDrive, Save } from 'lucide-react';

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

  useDocumentTitle(libraryType === 'drawing' ? '图纸库' : '图块库');

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
    deleteNode,
    renameNode,
    moveNode,
    copyNode,
    downloadNode,
    clearError,
    selectedNodes,
    isMultiSelectMode,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    toggleMultiSelectMode,
    batchDeleteNodes,
  } = useLibrary({
    page: currentPage,
    limit: pageSize,
    onPageChange: handlePageChange,
    onTotalPagesChange: handleTotalPagesChange,
    onTotalChange: handleTotalChange,
  });

  const { hasPermission, getUserPermissions } = usePermission();

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

  // 上传组件 ref - 完全复用项目管理的 MxCadUploader
  const uploaderRef = useRef<MxCadUploaderRef>(null);

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
        showToast(`正在打开：${node.name}`, 'success');
      } catch (err) {
        console.error('打开文件失败:', err);
        showToast('打开文件失败', 'error');
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
        showToast('文件夹创建成功', 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '创建失败';
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

  // 上传成功回调（MxCadUploader 不再自己弹 toast，由这里统一处理）
  const handleUploadSuccess = useCallback(() => {
    refresh();
    showToast('文件上传成功', 'success');
  }, [refresh, showToast]);

  // 上传失败回调（MxCadUploader 已通过 globalShowToast 显示了错误，这里不再重复提示）
  const handleUploadError = useCallback(
    (_error: string) => {
      // 错误已由 MxCadUploader 的 globalShowToast 统一处理
    },
    []
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

  return (
    <div className="h-full flex flex-col overflow-hidden p-6">
      {/* 顶部导航栏 */}
      <div className="flex-shrink-0 max-w-7xl mx-auto w-full mb-6">
        <div className="card-theme p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                公共资源库
              </h1>
              {/* 库类型切换 */}
              <Select
                value={libraryType}
                onChange={(val) => handleSwitchLibrary(val as 'drawing' | 'block')}
                options={[
                  { value: 'drawing', label: '图纸库' },
                  { value: 'block', label: '图块库' },
                ]}
                size="sm"
              />
              {/* 存储配额按钮 */}
              {canManage && (
                <Button
                  onClick={openQuotaModal}
                  variant="secondary"
                  icon={HardDrive}
                  title="配置存储配额"
                >
                  存储配额
                </Button>
              )}
            </div>

            {/* 管理员操作按钮：只有管理员才显示 */}
            {canManage && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={openCreateFolderModal}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <FolderPlus size={18} />
                  新建文件夹
                </Button>
                <Button
                  onClick={() => setShowDirectoryImport(true)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <FolderPlus size={18} />
                  批量导入
                </Button>
                {/* 使用 MxCadUploader 组件，完全复用项目管理的上传逻辑 */}
                <MxCadUploader
                  ref={uploaderRef}
                  nodeId={currentNode?.id || libraryId || undefined}
                  onSuccess={handleUploadSuccess}
                  onError={handleUploadError}
                  buttonText="上传文件"
                  showProgress={true}
                  openAfterUpload={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full">
        <div className="card-theme p-4 flex flex-col h-full">
          {/* 面包屑和工具栏 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            {/* 面包屑导航 */}
            <div className="flex-1 min-w-0">
              <BreadcrumbNavigation
                breadcrumbs={breadcrumbs.map((b) => ({
                  id: b.id,
                  name: b.name,
                  isRoot: false,
                }))}
                onNavigate={(breadcrumb) => {
                  // 面包屑导航时清空搜索状态
                  setSearchTerm('');
                  if (breadcrumb.id === libraryId) {
                    navigate(`/library/${libraryType}`);
                  } else {
                    navigate(`/library/${libraryType}/${breadcrumb.id}`);
                  }
                }}
              />
            </div>

            {/* 工具栏 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 搜索框 */}
              <SearchInput
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onSearch={() => handleSearchSubmit()}
                placeholder="搜索文件..."
              />

              {/* 视图切换 */}
              <ViewToggle viewMode={viewMode} onChange={setViewMode} />

              {/* 刷新按钮 */}
              <Button
                onClick={refresh}
                loading={isFetching}
                variant="ghost"
                title="刷新"
              >
                <RefreshIcon size={18} />
              </Button>

              {/* 多选模式切换按钮 */}
              <Button
                onClick={toggleMultiSelectMode}
                variant="ghost"
                style={{
                  background: isMultiSelectMode
                    ? 'var(--primary-100)'
                    : 'transparent',
                  color: isMultiSelectMode
                    ? 'var(--primary-600)'
                    : 'var(--text-tertiary)',
                }}
                title="多选模式"
              >
                {isMultiSelectMode ? (
                  <Square size={18} />
                ) : (
                  <CheckSquare size={18} />
                )}
              </Button>

              {/* 全选按钮 - 仅在多选模式下显示 */}
              {isMultiSelectMode && nodes.length > 0 && (
                <Button
                  onClick={handleSelectAll}
                  variant="ghost"
                  style={{ color: 'var(--text-tertiary)' }}
                  title={
                    selectedNodes.size === nodes.length ? '取消全选' : '全选'
                  }
                >
                  {selectedNodes.size === nodes.length ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <path d="M9 9l6 6M15 9l-6 6" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle
                size={20}
                className="text-red-500 flex-shrink-0 mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <Button
                onClick={clearError}
                variant="ghost"
                className="text-red-500 hover:text-red-700"
              >
                关闭
              </Button>
            </div>
          )}

          {/* 文件列表 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
              </div>
            ) : nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <EmptyFolderIcon
                  size={80}
                  className="text-slate-300 mb-6 animate-float"
                />
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  {isFolderMode ? '文件夹是空的' : '资源库暂无内容'}
                </h3>
                <p className="text-slate-500 text-sm mb-6">
                  {canManage
                    ? '上传文件或创建文件夹开始使用'
                    : '资源库暂无内容，请稍后再来'}
                </p>
                {canManage && (
                  <div className="flex gap-2">
                    <Button
                      onClick={openCreateFolderModal}
                      variant="outline"
                    >
                      创建文件夹
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-2'
                    : 'space-y-2 p-6'
                }
              >
                {nodes.map((node) => (
                  <FileItem
                    key={node.id}
                    node={node}
                    viewMode={viewMode}
                    canDownload={true}
                    canDelete={canManage}
                    canEdit={canManage}
                    canManageExternalReference={canManage}
                    isMultiSelectMode={isMultiSelectMode}
                    isSelected={selectedNodes.has(node.id)}
                    onSelect={(nodeId, isMultiSelect, isShift) => {
                      handleNodeSelect(nodeId, isMultiSelect, isShift);
                    }}
                    onEnter={(node) => {
                      if (isMultiSelectMode) {
                        handleNodeSelect(node.id, true, false);
                      } else if (node.isFolder) {
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
                    onDelete={() => handleDeleteConfirm(node.id, node.name)}
                    onRename={() =>
                      handleRename({ id: node.id, name: node.name })
                    }
                    onMove={() => handleMove({ id: node.id, name: node.name })}
                    onCopy={() => handleCopy({ id: node.id, name: node.name })}
                    compact={false}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 多选操作条 */}
          {isMultiSelectMode && selectedNodes.size > 0 && (
            <div className="flex-shrink-0 flex justify-center py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="inline-flex items-center gap-4 px-6 py-3 rounded-full shadow-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                  已选中 {selectedNodes.size} 项
                </span>
                <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />
                {canManage && (
                  <>
                    <Button onClick={() => openBatchMoveModal(selectedNodes.size)} variant="ghost" style={{ color: 'var(--text-secondary)' }}>移动</Button>
                    <Button onClick={() => openBatchCopyModal(selectedNodes.size)} variant="ghost" style={{ color: 'var(--text-secondary)' }}>复制</Button>
                    <Button
                      onClick={() => {
                        const nodeIds = Array.from(selectedNodes);
                        const count = nodeIds.length;
                        showConfirm('确认删除', `确定要永久删除这 ${count} 个项目吗？删除后无法恢复。`, async () => {
                          try {
                            for (const nodeId of nodeIds) {
                              const apiMethod = libraryType === 'drawing' ? deleteDrawingNode : deleteBlockNode;
                              await apiMethod(nodeId, true);
                            }
                            showToast(`成功删除 ${count} 个项目`, 'success');
                            clearSelection();
                            await refresh();
                          } catch (error) {
                            console.error('批量删除失败:', error);
                            showToast('批量删除失败', 'error');
                          }
                        });
                      }}
                      variant="ghost"
                      style={{ color: 'var(--error)' }}
                    >批量删除</Button>
                  </>
                )}
                <Button onClick={clearSelection} variant="ghost" style={{ color: 'var(--text-secondary)' }}>取消选择</Button>
              </div>
            </div>
          )}

          {/* 分页 */}
          <div className="flex-shrink-0 mt-4 flex justify-center">
            <Pagination
              meta={{
                total,
                page: currentPage,
                limit: pageSize,
                totalPages: Math.max(totalPages, 1),
              }}
              onPageChange={(newPage: number) => {
                setCurrentPage(newPage);
              }}
              onPageSizeChange={(newPageSize: number) => {
                setPageSize(newPageSize);
                setCurrentPage(1);
              }}
              showSizeChanger={true}
            />
          </div>
        </div>
      </div>

      {/* 弹窗 */}
      <Modal
        isOpen={isCreateFolderModalOpen}
        onClose={closeCreateFolderModal}
        title="新建文件夹"
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
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                文件夹名称
              </label>
              <Input
                type="text"
                id="folderName"
                name="name"
                required
                placeholder="请输入文件夹名称"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateFolderModal}
              >
                取消
              </Button>
              <Button type="submit" variant="primary">
                创建
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
        onSuccess={() => {
          refresh();
          showToast('批量导入成功', 'success');
        }}
      />

      {/* 存储配额配置模态框 */}
      <Modal
        isOpen={quotaModalOpen}
        onClose={closeQuotaModal}
        title="配置公共资源库存储配额"
        className="max-w-md"
        footer={
          <div className="modal-footer">
            <Button
              variant="ghost"
              onClick={closeQuotaModal}
              disabled={quotaLoading}
            >
              取消
            </Button>
            <Button
              onClick={saveLibraryQuota}
              loading={quotaLoading}
              icon={Save}
              className="submit-btn"
            >
              保存
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
                {libraryType === 'drawing' ? '图纸库' : '图块库'}
              </p>
              <p className="library-type">公共资源库</p>
            </div>
          </div>

          <div className="quota-form">
            <label className="quota-label">
              <HardDrive size={16} />
              <span>库存储配额</span>
            </label>
            <FileNameInput
              type="number"
              value={libraryQuota}
              onChange={(e) => {
                const gb = parseInt(e.target.value, 10);
                if (!isNaN(gb) && gb >= 0) {
                  setLibraryQuota(gb);
                }
              }}
              min="0"
              step="1"
              suffix="GB"
            />
            <p className="quota-hint">默认配额：{defaultLibraryQuota} GB</p>
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
                  已使用：{formatFileSize(libraryStorageInfo.used)} /{' '}
                  {formatFileSize(libraryStorageInfo.total)} (
                  {libraryStorageInfo.usagePercent?.toFixed(1)}%)
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LibraryManager;
