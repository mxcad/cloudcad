import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { FolderPlus, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ToastContainer } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import MxCadUploader, { MxCadUploaderRef } from '../components/MxCadUploader';
import { BreadcrumbNavigation } from '../components/BreadcrumbNavigation';
import { FileItem } from '../components/FileItem';
import { useFileSystem } from '../hooks/useFileSystem';
import { useProjectManagement } from '../hooks/useProjectManagement';
import { projectsApi } from '../services/apiService';
import {
  EmptyFolderIcon,
  RefreshIcon,
  SearchIcon,
  GridIcon,
  ListIcon,
} from '../components/FileIcons';
import { FileSystemNode } from '../types/filesystem';
import { CreateFolderModal } from '../components/modals/CreateFolderModal';
import { RenameModal } from '../components/modals/RenameModal';
import { ProjectModal } from '../components/modals/ProjectModal';
import { MembersModal } from '../components/modals/MembersModal';
import { SelectFolderModal } from '../components/modals/SelectFolderModal';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';

export const FileSystemManager: React.FC = () => {
  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{
    projectId: string;
    nodeId?: string;
  }>();
  const location = useLocation();

  // 从 URL 路径直接解析 projectId 和 nodeId（更可靠的方式）
  const urlProjectId = React.useMemo(() => {
    const match = location.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : '';
  }, [location.pathname]);

  const urlNodeId = React.useMemo(() => {
    const match = location.pathname.match(/\/projects\/[^/]+\/files\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  // 上传组件 ref
  const uploaderRef = useRef<MxCadUploaderRef>(null);

  // 面包屑滚动容器 ref
  const breadcrumbRef = useRef<HTMLDivElement>(null);

  // 文件系统核心 hooks
  const {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode,
    toasts,
    confirmDialog,
    showCreateFolderModal,
    showRenameModal,
    folderName,
    setFolderName,
    editingNode,
    setShowCreateFolderModal,
    setShowRenameModal,
    setEditingNode,
    removeToast,
    closeConfirm,
    handleRefresh,
    handleGoBack,
    handleNodeSelect,
    handleCreateFolder,
    handleRename,
    handleDelete,
    handleBatchDelete,
    handleFileOpen,
    handleDownload,
    handleOpenRename,
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,
  } = useFileSystem();

  // 项目管理 hooks
  const {
    isModalOpen: isProjectModalOpen,
    editingProject,
    formData: projectFormData,
    loading: projectLoading,
    openCreateModal: openCreateProject,
    openEditModal: openEditProject,
    closeModal: closeProjectModal,
    setFormData: setProjectFormData,
    handleCreate: handleCreateProjectSubmit,
    handleUpdate: handleUpdateProjectSubmit,
    handleDelete: handleDeleteProject,
  } = useProjectManagement({
    onProjectCreated: handleRefresh,
    onProjectUpdated: handleRefresh,
    onProjectDeleted: handleRefresh,
  });

  // 成员管理状态
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  // 移动/拷贝状态
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<FileSystemNode | null>(
    null
  );
  const [copySourceNode, setCopySourceNode] = useState<FileSystemNode | null>(
    null
  );

  // 是否在根级别（无 projectId）
  const isAtRoot = !urlProjectId;

  // 面包屑滚轮横向滚动处理
  useEffect(() => {
    const container = breadcrumbRef.current;
    if (!container) return;

    const SCROLL_SPEED = 0.5;
    const MAX_DELTA = 50;

    const handleWheel = (e: WheelEvent) => {
      if (!container.contains(e.target as Node)) return;
      if (e.deltaX !== 0) return;

      if (e.deltaY !== 0) {
        e.preventDefault();
        const delta =
          Math.sign(e.deltaY) *
          Math.min(Math.abs(e.deltaY) * SCROLL_SPEED, MAX_DELTA);
        container.scrollLeft += delta;
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  // 面包屑更新时滚动到最后
  useEffect(() => {
    if (breadcrumbRef.current && breadcrumbs.length > 0) {
      breadcrumbRef.current.scrollTo({
        left: breadcrumbRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }
  }, [breadcrumbs]);

  // 获取当前正确的父节点 ID（上传目标目录）
  // 使用 ref 缓存最新值，避免闭包问题
  const currentNodeIdRef = useRef<string | null>(null);
  const getCurrentParentId = useCallback(() => {
    // 优先使用 ref 中的最新值（实时更新）
    if (currentNodeIdRef.current) {
      console.log(
        '[getCurrentParentId] 模式0 - 使用 ref 最新值:',
        currentNodeIdRef.current
      );
      return currentNodeIdRef.current;
    }

    // 备用方案：使用 URL 参数
    // 优先使用 URL nodeId（最可靠，因为 URL 是页面状态的权威来源）
    if (urlNodeId) {
      console.log('[getCurrentParentId] 模式1 - 使用 URL nodeId:', urlNodeId);
      return urlNodeId;
    }

    // 如果 URL nodeId 存在但 nodes 已加载，验证节点是否存在
    if (urlNodeId && nodes.length > 0) {
      const currentNodeData = nodes.find((n) => n.id === urlNodeId);
      if (currentNodeData) {
        console.log(
          '[getCurrentParentId] 模式2 - 从 nodes 中找到:',
          currentNodeData.id
        );
        return currentNodeData.id;
      }
    }

    // 最后使用 projectId（项目根目录）
    if (urlProjectId) {
      console.log(
        '[getCurrentParentId] 模式3 - 使用 URL projectId:',
        urlProjectId
      );
      return urlProjectId;
    }

    console.log('[getCurrentParentId] 警告: 无法确定目标目录');
    return '';
  }, [urlNodeId, urlProjectId, nodes]);

  // 当 currentNode 变化时，更新 ref
  useEffect(() => {
    if (currentNode?.id) {
      currentNodeIdRef.current = currentNode.id;
    }
  }, [currentNode?.id]);

  // 过滤后的数据
  const filteredProjects = isAtRoot ? nodes.filter((n) => n.isRoot) : nodes;
  const filteredNodes = !isAtRoot
    ? nodes.filter((node) =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : filteredProjects;

  // 打开成员管理模态框
  const handleShowMembers = useCallback(
    (project: FileSystemNode, e: React.MouseEvent) => {
      e.stopPropagation();
      openEditProject(project);
      setIsMembersModalOpen(true);
    },
    [openEditProject]
  );

  // 提交项目表单
  const handleSubmitProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editingProject) {
        handleUpdateProjectSubmit((id, data) =>
          projectsApi.update(id, {
            name: data.name ?? undefined,
            description: data.description,
          })
        );
      } else {
        handleCreateProjectSubmit((name, description) =>
          projectsApi.create({ name, description })
        );
      }
    },
    [editingProject, handleCreateProjectSubmit, handleUpdateProjectSubmit]
  );

  // 删除项目
  const handleRemoveProject = useCallback(
    (project: FileSystemNode, e: React.MouseEvent) => {
      e.stopPropagation();
      handleDeleteProject(project, handleRefresh);
    },
    [handleDeleteProject, handleRefresh]
  );

  /**
   * 处理上传外部参照（任务009 - 快捷键支持）
   * 获取当前选中的 CAD 文件并触发上传
   */
  const handleUploadExternalReference = useCallback((node: FileSystemNode) => {
    console.log('[FileSystemManager] 上传外部参照:', node.name);

    // 检查是否为 CAD 文件
    const ext = node.extension?.toLowerCase();
    if (ext !== '.dwg' && ext !== '.dxf') {
      console.log('[FileSystemManager] 仅支持 DWG/DXF 文件的外部参照上传');
      return;
    }

    // TODO: 触发外部参照上传逻辑
    // 这里可以打开 ExternalReferenceModal 或触发 FileItem 中的上传逻辑
    console.log('[FileSystemManager] 准备上传外部参照:', node.name);
  }, []);

  /**
   * 处理移动节点
   */
  const handleMove = useCallback((node: FileSystemNode) => {
    console.log('[FileSystemManager] 移动节点:', node.name);
    setMoveSourceNode(node);
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  /**
   * 处理复制节点
   */
  const handleCopy = useCallback((node: FileSystemNode) => {
    console.log('[FileSystemManager] 复制节点:', node.name);
    setCopySourceNode(node);
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  /**
   * 确认移动/拷贝
   */
  const handleConfirmMoveOrCopy = useCallback(
    async (targetParentId: string) => {
      try {
        // 批量模式
        if (isMultiSelectMode && selectedNodes.size > 0) {
          const nodeIds = Array.from(selectedNodes);
          for (const nodeId of nodeIds) {
            // 判断是移动还是复制
            if (moveSourceNode) {
              await projectsApi.moveNode(nodeId, targetParentId);
            } else {
              await projectsApi.copyNode(nodeId, targetParentId);
            }
          }
          console.log(
            '[FileSystemManager] 批量操作成功:',
            nodeIds.length,
            '项'
          );
        }
        // 单个节点模式
        else if (moveSourceNode) {
          await projectsApi.moveNode(moveSourceNode.id, targetParentId);
          console.log('[FileSystemManager] 移动成功:', moveSourceNode.name);
        } else if (copySourceNode) {
          await projectsApi.copyNode(copySourceNode.id, targetParentId);
          console.log('[FileSystemManager] 复制成功:', copySourceNode.name);
        }
        handleRefresh();
        setShowSelectFolderModal(false);
        setMoveSourceNode(null);
        setCopySourceNode(null);
      } catch (error) {
        console.error('[FileSystemManager] 移动/复制失败:', error);
        alert('操作失败，请重试');
      }
    },
    [
      moveSourceNode,
      copySourceNode,
      isMultiSelectMode,
      selectedNodes,
      handleRefresh,
    ]
  );

  /**
   * 处理拖拽开始
   */
  const handleDragStart = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      if (node.isRoot) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'copyMove';
      setDraggedNodes([node]);
    },
    []
  );

  /**
   * 处理拖拽经过
   */
  const handleDragOver = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      e.preventDefault();
      if (node.isFolder && node.id !== draggedNodes[0]?.id) {
        e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
        setDropTargetId(node.id);
      }
    },
    [draggedNodes]
  );

  /**
   * 处理拖拽离开
   */
  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  /**
   * 处理拖拽放置
   */
  const handleDrop = useCallback(
    async (e: React.DragEvent, targetNode: FileSystemNode) => {
      e.preventDefault();
      setDropTargetId(null);

      if (!targetNode.isFolder) return;
      if (draggedNodes.length === 0) return;

      // 检查是否拖拽到自身或其子节点
      const draggedNodeId = draggedNodes[0].id;
      if (draggedNodeId === targetNode.id) return;

      // 判断是移动还是复制（Ctrl 键按住 = 拷贝，否则 = 移动）
      const isCopy = e.ctrlKey || e.metaKey;

      try {
        if (isCopy) {
          await projectsApi.copyNode(draggedNodeId, targetNode.id);
          console.log(
            '[FileSystemManager] 拖拽复制成功:',
            draggedNodeId,
            '->',
            targetNode.id
          );
        } else {
          await projectsApi.moveNode(draggedNodeId, targetNode.id);
          console.log(
            '[FileSystemManager] 拖拽移动成功:',
            draggedNodeId,
            '->',
            targetNode.id
          );
        }
        handleRefresh();
      } catch (error) {
        console.error('[FileSystemManager] 拖拽操作失败:', error);
        alert('操作失败，请重试');
      } finally {
        setDraggedNodes([]);
      }
    },
    [draggedNodes, handleRefresh]
  );

  // ========== 渲染函数 ==========

  const renderHeader = () => (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <button
            onClick={isAtRoot ? () => navigate('/projects') : handleGoBack}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all flex-shrink-0"
            title={isAtRoot ? '返回项目列表' : '返回上一级'}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M5 12L12 19M5 12L12 5" />
            </svg>
          </button>

          <div
            ref={breadcrumbRef}
            className="min-w-0 flex-1 overflow-x-auto no-scrollbar"
          >
            <BreadcrumbNavigation
              breadcrumbs={breadcrumbs}
              onNavigate={(crumb) => {
                if (crumb.isRoot) {
                  navigate(`/projects/${crumb.id}/files`);
                } else {
                  navigate(`/projects/${projectId}/files/${crumb.id}`);
                }
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="text-slate-600 hover:bg-slate-100"
            title="刷新"
          >
            <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
          </Button>

          {isAtRoot ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={openCreateProject}
              className="text-slate-600 hover:bg-slate-100"
              title="新建项目"
            >
              <FolderPlus size={16} />
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateFolderModal(true)}
                disabled={loading}
                className="text-slate-600 hover:bg-slate-100"
                title="新建文件夹"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  <path d="M12 11v6M9 14h6" />
                </svg>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!projectId) {
                    alert('请先选择一个项目再上传文件');
                    return;
                  }
                  uploaderRef.current?.triggerUpload();
                }}
                disabled={loading}
                className="text-slate-600 hover:bg-slate-100"
                title="上传文件"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M17 8L12 3L7 8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 3V15"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Button>
            </>
          )}

          {/* 上传组件 - 仅在项目/文件夹模式下显示 */}
          {!isAtRoot && (
            <MxCadUploader
              ref={uploaderRef}
              nodeId={() => getCurrentParentId()}
              buttonText=""
              buttonClassName="hidden"
              onSuccess={handleRefresh}
              onError={(err: string) => console.error('Upload error:', err)}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="relative group flex-1 max-w-xs">
          <SearchIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary-500 transition-colors"
          />
          <input
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={isMultiSelectMode ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              if (isMultiSelectMode) {
                selectedNodes.clear();
              }
            }}
            className={
              isMultiSelectMode ? '' : 'text-slate-600 hover:bg-slate-100'
            }
            title="多选模式"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
            </svg>
          </Button>

          <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary-50 text-primary-600' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <GridIcon size={14} />
            </button>
            <div className="w-px h-4 bg-slate-200" />
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary-50 text-primary-600' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <ListIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderEmpty = (isProjectsEmpty: boolean) => (
    <div className="flex flex-col items-center justify-center py-16">
      <EmptyFolderIcon
        size={80}
        className="text-slate-300 mb-6 animate-float"
      />
      <h3 className="text-xl font-bold text-slate-900 mb-2">
        {isProjectsEmpty ? '暂无项目' : '这个文件夹是空的'}
      </h3>
      <p className="text-slate-500 text-sm mb-6">
        {searchQuery
          ? '没有找到匹配的内容'
          : isProjectsEmpty
            ? '开始创建您的第一个项目'
            : '上传文件或创建文件夹来开始使用'}
      </p>
      {isProjectsEmpty && (
        <Button
          onClick={openCreateProject}
          variant="outline"
          size="sm"
          className="hover:shadow-md transition-all"
        >
          <FolderPlus size={14} className="mr-2" />
          创建项目
        </Button>
      )}
    </div>
  );

  const renderContent = () => {
    if (filteredNodes.length === 0) {
      return renderEmpty(isAtRoot);
    }

    return (
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-6'
            : 'divide-y divide-slate-100'
        }
      >
        {filteredNodes.map((node) => (
          <FileItem
            key={node.id}
            node={node}
            isSelected={selectedNodes.has(node.id)}
            viewMode={viewMode}
            isMultiSelectMode={isMultiSelectMode}
            onSelect={handleNodeSelect}
            onEnter={handleFileOpen}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onRename={handleOpenRename}
            onEdit={node.isRoot ? (e) => openEditProject(node, e) : undefined}
            onDeleteNode={
              node.isRoot ? (e) => handleRemoveProject(node, e) : undefined
            }
            onShowMembers={
              node.isRoot ? (e) => handleShowMembers(node, e) : undefined
            }
            onMove={!node.isRoot ? handleMove : undefined}
            onCopy={!node.isRoot ? handleCopy : undefined}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isDropTarget={dropTargetId === node.id}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 relative">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
        type={confirmDialog.type}
      />

      {renderHeader()}

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 relative min-h-[400px] shadow-sm overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-slate-200" />
              <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-primary-600 border-t-transparent animate-spin" />
            </div>
            <p className="mt-4 text-slate-500 font-medium">加载中...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-error-100 flex items-center justify-center mb-4">
              <AlertCircle size={32} className="text-error-600" />
            </div>
            <p className="text-error-600 font-medium mb-4">{error}</p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshIcon size={16} className="mr-2" />
              重试
            </Button>
          </div>
        )}

        {!loading && !error && renderContent()}

        {isMultiSelectMode && selectedNodes.size > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900/95 backdrop-blur-xl text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-slide-up">
            <span className="text-sm font-semibold">
              已选中 {selectedNodes.size} 项
            </span>
            <div className="w-px h-4 bg-slate-700" />
            <button
              onClick={() => {
                setMoveSourceNode({ id: 'batch' } as any);
                setCopySourceNode(null);
                setShowSelectFolderModal(true);
              }}
              className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              移动
            </button>
            <button
              onClick={() => {
                setMoveSourceNode(null);
                setCopySourceNode({ id: 'batch' } as any);
                setShowSelectFolderModal(true);
              }}
              className="text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              复制
            </button>
            <button
              onClick={handleBatchDelete}
              className="text-error-400 hover:text-white text-sm font-medium transition-colors"
            >
              删除
            </button>
            <button
              onClick={() => {
                selectedNodes.clear();
                setIsMultiSelectMode(false);
              }}
              className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* 模态框组件 */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        folderName={folderName}
        loading={loading}
        onClose={() => setShowCreateFolderModal(false)}
        onFolderNameChange={setFolderName}
        onCreate={handleCreateFolder}
      />

      <RenameModal
        isOpen={showRenameModal}
        editingNode={editingNode}
        newName={folderName}
        loading={loading}
        onClose={() => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        }}
        onNameChange={setFolderName}
        onRename={handleRename}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        editingProject={editingProject}
        formData={projectFormData}
        loading={projectLoading}
        onClose={closeProjectModal}
        onFormDataChange={setProjectFormData}
        onSubmit={handleSubmitProject}
      />

      <MembersModal
        isOpen={isMembersModalOpen}
        projectId={editingProject?.id || ''}
        onClose={() => setIsMembersModalOpen(false)}
      />

      <SelectFolderModal
        isOpen={showSelectFolderModal}
        currentNodeId={
          moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch'
            ? ''
            : moveSourceNode?.id || copySourceNode?.id || ''
        }
        projectId={urlProjectId}
        onClose={() => {
          setShowSelectFolderModal(false);
          setMoveSourceNode(null);
          setCopySourceNode(null);
        }}
        onConfirm={handleConfirmMoveOrCopy}
      />

      {/* 键盘快捷键组件（任务009 - 可选功能） */}
      <KeyboardShortcuts
        selectedNode={
          selectedNodes.size === 1
            ? nodes.find((n) => n.id === Array.from(selectedNodes)[0])
            : null
        }
        onUploadExternalReference={handleUploadExternalReference}
      />
    </div>
  );
};

export default FileSystemManager;
