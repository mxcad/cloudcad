///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckSquare } from 'lucide-react';
import { Square } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DownloadFormatModal } from '../components/modals/DownloadFormatModal';
import { RenameModal } from '../components/modals/RenameModal';
import { LibrarySelectFolderModal } from '../components/modals/LibrarySelectFolderModal';
import { useNotification } from '../contexts/NotificationContext';
import { Pagination } from '../components/ui/Pagination';
import { BreadcrumbNavigation } from '../components/BreadcrumbNavigation';
import { FileItem } from '../components/FileItem';
import { useLibrary } from '../hooks/useLibrary';
import { useLibraryOperations } from '../hooks/library/useLibraryOperations';
import { usePermission } from '../hooks/usePermission';
import { SystemPermission } from '../constants/permissions';
import { libraryApi } from '../services/libraryApi';
import { projectApi } from '@/services/projectApi';
import { runtimeConfigApi } from '../services/runtimeConfigApi';
import MxCadUploader, { MxCadUploaderRef } from '../components/MxCadUploader';
import {
  EmptyFolderIcon,
  RefreshIcon,
  SearchIcon,
  GridIcon,
  ListIcon,
} from '../components/FileIcons';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFileSystemStore } from '../stores/fileSystemStore';
import { DirectoryImportDialog } from '../components/DirectoryImportDialog';
import { formatFileSize } from '../utils/fileUtils';
import { HardDrive, Save, Loader2 } from 'lucide-react';

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

  // 分页状态 - 从 store 读取 pageSize 实现持久化
  const { pageSize: storePageSize, setPageSize: setStorePageSize } =
    useFileSystemStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(storePageSize);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 回调函数使用 useCallback 包裹，避免无限重渲染
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleTotalPagesChange = useCallback((pages: number) => {
    setTotalPages(pages);
  }, []);

  const handleTotalChange = useCallback((total: number) => {
    setTotal(total);
  }, []);

  // 同步 pageSize 到 store
  useEffect(() => {
    if (pageSize !== storePageSize) {
      setStorePageSize(pageSize);
    }
  }, [pageSize, storePageSize, setStorePageSize]);

  const {
    libraryId,
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    searchTerm,
    viewMode,
    isFolderMode,
    setLibraryType,
    enterNode,
    enterParent,
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

  // UI 状态
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renamingNode, setRenamingNode] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [copySourceNode, setCopySourceNode] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // 下载格式模态框状态
  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNodeId, setDownloadingNodeId] = useState<string | null>(
    null
  );
  const [downloadingFileName, setDownloadingFileName] = useState<string | null>(
    null
  );

  // 存储配额状态
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [libraryQuota, setLibraryQuota] = useState<number>(100);
  const [defaultLibraryQuota, setDefaultLibraryQuota] = useState<number>(100);
  const [libraryStorageInfo, setLibraryStorageInfo] = useState<any>(null);

  // 使用全局通知
  const { showToast } = useNotification();

  // 显示确认对话框（适配 useLibraryOperations 的接口）
  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => Promise<void> | void,
      _type?: 'danger' | 'warning' | 'info' | 'success',
      _confirmText?: string
    ) => {
      setConfirmDialog({
        isOpen: true,
        title,
        message,
        onConfirm: async () => {
          await onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
    },
    []
  );

  // 图书馆操作 Hooks（复用公开资源库的操作函数）
  const libraryOperations = useLibraryOperations({
    libraryType,
    showToast,
    refreshNodes: refresh,
    showConfirm,
  });

  // 上传组件 ref - 完全复用项目管理的 MxCadUploader
  const uploaderRef = useRef<MxCadUploaderRef>(null);

  // 批量导入对话框状态
  const [showDirectoryImport, setShowDirectoryImport] = useState(false);

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
        const editorUrl = `/cad-editor/${node.id}?library=${libraryType}`;
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
      setShowDownloadFormatModal(false);
      setDownloadingNodeId(null);
    },
    [downloadingNodeId, nodes, libraryOperations]
  );

  // 创建文件夹
  const handleCreateFolder = useCallback(
    async (name: string) => {
      try {
        const parentId = currentNode?.id || libraryId || undefined;
        await createFolder(name, parentId);
        setIsCreateFolderModalOpen(false);
        showToast('文件夹创建成功', 'success');
      } catch (err: any) {
        showToast(err.message || '创建失败', 'error');
      }
    },
    [createFolder, currentNode, libraryId, showToast]
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

  // 上传成功回调
  const handleUploadSuccess = useCallback(() => {
    refresh();
    showToast('文件上传成功', 'success');
  }, [refresh, showToast]);

  // 上传失败回调
  const handleUploadError = useCallback(
    (error: string) => {
      showToast(error, 'error');
    },
    [showToast]
  );

  // 下载文件（免登录）
  const handleDownload = useCallback(
    async (nodeId: string) => {
      await libraryOperations.handleDownload(nodeId);
    },
    [libraryOperations]
  );

  // 存储配额相关方法
  const openQuotaModal = useCallback(async () => {
    setQuotaModalOpen(true);
    setQuotaLoading(true);

    try {
      // 获取默认配额（GB）
      const configResponse = await runtimeConfigApi.getPublicConfigs();
      const configs = configResponse.data as Record<string, number> | undefined;
      const defaultVal = configs?.libraryStorageQuota || 100;
      setDefaultLibraryQuota(defaultVal);

      // 获取公共资源库的存储信息
      if (libraryId) {
        const response = await projectApi.getQuota(libraryId);
        const storageInfo = response.data;

        if (storageInfo) {
          setLibraryStorageInfo(storageInfo);
          // total 是字节，转换为 GB
          const totalGB = Math.round(
            (storageInfo.total || defaultVal * 1024 * 1024 * 1024) /
              (1024 * 1024 * 1024)
          );
          setLibraryQuota(totalGB);
        }
      } else {
        // 没有库 ID 时使用默认值
        setLibraryQuota(defaultVal);
      }
    } catch (error) {
      console.error('获取库配额失败:', error);
      showToast('获取库配额失败', 'error');
    } finally {
      setQuotaLoading(false);
    }
  }, [libraryId, showToast]);

  const saveLibraryQuota = useCallback(async () => {
    if (!libraryId) {
      showToast('无法获取库节点 ID', 'error');
      return;
    }

    setQuotaLoading(true);
    try {
      // 调用后端 API 更新库节点配额（GB）
      await projectApi.updateStorageQuota(libraryId, libraryQuota);

      showToast(`库配额已更新为 ${libraryQuota} GB`, 'success');
      setQuotaModalOpen(false);

      // 刷新库配额信息
      const response = await projectApi.getQuota(libraryId);
      if (response.data) {
        setLibraryStorageInfo(response.data);
      }
    } catch (error: any) {
      console.error('保存库配额失败:', error);
      showToast(error.response?.data?.message || '保存配额失败', 'error');
    } finally {
      setQuotaLoading(false);
    }
  }, [libraryId, libraryQuota, showToast]);

  // 重命名节点
  const handleRename = useCallback(
    (node: { id: string; name: string; isFolder?: boolean }) => {
      setRenamingNode(node);
      // 如果是文件，去除扩展名
      if (!node.isFolder && node.name) {
        const lastDotIndex = node.name.lastIndexOf('.');
        const nameWithoutExtension =
          lastDotIndex !== -1
            ? node.name.substring(0, lastDotIndex)
            : node.name;
        setRenameName(nameWithoutExtension);
      } else {
        setRenameName(node.name);
      }
      setIsRenameModalOpen(true);
    },
    []
  );

  // 执行重命名
  const handleRenameSubmit = useCallback(
    async (newName: string) => {
      if (!renamingNode || !newName.trim()) return;
      try {
        await libraryOperations.handleRename(
          renamingNode.id,
          newName.trim(),
          () => {
            setIsRenameModalOpen(false);
            setRenamingNode(null);
            setRenameName('');
          }
        );
      } catch (err: any) {
        // 错误已在 libraryOperations 中处理
      }
    },
    [renamingNode, libraryOperations]
  );

  // 移动节点
  const handleMove = useCallback((node: { id: string; name: string }) => {
    setMoveSourceNode(node);
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  // 复制节点
  const handleCopy = useCallback((node: { id: string; name: string }) => {
    setCopySourceNode(node);
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

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

        setShowSelectFolderModal(false);
        setMoveSourceNode(null);
        setCopySourceNode(null);
      } catch (err: any) {
        // 错误已在 libraryOperations 中处理
      }
    },
    [
      moveSourceNode,
      copySourceNode,
      selectedNodes,
      clearSelection,
      libraryOperations,
    ]
  );

  // 搜索处理 - 触发重新加载（通过更新 searchTerm 状态）
  const handleSearchSubmit = useCallback(() => {
    // 搜索时重置到第一页
    setCurrentPage(1);
    // useLibrary 会自动监听 searchTerm 变化并重新加载
  }, []);

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
    <div className="min-h-screen p-6">
      {/* 顶部导航栏 */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="card-theme p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                公共资源库
              </h1>
              {/* 库类型切换 */}
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  onClick={() => handleSwitchLibrary('drawing')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    libraryType === 'drawing'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  图纸库
                </button>
                <button
                  onClick={() => handleSwitchLibrary('block')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    libraryType === 'block'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  图块库
                </button>
              </div>
              {/* 存储配额按钮 */}
              {canManage && (
                <button
                  onClick={openQuotaModal}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                  title="配置存储配额"
                >
                  <HardDrive size={16} />
                  <span>存储配额</span>
                </button>
              )}
            </div>

            {/* 管理员操作按钮：只有管理员才显示 */}
            {canManage && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsCreateFolderModalOpen(true)}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <FolderPlus size={18} />
                  新建文件夹
                </Button>
                <Button
                  onClick={() => setShowDirectoryImport(true)}
                  variant="outline"
                  size="sm"
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
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto">
        <div className="card-theme p-4">
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
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                  placeholder="搜索文件..."
                  className="w-48 pl-10 pr-10 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <SearchIcon
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                    title="清除搜索"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleSearchSubmit}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-600 transition-colors p-1"
                  title="搜索"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </button>
              </div>

              {/* 视图切换 */}
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="网格视图"
                >
                  <GridIcon size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'list'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="列表视图"
                >
                  <ListIcon size={18} />
                </button>
              </div>

              {/* 刷新按钮 */}
              <button
                onClick={refresh}
                disabled={loading}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
                title="刷新"
              >
                <RefreshIcon
                  size={18}
                  className={loading ? 'animate-spin' : ''}
                />
              </button>

              {/* 多选模式切换按钮 */}
              <button
                onClick={toggleMultiSelectMode}
                className="p-2 rounded-xl transition-all"
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
              </button>

              {/* 全选按钮 - 仅在多选模式下显示 */}
              {isMultiSelectMode && nodes.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="p-2 rounded-xl transition-all hover:bg-[var(--bg-tertiary)]"
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
                </button>
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
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700 text-sm font-medium"
              >
                关闭
              </button>
            </div>
          )}

          {/* 文件列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
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
                    onClick={() => setIsCreateFolderModalOpen(true)}
                    variant="outline"
                    size="sm"
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
                      setDownloadingNodeId(node.id);
                      setDownloadingFileName(node.name);
                      setShowDownloadFormatModal(true);
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

          {/* 分页 - 始终显示 */}
          <div className="mt-6 flex justify-center">
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
                setCurrentPage(1); // 切换每页数量时重置到第一页
              }}
              showSizeChanger={true}
            />
          </div>
        </div>

        {/* 批量操作栏 - 固定在底部 */}
        {isMultiSelectMode && selectedNodes.size > 0 && (
          <div
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-slide-up"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="text-sm font-semibold">
              已选中 {selectedNodes.size} 项
            </span>
            <div
              className="w-px h-4"
              style={{ background: 'var(--border-default)' }}
            />
            {canManage && (
              <>
                <button
                  onClick={() => {
                    setMoveSourceNode({
                      id: 'batch',
                      name: `${selectedNodes.size} 个项目`,
                    });
                    setCopySourceNode(null);
                    setShowSelectFolderModal(true);
                  }}
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--primary-500)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  移动
                </button>
                <button
                  onClick={() => {
                    setCopySourceNode({
                      id: 'batch',
                      name: `${selectedNodes.size} 个项目`,
                    });
                    setMoveSourceNode(null);
                    setShowSelectFolderModal(true);
                  }}
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--primary-500)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  复制
                </button>
                <button
                  onClick={() => {
                    const nodeIds = Array.from(selectedNodes);
                    const count = nodeIds.length;
                    setConfirmDialog({
                      isOpen: true,
                      title: '确认删除',
                      message: `确定要永久删除这 ${count} 个项目吗？删除后无法恢复。`,
                      onConfirm: async () => {
                        try {
                          for (const nodeId of nodeIds) {
                            const apiMethod =
                              libraryType === 'drawing'
                                ? libraryApi.deleteDrawingNode
                                : libraryApi.deleteBlockNode;
                            await apiMethod(nodeId, true);
                          }
                          showToast(`成功删除 ${count} 个项目`, 'success');
                          clearSelection();
                          await refresh();
                        } catch (error) {
                          console.error('批量删除失败:', error);
                          showToast('批量删除失败', 'error');
                        }
                      },
                    });
                  }}
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--error)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  批量删除
                </button>
              </>
            )}
            <button
              onClick={clearSelection}
              className="text-sm font-medium transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--primary-500)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              取消选择
            </button>
          </div>
        )}
      </div>

      {/* 弹窗 */}
      <Modal
        isOpen={isCreateFolderModalOpen}
        onClose={() => setIsCreateFolderModalOpen(false)}
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
              <input
                type="text"
                id="folderName"
                name="name"
                required
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入文件夹名称"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateFolderModalOpen(false)}
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

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
        }
      />

      {/* 重命名模态框 */}
      <RenameModal
        isOpen={isRenameModalOpen}
        editingNode={renamingNode as any}
        newName={renameName}
        loading={false}
        onClose={() => {
          setIsRenameModalOpen(false);
          setRenamingNode(null);
          setRenameName('');
        }}
        onNameChange={setRenameName}
        onRename={() => handleRenameSubmit(renameName)}
      />

      {/* 选择文件夹弹窗（移动/复制） */}
      <LibrarySelectFolderModal
        isOpen={showSelectFolderModal}
        libraryType={libraryType}
        currentNodeId={moveSourceNode?.id || copySourceNode?.id || ''}
        onConfirm={handleSelectFolderConfirm}
        onClose={() => {
          setShowSelectFolderModal(false);
          setMoveSourceNode(null);
          setCopySourceNode(null);
        }}
      />

      {/* 下载格式选择弹窗 */}
      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        fileName={downloadingFileName || ''}
        onClose={() => {
          setShowDownloadFormatModal(false);
          setDownloadingNodeId(null);
          setDownloadingFileName(null);
        }}
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
        onClose={() => setQuotaModalOpen(false)}
        title="配置公共资源库存储配额"
        size="md"
        footer={
          <div className="modal-footer">
            <Button
              variant="ghost"
              onClick={() => setQuotaModalOpen(false)}
              disabled={quotaLoading}
            >
              取消
            </Button>
            <Button
              onClick={saveLibraryQuota}
              disabled={quotaLoading}
              className="submit-btn"
            >
              {quotaLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save size={16} className="mr-1" />
                  保存
                </>
              )}
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
            <div className="quota-input-wrapper">
              <input
                type="number"
                value={libraryQuota}
                onChange={(e) => {
                  const gb = parseInt(e.target.value, 10);
                  if (!isNaN(gb) && gb >= 0) {
                    setLibraryQuota(gb);
                  }
                }}
                className="quota-input"
                min="0"
                step="1"
              />
              <span className="quota-unit">GB</span>
            </div>
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
