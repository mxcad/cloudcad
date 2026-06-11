import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBrandConfig } from '../contexts/BrandContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useDashboardProjects } from '../hooks/useDashboardProjects';
import { formatFileSize } from '../utils/fileUtils';
import { ProjectModal } from '../components/modals/ProjectModal';
import { FileItem } from '../components/FileItem';
import { ViewAllFilesModal } from '../components/modals/ViewAllFilesModal';
import { ViewAllProjectsModal } from '../components/modals/ViewAllProjectsModal';
import { toFileSystemNode, FileSystemNode } from '../types/filesystem';
import { usersControllerGetDashboardStats, fileSystemControllerGetStorageQuota } from '@/api-sdk';
import type { UserDashboardStatsDto, StorageInfoDto } from '@/api-sdk';

// Lucide 图标
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { FolderOpen } from 'lucide-react';
import { FileText } from 'lucide-react';
import { HardDrive } from 'lucide-react';
import { Clock } from 'lucide-react';
import { Plus } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Layers } from 'lucide-react';
import { Upload, FilePlus } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { CheckCircle } from 'lucide-react';

/**
 * 仪表盘页面 - CloudCAD 登录后首页
 *
 * 使用真实 API 数据展示用户工作概览
 */

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    color?: string;
  }>;
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
  loading,
}) => {
  return (
    <Card
      variant="outlined"
      padding="md"
      radius="2xl"
      onClick={onClick}
      className={`
        relative transition-all duration-300
        ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl' : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div
            className="text-sm font-medium mb-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {title}
          </div>
          {loading ? (
            <div className="h-8 w-20 rounded-lg skeleton-theme" />
          ) : (
            <div
              className="text-2xl font-bold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
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
    </Card>
  );
};

interface QuickActionProps {
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    color?: string;
  }>;
  label: string;
  color: string;
  onClick?: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({
  icon: Icon,
  label,
  color,
  onClick,
}) => (
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
    <span
      className="font-medium text-sm flex-1"
      style={{ color: 'var(--text-secondary)' }}
    >
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
  const { config: brandConfig } = useBrandConfig();

  const appName = brandConfig?.title || 'CloudCAD';
  const queryClient = useQueryClient();

  // 数据状态
  const {
    data: dashboardStats,
    loading: statsLoading,
    isFetching: statsIsFetching,
    error: statsError,
  } = useDashboardStats();

  // 用于手动刷新后的统计数据（覆盖 hook 数据）
  const [refreshedStats, setRefreshedStats] = useState<UserDashboardStatsDto | null>(null);
  const finalStats = refreshedStats ?? dashboardStats;

  // 存储配额数据（与侧边栏同一数据源）
  const [quotaStorage, setQuotaStorage] = useState<StorageInfoDto | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setQuotaLoading(true);
      fileSystemControllerGetStorageQuota({ query: { nodeId: '', userId: user.id || '' } })
        .then((result: { data?: StorageInfoDto }) => {
          const data = result?.data as StorageInfoDto | undefined;
          if (data) setQuotaStorage(data);
        })
        .catch(() => {})
        .finally(() => setQuotaLoading(false));
    }
  }, [user]);

  const {
    projects: rawProjects,
    personalFiles,
    loading: projectsLoading,
    isFetching: projectsIsFetching,
    error: projectsError,
    createProject,
    isCreating,
    createError,
  } = useDashboardProjects();

  const loading = statsLoading || projectsLoading;
  const isBackgroundFetching = statsIsFetching || projectsIsFetching;
  const error = statsError || projectsError;

  const [greeting, setGreeting] = useState('');

  // 项目创建弹框状态
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isViewAllFilesOpen, setIsViewAllFilesOpen] = useState(false);
  const [isViewAllProjectsOpen, setIsViewAllProjectsOpen] = useState(false);
  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
  });
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // 手动刷新仪表盘数据
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefreshDashboard = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await usersControllerGetDashboardStats();
      if (result.data) {
        setRefreshedStats(result.data);
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

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
  const handleCreateProject = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!projectFormData.name?.trim()) return;

      try {
        await createProject({
          name: projectFormData.name.trim(),
          description: projectFormData.description.trim() || undefined,
        });

        // 关闭弹框，重置表单
        setIsProjectModalOpen(false);
        setProjectFormData({ name: '', description: '' });

        // 刷新统计数据
        try {
          const result = await usersControllerGetDashboardStats();
          if (result.data) {
            setRefreshedStats(result.data);
          }
        } catch (refreshErr) {
          // 静默失败，不影响主流程
          console.error('刷新统计数据失败:', refreshErr);
        }

        // 显示成功提示
        setCreateSuccess(projectFormData.name);
        setTimeout(() => setCreateSuccess(null), 3000);
      } catch (err) {
        console.error('创建项目失败:', err);
        // 错误由 createError 状态在页面顶部横幅中展示，弹框保持打开
      }
    },
    [projectFormData, createProject]
  );

  // 统计数据
  const stats = useMemo(() => {
    if (!finalStats || !finalStats.fileTypeStats) {
      return {
        projects: 0,
        files: 0,
        todayUploads: 0,
        dwgFiles: 0,
        dxfFiles: 0,
        otherFiles: 0,
      };
    }

    return {
      projects: finalStats.projectCount,
      files: finalStats.totalFiles,
      todayUploads: finalStats.todayUploads,
      dwgFiles: finalStats.fileTypeStats.dwg,
      dxfFiles: finalStats.fileTypeStats.dxf,
      otherFiles: finalStats.fileTypeStats.other,
    };
  }, [finalStats]);

  const userName = user?.nickname || user?.username || '用户';

  // 最近更新的项目（前5个）
  const recentProjects = useMemo(() => rawProjects.slice(0, 5), [rawProjects]);

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
          border: '1px solid var(--border-default)',
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
              欢迎使用 {appName}，开始您的设计工作
            </p>
          </div>

          {/* 刷新按钮 */}
          <div className="flex gap-3">
            <Button variant="ghost" icon={RefreshCw} onClick={handleRefreshDashboard} disabled={loading || isRefreshing || isBackgroundFetching} title="刷新仪表盘数据">
              刷新
            </Button>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {(error || createError) && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl mb-6"
          style={{
            background: 'var(--error-light)',
            border: '1px solid var(--error-dim)',
          }}
        >
          <AlertCircle size={20} style={{ color: 'var(--error)' }} className="flex-shrink-0 mt-0.5" />
          <div className="text-sm" style={{ color: 'var(--error)' }}>
            {error && <div>{error}</div>}
            {createError && <div>{createError}</div>}
          </div>
        </div>
      )}

      {/* 成功提示 */}
      {createSuccess && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl mb-6"
          style={{
            background: 'var(--success-light, rgba(34, 197, 94, 0.1))',
            border: '1px solid var(--success-dim, rgba(34, 197, 94, 0.3))',
          }}
        >
          <CheckCircle size={20} style={{ color: '#22c55e' }} />
          <span className="text-sm" style={{ color: '#22c55e' }}>
            项目「{createSuccess}」创建成功！
          </span>
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
          onClick={() => navigate('/personal-space?action=upload')}
          loading={loading}
        />
        <StatCard
          title="存储使用"
          value={quotaStorage ? formatFileSize(quotaStorage.used) : '-'}
          subtitle={quotaStorage ? `共 ${formatFileSize(quotaStorage.total)}` : ''}
          icon={HardDrive}
          color={(quotaStorage?.usagePercent ?? 0) > 90 ? '#ef4444' : '#22c55e'}
          loading={quotaLoading}
        />
      </div>

      {/* 主内容区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：最近内容 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 最近访问的文件 */}
          <Section
            title="最近文件"
            actions={
              <button
                onClick={() => setIsViewAllFilesOpen(true)}
                className="flex items-center gap-1 text-xs font-medium hover:gap-2 transition-all"
                style={{ color: 'var(--primary-500)' }}
              >
                查看全部
                <ArrowRight size={14} />
              </button>
            }
            variant="outlined"
            className="rounded-2xl"
          >

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-xl skeleton-theme" />
                ))}
              </div>
            ) : recentFiles.length > 0 ? (
              <div className="space-y-1">
                {recentFiles.map((file) => (
                  <FileItem
                    key={file.id}
                    node={toFileSystemNode(file)}
                    compact
                    onEnter={(node) => {
                      if (node.isFolder) {
                        navigate(`/personal-space/${node.id}`);
                      } else {
                        window.open(`/cad-editor/${node.id}?back=${encodeURIComponent(window.location.pathname + window.location.search)}`, '_blank');
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
                <FileText
                  size={32}
                  style={{ color: 'var(--text-muted)' }}
                  className="mx-auto mb-2"
                />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  暂无文件，上传您的第一个图纸
                </p>
              </div>
            )}
          </Section>

          {/* 我的项目 */}
          <Section
            title="最近项目"
            actions={
              <button
                onClick={() => setIsViewAllProjectsOpen(true)}
                className="flex items-center gap-1 text-xs font-medium hover:gap-2 transition-all"
                style={{ color: 'var(--accent-500)' }}
              >
                查看全部
                <ArrowRight size={14} />
              </button>
            }
            variant="outlined"
            className="rounded-2xl"
          >

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-xl skeleton-theme" />
                ))}
              </div>
            ) : recentProjects.length > 0 ? (
              <div className="space-y-1">
                {recentProjects.map((project) => (
                  <FileItem
                    key={project.id}
                    node={
                      {
                        id: project.id,
                        name: project.name,
                        isFolder: true,
                        isRoot: project.isRoot,
                        updatedAt: project.updatedAt,
                        parentId: undefined,
                        createdAt: project.createdAt || '',
                        path: '',
                        ownerId: project.ownerId || '',
                      } as FileSystemNode
                    }
                    compact
                    onEnter={() => navigate(`/projects/${project.id}/files`)}
                  />
                ))}
              </div>
            ) : (
              <div
                className="text-center py-8 rounded-xl"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <FolderOpen
                  size={32}
                  color="var(--text-muted)"
                  className="mx-auto mb-2"
                />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  暂无项目，创建您的第一个项目
                </p>
              </div>
            )}
          </Section>
        </div>

        {/* 右侧：快捷操作和存储 */}
        <div className="space-y-6">
          {/* 快捷操作 */}
          <Section
            title="快捷操作"
            variant="outlined"
            className="rounded-2xl"
          >
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
              <QuickAction
                icon={FilePlus}
                label="新建图纸"
                color="var(--primary-500)"
                onClick={() => navigate('/personal-space?action=new-drawing')}
              />
            </div>
          </Section>
        </div>
      </div>

      {/* 项目创建弹框 */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        editingProject={null}
        formData={projectFormData}
        loading={isCreating}
        onClose={() => {
          setIsProjectModalOpen(false);
          setProjectFormData({ name: '', description: '' });
        }}
        onFormDataChange={setProjectFormData}
        onSubmit={handleCreateProject}
      />

      {/* 最近文件查看全部弹框 */}
      <ViewAllFilesModal
        isOpen={isViewAllFilesOpen}
        onClose={() => setIsViewAllFilesOpen(false)}
      />

      {/* 最近项目查看全部弹框 */}
      <ViewAllProjectsModal
        isOpen={isViewAllProjectsOpen}
        onClose={() => setIsViewAllProjectsOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
