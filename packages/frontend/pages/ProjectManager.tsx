import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  FolderPlus,
  Edit,
  Trash2,
  Users,
  Calendar,
  Search,
  Filter,
  FolderOpen,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Toast } from '../components/ui/Toast';
import { projectsApi } from '../services/apiService';

// 类型定义（基于后端 FileSystemNode 模型）
type ProjectDto = {
  id: string;
  name: string;
  description?: string | null;
  isRoot: boolean;
  isFolder: boolean;
  projectStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED' | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  members?: ProjectMember[];
  _count?: {
    children: number;
    members: number;
  };
};

type CreateProjectDto = {
  name: string;
  description?: string;
};

type UpdateProjectDto = {
  name?: string;
  description?: string;
  status?: string;
};

type ProjectMember = {
  id: string;
  userId: string;
  projectId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  joinedAt: string;
  user: {
    id: string;
    username: string;
    nickname?: string | null;
    email: string;
  };
};

export const ProjectManager = () => {
  const navigate = useNavigate();

  // 状态管理
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'ARCHIVED'
  >('ALL');

  // Modal 状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDto | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectDto | null>(
    null
  );
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);

  // Toast 状态
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'ACTIVE' as const,
  });

  // Toast 操作
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    
    // 自动移除 Toast
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await projectsApi.list();
      setProjects(response.data || []);
      showToast('项目列表加载成功', 'success');
    } catch (error: any) {
      console.error('Failed to load projects:', error);
      const errorMessage = error.response?.data?.message || error.message || '加载项目列表失败';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 过滤项目
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.description &&
        project.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus =
      statusFilter === 'ALL' || project.projectStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // 打开创建项目模态框
  const handleOpenCreate = useCallback(() => {
    setEditingProject(null);
    setFormData({
      name: '',
      description: '',
      status: 'ACTIVE',
    });
    setIsModalOpen(true);
  }, []);

  // 打开编辑项目模态框
  const handleOpenEdit = useCallback((project: ProjectDto) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
    });
    setIsModalOpen(true);
  }, []);

  // 进入项目查看文件
  const handleEnterProject = useCallback((projectId: string) => {
    navigate(`/projects/${projectId}/files`);
  }, [navigate]);

  // 显示项目成员（使用项目数据中已包含的 members）
  const showProjectMembers = useCallback((project: ProjectDto) => {
    setSelectedProject(project);
    setProjectMembers(project.members || []);
    setIsMembersModalOpen(true);
  }, []);

  // 提交表单
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      showToast('项目名称不能为空', 'error');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (editingProject) {
        const updateData: UpdateProjectDto = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
        };
        await projectsApi.update(editingProject.id, updateData);
        showToast('项目更新成功', 'success');
      } else {
        const createData: CreateProjectDto = {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
        };
        await projectsApi.create(createData);
        showToast('项目创建成功', 'success');
      }

      setIsModalOpen(false);
      setFormData({ name: '', description: '', status: 'ACTIVE' });
      await loadProjects();
    } catch (error: any) {
      console.error('Failed to save project:', error);
      const errorMessage = error.response?.data?.message || error.message || '操作失败';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [formData, editingProject, loadProjects, showToast]);

  // 删除项目
  const handleDelete = useCallback(async (id: string, name: string) => {
    if (window.confirm(`确定要删除项目"${name}"吗？此操作不可恢复。`)) {
      setLoading(true);
      setError(null);
      try {
        await projectsApi.delete(id);
        showToast('项目删除成功', 'success');
        await loadProjects();
      } catch (error: any) {
        console.error('Failed to delete project:', error);
        const errorMessage = error.response?.data?.message || error.message || '删除项目失败';
        setError(errorMessage);
        showToast(errorMessage, 'error');
      } finally {
        setLoading(false);
      }
    }
  }, [loadProjects, showToast]);

  // 刷新项目列表
  const handleRefresh = useCallback(() => {
    loadProjects();
  }, [loadProjects]);

  // 获取状态显示文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return '活跃';
      case 'ARCHIVED':
        return '已归档';
      case 'DELETED':
        return '已删除';
      default:
        return '未知';
    }
  };

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'ARCHIVED':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'DELETED':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
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

  if (loading && projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-4">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">加载失败</h2>
        <p>{error}</p>
        <Button onClick={loadProjects} className="mt-4">
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Toast 通知 */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>

      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">项目管理</h1>
          <p className="text-slate-500 mt-1">
            创建和管理您的项目，组织文件和协作
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate('/cad-editor')}
          >
            <Pencil size={16} className="mr-2" />
            测试 CAD 编辑器
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
            title="刷新项目列表"
          >
            <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button onClick={handleOpenCreate} disabled={loading}>
            <FolderPlus size={16} className="mr-2" />
            新建项目
          </Button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="搜索项目..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
          >
            <option value="ALL">全部状态</option>
            <option value="ACTIVE">活跃</option>
            <option value="ARCHIVED">已归档</option>
          </select>
        </div>
      </div>

      {/* 项目列表 */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <FolderPlus size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">暂无项目</h3>
          <p className="text-slate-500 mb-4">
            {searchTerm || statusFilter !== 'ALL'
              ? '没有找到匹配的项目'
              : '开始创建您的第一个项目'}
          </p>
          <Button onClick={handleOpenCreate} variant="outline" disabled={loading}>
            <FolderPlus size={16} className="mr-2" />
            创建项目
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-xl border border-slate-200 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => handleEnterProject(project.id)}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
                      <FolderOpen size={20} className="text-indigo-600 flex-shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </h3>
                    <p className="text-sm text-slate-500 line-clamp-2">
                      {project.description || '暂无描述'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyle(project.projectStatus || 'ACTIVE')}`}
                  >
                    {getStatusText(project.projectStatus || 'ACTIVE')}
                  </span>
                  {project._count && (
                    <span className="text-xs text-slate-500">
                      {project._count.children} 个文件 · {project._count.members} 个成员
                    </span>
                  )}
                </div>

                <div className="flex items-center text-sm text-slate-500 mb-4">
                  <Calendar size={14} className="mr-1 flex-shrink-0" />
                  创建于 {formatDate(project.createdAt)}
                </div>

                <div
                  className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      showProjectMembers(project);
                    }}
                    className="text-slate-600 hover:text-indigo-600"
                    disabled={!project.members || project.members.length === 0}
                  >
                    <Users size={14} className="mr-1" />
                    成员 {project.members ? `(${project.members.length})` : ''}
                  </Button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(project);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="编辑项目"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(project.id, project.name);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除项目"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建/编辑项目模态框 */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          if (!loading) {
            setIsModalOpen(false);
            setEditingProject(null);
            setFormData({ name: '', description: '', status: 'ACTIVE' });
          }
        }}
        title={editingProject ? '编辑项目' : '创建新项目'}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                if (!loading) {
                  setIsModalOpen(false);
                  setEditingProject(null);
                  setFormData({ name: '', description: '', status: 'ACTIVE' });
                }
              }}
              disabled={loading}
            >
              取消
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={loading || !formData.name.trim()}
              type="submit"
            >
              {loading ? '处理中...' : editingProject ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              项目名称 *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="请输入项目名称"
              autoFocus
              maxLength={100}
            />
            <p className="text-xs text-slate-500 mt-1">
              {formData.name.length}/100 字符
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              项目描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="请输入项目描述（可选）"
              maxLength={500}
            />
            <p className="text-xs text-slate-500 mt-1">
              {formData.description.length}/500 字符
            </p>
          </div>
        </form>
      </Modal>

      {/* 项目成员管理模态框 */}
      <Modal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        title={`项目成员 - ${selectedProject?.name}`}
        footer={
          <Button variant="ghost" onClick={() => setIsMembersModalOpen(false)}>
            关闭
          </Button>
        }
      >
        <div className="space-y-4">
          {projectMembers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Users size={48} className="mx-auto text-slate-300 mb-2" />
              <p>暂无项目成员</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projectMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border border-slate-200 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-slate-900">
                      {member.user.nickname || member.user.username}
                    </div>
                    <div className="text-sm text-slate-500">
                      {member.user.email}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">
                    {member.role === 'OWNER'
                      ? '所有者'
                      : member.role === 'ADMIN'
                        ? '管理员'
                        : member.role === 'MEMBER'
                          ? '成员'
                          : '观察者'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
