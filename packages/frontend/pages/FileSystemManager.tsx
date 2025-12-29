import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  FolderPlus,
  Users,
  Search,
  Filter,
  AlertCircle,
} from 'lucide-react';
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

export const FileSystemManager: React.FC = () => {
  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{ projectId: string; nodeId?: string }>();
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
    statusFilter,
    setStatusFilter,
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
        const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) * SCROLL_SPEED, MAX_DELTA);
        container.scrollLeft += delta;
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  // 面包屑更新时滚动到最后
  useEffect(() => {
    if (breadcrumbRef.current && breadcrumbs.length > 0) {
      breadcrumbRef.current.scrollTo({ left: breadcrumbRef.current.scrollWidth, behavior: 'smooth' });
    }
  }, [breadcrumbs]);

  // 获取当前正确的父节点 ID（上传目标目录）
  // 使用 ref 缓存最新值，避免闭包问题
  const currentNodeIdRef = useRef<string | null>(null);
  const getCurrentParentId = useCallback(() => {
    // 优先使用 ref 中的最新值（实时更新）
    if (currentNodeIdRef.current) {
      console.log('[getCurrentParentId] 模式0 - 使用 ref 最新值:', currentNodeIdRef.current);
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
        console.log('[getCurrentParentId] 模式2 - 从 nodes 中找到:', currentNodeData.id);
        return currentNodeData.id;
      }
    }
    
    // 最后使用 projectId（项目根目录）
    if (urlProjectId) {
      console.log('[getCurrentParentId] 模式3 - 使用 URL projectId:', urlProjectId);
      return urlProjectId;
    }
    
    console.log('[getCurrentParentId] 警告: 无法确定目标目录');
    return '';
  }, [urlNodeId, urlProjectId, nodes]);

  // 当 currentNode 变化时，更新 ref
  useEffect(() => {
    if (currentNode?.id) {
      currentNodeIdRef.current = currentNode.id;
      console.log('[getCurrentParentId] 更新 ref 为 currentNode.id:', currentNode.id);
    }
  }, [currentNode?.id]);

  // 过滤后的数据
  const filteredProjects = isAtRoot ? nodes.filter((n) => n.isRoot) : nodes;
  const filteredNodes = !isAtRoot
    ? nodes.filter((node) => node.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredProjects;

  // 打开成员管理模态框
  const handleShowMembers = useCallback((project: FileSystemNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMembersModalOpen(true);
  }, []);

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

  // ========== 渲染函数 ==========

  const renderHeader = () => (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <button
            onClick={isAtRoot ? () => navigate('/projects') : handleGoBack}
            className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all flex-shrink-0"
            title={isAtRoot ? '返回项目列表' : '返回上一级'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M5 12L12 19M5 12L12 5" />
            </svg>
          </button>

          <div ref={breadcrumbRef} className="min-w-0 flex-1 overflow-x-auto no-scrollbar">
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
            className="text-slate-600"
            title="刷新"
          >
            <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
          </Button>

          {isAtRoot ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={openCreateProject}
              className="text-slate-600"
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
                className="text-slate-600"
                title="新建文件夹"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                className="text-slate-600"
                title="上传文件"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M17 8L12 3L7 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 3V15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
          <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="ALL">全部</option>
              <option value="ACTIVE">活跃</option>
              <option value="ARCHIVED">已归档</option>
            </select>
          </div>

          <Button
            variant={isMultiSelectMode ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              if (isMultiSelectMode) {
                selectedNodes.clear();
              }
            }}
            className={isMultiSelectMode ? '' : 'text-slate-600'}
            title="多选模式"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>
            </svg>
          </Button>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 ${viewMode === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}
            >
              <GridIcon size={14} />
            </button>
            <div className="w-px h-4 bg-slate-200" />
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}
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
      <EmptyFolderIcon size={64} className="text-slate-300 mb-4" />
      <h3 className="text-base font-semibold text-slate-900 mb-2">
        {isProjectsEmpty ? '暂无项目' : '这个文件夹是空的'}
      </h3>
      <p className="text-slate-500 text-sm mb-4">
        {searchQuery || statusFilter !== 'ALL'
          ? '没有找到匹配的内容'
          : isProjectsEmpty
            ? '开始创建您的第一个项目'
            : '上传文件或创建文件夹来开始使用'}
      </p>
      {isProjectsEmpty && (
        <Button onClick={openCreateProject} variant="outline" size="sm">
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
      <div className={viewMode === 'grid'
        ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-6'
        : 'divide-y divide-slate-100'
      }>
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
            onDeleteNode={node.isRoot ? (e) => handleRemoveProject(node, e) : undefined}
            onShowMembers={node.isRoot ? (e) => handleShowMembers(node, e) : undefined}
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

      <div className="bg-white rounded-2xl border border-slate-200 relative min-h-[400px] shadow-sm overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-slate-200" />
              <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
            </div>
            <p className="mt-4 text-slate-500 font-medium">加载中...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle size={32} className="text-red-600" />
            </div>
            <p className="text-red-600 font-medium mb-4">{error}</p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshIcon size={16} className="mr-2" />
              重试
            </Button>
          </div>
        )}

        {!loading && !error && renderContent()}

        {isMultiSelectMode && selectedNodes.size > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-3">
            <span className="text-sm font-medium">已选中 {selectedNodes.size} 项</span>
            <div className="w-px h-4 bg-slate-700" />
            <button onClick={handleBatchDelete} className="text-red-400 hover:text-white text-sm">
              删除
            </button>
            <button
              onClick={() => {
                selectedNodes.clear();
                setIsMultiSelectMode(false);
              }}
              className="text-slate-400 hover:text-white text-sm"
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
    </div>
  );
};

export default FileSystemManager;
