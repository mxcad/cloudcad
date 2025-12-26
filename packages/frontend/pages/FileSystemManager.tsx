import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FolderPlus,
  Edit,
  Trash2,
  Users,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  X,
  UserPlus,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ToastContainer } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import MxCadUploader, { MxCadUploaderRef } from '../components/MxCadUploader';
import { BreadcrumbNavigation } from '../components/BreadcrumbNavigation';
import { FileItem } from '../components/FileItem';
import { useFileSystem } from '../hooks/useFileSystem';
import {
  EmptyFolderIcon,
  RefreshIcon,
  SearchIcon,
  GridIcon,
  ListIcon,
  EditIcon,
  DeleteIcon,
  UsersIcon,
} from '../components/FileIcons';
import { FileSystemNode } from '../types/filesystem';
import { projectsApi } from '../services/apiService';

export const FileSystemManager: React.FC = () => {
  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{ projectId: string; nodeId?: string }>();

  // 上传组件 ref
  const uploaderRef = useRef<MxCadUploaderRef>(null);
  
  // 面包屑滚动容器 ref
  const breadcrumbRef = useRef<HTMLDivElement>(null);

  // 面包屑滚轮横向滚动处理
  useEffect(() => {
    const container = breadcrumbRef.current;
    if (!container) return;

    // 滚动配置
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
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    getFilteredProjects,
    handleEnterProject,
  } = useFileSystem();

  // 是否在根级别（无 projectId）
  const isAtRoot = !projectId;

  // 面包屑更新时滚动到最后
  useEffect(() => {
    if (breadcrumbRef.current && breadcrumbs.length > 0) {
      breadcrumbRef.current.scrollTo({ left: breadcrumbRef.current.scrollWidth, behavior: 'smooth' });
    }
  }, [breadcrumbs]);

  // 调试：打印当前上传路径信息
  useEffect(() => {
    console.log('[UploadDebug] currentNode:', currentNode?.id, 'projectId:', projectId, 'nodeId:', nodeId);
  }, [currentNode, projectId, nodeId]);

  // 获取当前正确的父节点 ID
  const getCurrentParentId = useCallback(() => {
    // 如果有当前节点（子文件夹模式），使用当前节点 ID
    // 否则使用 projectId（项目根目录模式）
    return currentNode?.id || nodeId || projectId || '';
  }, [currentNode, nodeId, projectId]);

  // 项目管理相关状态
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<FileSystemNode | null>(null);
  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
  });

  // 成员管理相关状态
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [currentProjectMembers, setCurrentProjectMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('MEMBER');

  // 过滤后的数据
  const filteredProjects = isAtRoot ? getFilteredProjects() : nodes;
  const filteredNodes = !isAtRoot ? nodes.filter((node) =>
    node.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) : filteredProjects;

  // 打开创建项目模态框
  const handleOpenCreateProject = useCallback(() => {
    setEditingProject(null);
    setProjectFormData({ name: '', description: '' });
    setIsProjectModalOpen(true);
  }, []);

  // 打开编辑项目模态框
  const handleOpenEditProject = useCallback((project: FileSystemNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setProjectFormData({
      name: project.name,
      description: project.description || '',
    });
    setIsProjectModalOpen(true);
  }, []);

  // 显示项目成员
  const handleShowProjectMembers = useCallback(async (project: FileSystemNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingMembers(true);
    setIsMembersModalOpen(true);
    setNewMemberEmail('');
    setNewMemberRole('MEMBER');
    setShowAddMemberForm(false);

    try {
      const response = await projectsApi.getMembers(project.id);
      setCurrentProjectMembers(response.data || []);
    } catch (err: any) {
      console.error('Failed to load members:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  // 添加项目成员
  const handleAddMember = useCallback(async (projectId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) {
      return;
    }

    try {
      await projectsApi.addMember(projectId, {
        userId: newMemberEmail.trim(),
        role: newMemberRole,
      });
      // 重新加载成员列表
      const response = await projectsApi.getMembers(projectId);
      setCurrentProjectMembers(response.data || []);
      setNewMemberEmail('');
      setNewMemberRole('MEMBER');
      setShowAddMemberForm(false);
    } catch (err: any) {
      console.error('Failed to add member:', err);
    }
  }, [newMemberEmail, newMemberRole]);

  // 移除项目成员
  const handleRemoveMember = useCallback(async (projectId: string, userId: string) => {
    try {
      await projectsApi.removeMember(projectId, userId);
      setCurrentProjectMembers(prev => prev.filter(m => m.id !== userId && m.userId !== userId));
    } catch (err: any) {
      console.error('Failed to remove member:', err);
    }
  }, []);

  // 更新成员角色
  const handleUpdateMemberRole = useCallback(async (projectId: string, userId: string, role: string) => {
    try {
      await projectsApi.updateMember(projectId, userId, { role });
      setCurrentProjectMembers(prev =>
        prev.map(m => (m.id === userId || m.userId === userId) ? { ...m, role } : m)
      );
    } catch (err: any) {
      console.error('Failed to update member role:', err);
    }
  }, []);

  // 提交项目表单
  const handleSubmitProject = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectFormData.name.trim()) {
      return;
    }

    try {
      if (editingProject) {
        await handleUpdateProject(editingProject.id, {
          name: projectFormData.name.trim(),
          description: projectFormData.description.trim() || undefined,
        });
      } else {
        await handleCreateProject(
          projectFormData.name.trim(),
          projectFormData.description.trim()
        );
      }
      setIsProjectModalOpen(false);
    } catch {
      // 错误已由 hook 处理
    }
  }, [projectFormData, editingProject, handleCreateProject, handleUpdateProject]);

  // 删除项目
  const handleRemoveProject = useCallback(async (project: FileSystemNode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`确定要删除项目"${project.name}"吗？此操作不可恢复。`)) {
      await handleDeleteProject(project.id, project.name);
    }
  }, [handleDeleteProject]);

  // 获取状态显示文本
  const getStatusText = (status?: string) => {
    switch (status) {
      case 'ACTIVE': return '活跃';
      case 'ARCHIVED': return '已归档';
      case 'DELETED': return '已删除';
      default: return '未知';
    }
  };

  // 获取状态样式
  const getStatusStyle = (status?: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-700 border-green-200';
      case 'ARCHIVED': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'DELETED': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // 统一的页面标题区域
  const renderHeader = () => (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          {/* 返回按钮 - 始终显示 */}
          <button
            onClick={isAtRoot ? () => navigate('/projects') : handleGoBack}
            className="p-1.5 rounded text-slate-500 hover:text-slate-700
                     hover:bg-slate-100 transition-all flex-shrink-0"
            title={isAtRoot ? '返回项目列表' : '返回上一级'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M5 12L12 19M5 12L12 5" />
            </svg>
          </button>

          {/* 面包屑导航 - 鼠标移入时滚轮控制横向滚动 */}
          <div
            ref={breadcrumbRef}
            className="min-w-0 flex-1 overflow-x-auto no-scrollbar"
          >
            <BreadcrumbNavigation
              breadcrumbs={breadcrumbs}
              onNavigate={(crumb, element) => {
                // 点击面包屑项时滚动到对应位置
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                }

                if (crumb.isRoot) {
                  navigate(`/projects/${crumb.id}/files`);
                } else {
                  navigate(`/projects/${projectId}/files/${crumb.id}`);
                }
              }}
            />
          </div>
        </div>

        {/* 操作按钮组 */}
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

          {/* 仅在项目内显示新建文件夹和上传按钮 */}
          {!isAtRoot && (
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
                onClick={() => uploaderRef.current?.triggerUpload()}
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

          {/* 仅在项目列表页面显示新建项目按钮 */}
          {isAtRoot && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenCreateProject}
              className="text-slate-600"
              title="新建项目"
            >
              <FolderPlus size={16} />
            </Button>
          )}

          <MxCadUploader
            ref={uploaderRef}
            projectId={projectId || ''}
            parentId={getCurrentParentId()}
            buttonText=""
            buttonClassName="hidden"
            onSuccess={() => {
              console.log('Upload success, refreshing...');
              handleRefresh();
            }}
            onError={(err: string) => console.error('Upload error:', err)}
          />
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="relative group flex-1 max-w-xs">
          <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg
                       placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

        {/* 根级别显示状态筛选 */}
        {isAtRoot && (
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
        )}

        {/* 视图切换（非根级别时显示） */}
        {!isAtRoot && (
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
        )}
      </div>
    </div>
  );

  // 统一的空状态
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
        <Button onClick={handleOpenCreateProject} variant="outline" size="sm">
          <FolderPlus size={14} className="mr-2" />
          创建项目
        </Button>
      )}
    </div>
  );

  // 渲染内容列表
  const renderContent = () => {
    const displayNodes = filteredProjects;

    if (displayNodes.length === 0) {
      return renderEmpty(isAtRoot);
    }

    return (
      <div className={viewMode === 'grid'
        ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-6'
        : 'divide-y divide-slate-100'
      }>
        {displayNodes.map((node) => (
          <FileItem
            key={node.id}
            node={node}
            isSelected={selectedNodes.has(node.id)}
            viewMode={viewMode}
            onSelect={handleNodeSelect}
            onEnter={handleFileOpen}
            onDownload={handleDownload}
            onDelete={handleDelete}
            onRename={handleOpenRename}
            // 项目特有操作
            onEdit={node.isRoot ? (e) => handleOpenEditProject(node, e) : undefined}
            onDeleteNode={node.isRoot ? (e) => handleRemoveProject(node, e) : undefined}
            onShowMembers={node.isRoot ? (e) => handleShowProjectMembers(node, e) : undefined}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 relative">
      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
        type={confirmDialog.type}
      />

      {/* 页面标题区域 */}
      {renderHeader()}

      {/* 内容区域 */}
      <div className="bg-white rounded-2xl border border-slate-200 relative min-h-[400px] shadow-sm overflow-hidden">
        {/* 加载状态 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-slate-200" />
              <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
            </div>
            <p className="mt-4 text-slate-500 font-medium">加载中...</p>
          </div>
        )}

        {/* 错误状态 */}
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

        {/* 内容 */}
        {!loading && !error && renderContent()}

        {/* 选中数量提示 */}
        {selectedNodes.size > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2
                        bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg
                        flex items-center gap-3">
            <span className="text-sm font-medium">已选中 {selectedNodes.size} 项</span>
            <div className="w-px h-4 bg-slate-700" />
            <button onClick={handleBatchDelete} className="text-red-400 hover:text-white text-sm">删除</button>
            <button onClick={() => selectedNodes.clear()} className="text-slate-400 hover:text-white text-sm">取消</button>
          </div>
        )}
      </div>

      {/* 创建文件夹模态框 */}
      <Modal
        isOpen={showCreateFolderModal}
        onClose={() => { setShowCreateFolderModal(false); setFolderName(''); }}
        title="新建文件夹"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowCreateFolderModal(false); setFolderName(''); }}>
              取消
            </Button>
            <Button onClick={handleCreateFolder}>创建</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">名称 *</label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg"
              placeholder="请输入文件夹名称"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* 重命名模态框 */}
      <Modal
        isOpen={showRenameModal}
        onClose={() => { setShowRenameModal(false); setEditingNode(null); setFolderName(''); }}
        title={`重命名${editingNode?.isFolder ? '文件夹' : '文件'}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowRenameModal(false); setEditingNode(null); setFolderName(''); }}>
              取消
            </Button>
            <Button onClick={handleRename}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">新名称 *</label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleRename()}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg"
              placeholder="请输入新名称"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* 创建/编辑项目模态框 */}
      <Modal
        isOpen={isProjectModalOpen}
        onClose={() => { setIsProjectModalOpen(false); setEditingProject(null); setProjectFormData({ name: '', description: '' }); }}
        title={editingProject ? '编辑项目' : '创建新项目'}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setIsProjectModalOpen(false); setEditingProject(null); setProjectFormData({ name: '', description: '' }); }}>
              取消
            </Button>
            <Button onClick={handleSubmitProject} disabled={loading || !projectFormData.name.trim()}>
              {loading ? '处理中...' : editingProject ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitProject} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">名称 *</label>
            <input
              type="text"
              required
              value={projectFormData.name}
              onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="请输入名称"
              autoFocus
              maxLength={100}
            />
            <p className="text-xs text-slate-500 mt-1">{projectFormData.name.length}/100</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <textarea
              value={projectFormData.description}
              onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="请输入描述（可选）"
              maxLength={500}
            />
            <p className="text-xs text-slate-500 mt-1">{projectFormData.description.length}/500</p>
          </div>
        </form>
      </Modal>

      {/* 项目成员管理模态框 */}
      <Modal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        title="项目成员"
        footer={
          <Button variant="ghost" onClick={() => setIsMembersModalOpen(false)}>
            关闭
          </Button>
        }
      >
        <div className="space-y-4">
          {/* 添加成员按钮 */}
          {!showAddMemberForm ? (
            <button
              onClick={() => setShowAddMemberForm(true)}
              className="w-full py-2 px-4 border-2 border-dashed border-slate-300 rounded-lg
                         text-slate-500 hover:border-indigo-400 hover:text-indigo-600
                         flex items-center justify-center gap-2 transition-colors"
            >
              <UserPlus size={18} />
              添加成员
            </button>
          ) : (
            <form onSubmit={(e) => editingProject && handleAddMember(editingProject.id, e)} 
                  className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus size={18} className="text-slate-500" />
                <span className="text-sm font-medium text-slate-700">添加新成员</span>
                <button
                  type="button"
                  onClick={() => { setShowAddMemberForm(false); setNewMemberEmail(''); }}
                  className="ml-auto p-1 hover:bg-slate-200 rounded"
                >
                  <X size={16} className="text-slate-500" />
                </button>
              </div>
              <div className="space-y-3">
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="输入用户邮箱"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <div className="flex gap-2">
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="OWNER">所有者</option>
                    <option value="ADMIN">管理员</option>
                    <option value="MEMBER">成员</option>
                    <option value="VIEWER">查看者</option>
                  </select>
                  <Button type="submit" size="sm" disabled={!newMemberEmail.trim()}>
                    添加
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* 成员列表 */}
          <div className="space-y-2">
            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <RefreshIcon size={20} className="animate-spin text-slate-400" />
                <span className="ml-2 text-slate-500">加载中...</span>
              </div>
            ) : currentProjectMembers.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                暂无成员
              </div>
            ) : (
              currentProjectMembers.map((member: any) => (
                <div
                  key={member.id || member.userId}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  {/* 用户头像 */}
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
                    {(member.nickname || member.username || member.email || '?')[0].toUpperCase()}
                  </div>
                  
                  {/* 用户信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {member.nickname || member.username || member.email}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{member.email}</p>
                  </div>

                  {/* 角色选择 */}
                  <select
                    value={member.role}
                    onChange={(e) => editingProject && handleUpdateMemberRole(editingProject.id, member.id || member.userId, e.target.value)}
                    className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                  >
                    <option value="OWNER">所有者</option>
                    <option value="ADMIN">管理员</option>
                    <option value="MEMBER">成员</option>
                    <option value="VIEWER">查看者</option>
                  </select>

                  {/* 移除按钮 */}
                  <button
                    onClick={() => editingProject && handleRemoveMember(editingProject.id, member.id || member.userId)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                    title="移除成员"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FileSystemManager;