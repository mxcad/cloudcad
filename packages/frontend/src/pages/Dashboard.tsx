import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { projectsApi } from '../services/projectsApi';
import { usersApi } from '../services/usersApi';
import type { ProjectDto, FileSystemNodeDto, UserDashboardStatsDto } from '../types/api-client';
import { formatFileSize, formatRelativeTime } from '../utils/fileUtils';
import { APP_NAME } from '../constants/appConfig';
import { ProjectModal } from '../components/modals/ProjectModal';

// Lucide 图标
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import HardDrive from 'lucide-react/dist/esm/icons/hard-drive';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Plus from 'lucide-react/dist/esm/icons/plus';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Layers from 'lucide-react/dist/esm/icons/layers';
import Upload from 'lucide-react/dist/esm/icons/upload';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import CheckCircle from 'lucide-react/dist/esm/icons/check-circle';

/**
 * 仪表盘页面 - CloudCAD 登录后首页
 * 
 * 使用真实 API 数据展示用户工作概览
 */

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; className?: string; color?: string }>;
  color: string;
  onClick?: () => void;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  color,
  onClick,
  loading 
}) => {
  return (
    <div 
      onClick={onClick}
      className={`
        relative p-5 rounded-2xl transition-all duration-300
        ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl' : ''}
      `}
      style={{ 
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {title}
          </div>
          {loading ? (
            <div className="h-8 w-20 rounded-lg skeleton-theme" />
          ) : (
            <div className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              {value}
            </div>
          )}
          {subtitle && !loading && (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </div>
          )}
        </div>
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15` }}
        >
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  );
};

interface FileItemProps {
  file: FileSystemNodeDto;
  onClick?: () => void;
}

const FileItem: React.FC<FileItemProps> = ({ file, onClick }) => {
  const isFile = !file.isFolder;
  
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 p-3 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--bg-tertiary)]"
    >
      {/* 图标 */}
      <div 
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ 
          background: isFile 
            ? 'var(--accent-100)' 
            : 'var(--primary-100)'
        }}
      >
        {isFile ? (
          <FileText size={18} color="var(--accent-600)" />
        ) : (
          <FolderOpen size={18} color="var(--primary-600)" />
        )}
      </div>
      
      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <h4 
          className="font-medium text-sm truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {file.name}
        </h4>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>{formatRelativeTime(file.updatedAt)}</span>
          {file.size && (
            <>
              <span>·</span>
              <span>{formatFileSize(file.size)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface QuickActionProps {
  icon: React.ComponentType<{ size?: number; className?: string; color?: string }>;
  label: string;
  color: string;
  onClick?: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({ icon: Icon, label, color, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left w-full hover:bg-[var(--bg-tertiary)] group"
  >
    <div 
      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
      style={{ background: `${color}15` }}
    >
      <Icon size={18} color={color} />
    </div>
    <span className="font-medium text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>
      {label}
    </span>
    <ArrowRight 
      size={14} 
      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1" 
      color="var(--text-muted)"
    />
  </button>
);

export const Dashboard: React.FC = () => {
  useDocumentTitle('仪表盘');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { isDark } = useTheme();
  
  // 数据状态
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [personalFiles, setPersonalFiles] = useState<FileSystemNodeDto[]>([]);
  const [dashboardStats, setDashboardStats] = useState<UserDashboardStatsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('');
  
  // 项目创建弹框状态
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectFormData, setProjectFormData] = useState({ name: '', description: '' });
  const [projectCreating, setProjectCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  
  // 计算问候语
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 6) setGreeting('夜深了');
    else if (hour < 9) setGreeting('早上好');
    else if (hour < 12) setGreeting('上午好');
    else if (hour < 14) setGreeting('中午好');
    else if (hour < 18) setGreeting('下午好');
    else setGreeting('晚上好');
  }, []);
  
  // 检测 URL 参数，自动打开创建弹框
  useEffect(() => {
    if (searchParams.get('action') === 'create-project') {
      setIsProjectModalOpen(true);
      // 清除 URL 参数
      navigate('/dashboard', { replace: true });
    }
  }, [searchParams, navigate]);
  
  // 创建项目
  const handleCreateProject = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectFormData.name.trim()) return;
    
    setProjectCreating(true);
    try {
      const response = await projectsApi.create({
        name: projectFormData.name.trim(),
        description: projectFormData.description.trim() || undefined,
      });
      
      // 关闭弹框，重置表单
      setIsProjectModalOpen(false);
      setProjectFormData({ name: '', description: '' });
      
      // 显示成功提示
      setCreateSuccess(response.data?.name || projectFormData.name);
      setTimeout(() => setCreateSuccess(null), 3000);
      
      // 刷新项目列表
      const projectsRes = await projectsApi.list();
      if (projectsRes.data?.projects) {
        const sortedProjects = projectsRes.data.projects
          .filter((p: ProjectDto) => p.status !== 'DELETED')
          .sort((a: ProjectDto, b: ProjectDto) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setProjects(sortedProjects);
      }
    } catch (err) {
      console.error('创建项目失败:', err);
      setError('创建项目失败，请重试');
    } finally {
      setProjectCreating(false);
    }
  }, [projectFormData]);
  
  // 加载真实数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // 并行加载多个数据源
        const [projectsRes, statsRes, personalSpaceRes] = await Promise.all([
          projectsApi.list(),
          usersApi.getDashboardStats(),
          projectsApi.getPersonalSpace().catch(() => null), // 私人空间可能不存在
        ]);
        
        // 处理项目数据
        if (projectsRes.data?.projects) {
          const sortedProjects = projectsRes.data.projects
            .filter((p: ProjectDto) => p.status !== 'DELETED')
            .sort((a: ProjectDto, b: ProjectDto) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          setProjects(sortedProjects);
        }
        
        // 处理统计数据
        if (statsRes.data) {
          setDashboardStats(statsRes.data);
        }
        
        // 处理个人空间文件
        if (personalSpaceRes?.data?.id) {
          const childrenRes = await projectsApi.getChildren(personalSpaceRes.data.id, { limit: 10 });
          if (childrenRes.data?.nodes) {
            setPersonalFiles(childrenRes.data.nodes);
          }
        }
      } catch (err) {
        console.error('加载仪表盘数据失败:', err);
        setError('加载数据失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // 统计数据
  const stats = useMemo(() => {
    if (!dashboardStats) {
      return {
        projects: 0,
        files: 0,
        todayUploads: 0,
        storage: '-',
        storageTotal: '-',
        usagePercent: 0,
        dwgFiles: 0,
        dxfFiles: 0,
        otherFiles: 0,
      };
    }
    
    return {
      projects: dashboardStats.projectCount,
      files: dashboardStats.totalFiles,
      todayUploads: dashboardStats.todayUploads,
      storage: formatFileSize(dashboardStats.storage.used),
      storageTotal: formatFileSize(dashboardStats.storage.total),
      usagePercent: dashboardStats.storage.usagePercent,
      dwgFiles: dashboardStats.fileTypeStats.dwg,
      dxfFiles: dashboardStats.fileTypeStats.dxf,
      otherFiles: dashboardStats.fileTypeStats.other,
    };
  }, [dashboardStats]);
  
  const userName = user?.nickname || user?.username || '用户';
  
  // 最近更新的项目（前5个）
  const recentProjects = useMemo(() => projects.slice(0, 5), [projects]);
  
  // 最近更新的文件（前5个）
  const recentFiles = useMemo(() => personalFiles.slice(0, 5), [personalFiles]);
  
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* 欢迎区域 */}
      <div 
        className="relative overflow-hidden rounded-2xl p-6 mb-6"
        style={{
          background: isDark 
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%)'
            : 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(6, 182, 212, 0.03) 100%)',
          border: '1px solid var(--border-default)'
        }}
      >
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 
              className="text-2xl sm:text-3xl font-bold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {greeting}，{userName}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              欢迎使用 {APP_NAME}，开始您的设计工作
            </p>
          </div>
          
          {/* 快捷操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={() => setIsProjectModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm text-white transition-all duration-200 hover:shadow-lg"
              style={{
                background: 'linear-gradient(135deg, var(--primary-600), var(--primary-500))',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)'
              }}
            >
              <Plus size={16} />
              新建项目
            </button>
            <button
              onClick={() => navigate('/personal-space?action=upload')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 hover:shadow-md"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)'
              }}
            >
              <Upload size={16} />
              上传图纸
            </button>
          </div>
        </div>
      </div>
      
      {/* 错误提示 */}
      {error && (
        <div 
          className="flex items-center gap-3 p-4 rounded-xl mb-6"
          style={{ 
            background: 'var(--error-light)',
            border: '1px solid var(--error-dim)'
          }}
        >
          <AlertCircle size={20} style={{ color: 'var(--error)' }} />
          <span className="text-sm" style={{ color: 'var(--error)' }}>{error}</span>
        </div>
      )}
      
      {/* 成功提示 */}
      {createSuccess && (
        <div 
          className="flex items-center gap-3 p-4 rounded-xl mb-6"
          style={{ 
            background: 'var(--success-light, rgba(34, 197, 94, 0.1))',
            border: '1px solid var(--success-dim, rgba(34, 197, 94, 0.3))'
          }}
        >
          <CheckCircle size={20} style={{ color: '#22c55e' }} />
          <span className="text-sm" style={{ color: '#22c55e' }}>项目「{createSuccess}」创建成功！</span>
        </div>
      )}
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="我的项目"
          value={stats.projects}
          subtitle="活跃项目"
          icon={FolderOpen}
          color="var(--primary-500)"
          onClick={() => navigate('/projects')}
          loading={loading}
        />
        <StatCard
          title="图纸文件"
          value={stats.files}
          subtitle={`DWG ${stats.dwgFiles} / DXF ${stats.dxfFiles}`}
          icon={FileText}
          color="var(--accent-500)"
          onClick={() => navigate('/personal-space')}
          loading={loading}
        />
        <StatCard
          title="今日上传"
          value={stats.todayUploads}
          subtitle="个文件"
          icon={Upload}
          color="#8b5cf6"
          loading={loading}
        />
        <StatCard
          title="存储使用"
          value={stats.storage}
          subtitle={`共 ${stats.storageTotal}`}
          icon={HardDrive}
          color={stats.usagePercent > 90 ? '#ef4444' : '#22c55e'}
          loading={loading}
        />
      </div>
      
      {/* 主内容区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：最近内容 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 最近访问的文件 */}
          <div 
            className="rounded-2xl p-5"
            style={{ 
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={18} style={{ color: 'var(--primary-500)' }} />
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  最近文件
                </h3>
              </div>
              <Link 
                to="/personal-space"
                className="flex items-center gap-1 text-xs font-medium hover:gap-2 transition-all"
                style={{ color: 'var(--primary-500)' }}
              >
                查看全部
                <ArrowRight size={14} />
              </Link>
            </div>
            
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-xl skeleton-theme" />
                ))}
              </div>
            ) : recentFiles.length > 0 ? (
              <div className="space-y-1">
                {recentFiles.map((file) => (
                  <FileItem
                    key={file.id}
                    file={file}
                    onClick={() => {
                      if (file.isFolder) {
                        // 文件夹：跳转到目录
                        navigate(`/personal-space/${file.id}`);
                      } else {
                        // 文件：直接打开编辑器
                        navigate(`/cad-editor/${file.id}`);
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <div 
                className="text-center py-8 rounded-xl"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <FileText size={32} style={{ color: 'var(--text-muted)' }} className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  暂无文件，上传您的第一个图纸
                </p>
              </div>
            )}
          </div>
          
          {/* 我的项目 */}
          <div 
            className="rounded-2xl p-5"
            style={{ 
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers size={18} style={{ color: 'var(--accent-500)' }} />
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  最近项目
                </h3>
              </div>
              <Link 
                to="/projects"
                className="flex items-center gap-1 text-xs font-medium hover:gap-2 transition-all"
                style={{ color: 'var(--accent-500)' }}
              >
                查看全部
                <ArrowRight size={14} />
              </Link>
            </div>
            
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-xl skeleton-theme" />
                ))}
              </div>
            ) : recentProjects.length > 0 ? (
              <div className="space-y-1">
                {recentProjects.map((project) => (
                  <FileItem
                    key={project.id}
                    file={{
                      id: project.id,
                      name: project.name,
                      description: project.description,
                      isFolder: true,
                      isRoot: project.isRoot,
                      updatedAt: project.updatedAt,
                    } as FileSystemNodeDto}
                    onClick={() => navigate(`/projects/${project.id}/files`)}
                  />
                ))}
              </div>
            ) : (
              <div 
                className="text-center py-8 rounded-xl"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <FolderOpen size={32} color="var(--text-muted)" className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  暂无项目，创建您的第一个项目
                </p>
              </div>
            )}
          </div>
        </div>
        
        {/* 右侧：快捷操作和存储 */}
        <div className="space-y-6">
          {/* 快捷操作 */}
          <div 
            className="rounded-2xl p-5"
            style={{ 
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-default)'
            }}
          >
            <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              快捷操作
            </h3>
            <div className="space-y-1">
              <QuickAction
                icon={Plus}
                label="新建项目"
                color="var(--primary-500)"
                onClick={() => setIsProjectModalOpen(true)}
              />
              <QuickAction
                icon={Upload}
                label="上传图纸"
                color="var(--accent-500)"
                onClick={() => navigate('/personal-space?action=upload')}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* 项目创建弹框 */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        editingProject={null}
        formData={projectFormData}
        loading={projectCreating}
        onClose={() => {
          setIsProjectModalOpen(false);
          setProjectFormData({ name: '', description: '' });
        }}
        onFormDataChange={setProjectFormData}
        onSubmit={handleCreateProject}
      />
    </div>
  );
};

export default Dashboard;