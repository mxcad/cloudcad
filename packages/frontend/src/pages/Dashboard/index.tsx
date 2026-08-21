import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useBrandConfig } from '@/contexts/BrandContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useDashboardProjects } from '@/hooks/useDashboardProjects';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { queryKeys } from '@/lib/queryKeys';
import { t } from '@/languages';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { NewDrawingModal } from '@/components/modals/NewDrawingModal';
import { ViewAllFilesModal } from '@/components/modals/ViewAllFilesModal';
import { ViewAllProjectsModal } from '@/components/modals/ViewAllProjectsModal';
import { MxCadUploader } from '@/components/MxCadUploader';
import type { MxCadUploaderRef } from '@/components/MxCadUploader';
import { usersControllerGetDashboardStats } from '@/api-sdk';
import type { UserDashboardStatsDto } from '@/api-sdk';
import type { FileSystemNodeDto } from '@/api-sdk';
import type { FileSystemNode } from '@/types/filesystem';
import { globalShowToast } from '@/utils/notificationEvents';
import { getErrorMessage } from '@/utils/errorHandler';
import { WelcomeBanner } from './components/WelcomeBanner';
import { ErrorBanner } from './components/ErrorBanner';
import { SuccessBanner } from './components/SuccessBanner';
import { StatsGrid } from './components/StatsGrid';
import { RecentFilesSection } from './components/RecentFilesSection';
import { RecentProjectsSection } from './components/RecentProjectsSection';
import { QuickActionsSection } from './components/QuickActionsSection';

/**
 * 仪表盘页面 - CloudCAD 登录后首页
 *
 * 使用真实 API 数据展示用户工作概览
 */

export const Dashboard: React.FC = () => {
  useDocumentTitle(t('仪表盘'));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { config: brandConfig } = useBrandConfig();

  const appName = brandConfig?.title || 'CloudCAD';
  const queryClient = useQueryClient();

  const {
    data: dashboardStats,
    loading: statsLoading,
    isFetching: statsIsFetching,
    error: statsError,
  } = useDashboardStats();

  const [refreshedStats, setRefreshedStats] =
    useState<UserDashboardStatsDto | null>(null);
  const finalStats = refreshedStats ?? dashboardStats;

  const { data: quotaStorage, isLoading: quotaLoading } = useStorageQuota();

  const {
    projects: rawProjects,
    personalFiles,
    loading: projectsLoading,
    isFetching: projectsIsFetching,
    error: projectsError,
    createProject,
    isCreating,
    createError,
    personalSpaceId,
    createDrawing,
    isCreatingDrawing,
  } = useDashboardProjects();

  const loading = statsLoading || projectsLoading;
  const isBackgroundFetching = statsIsFetching || projectsIsFetching;
  const error = statsError || projectsError;

  const [greeting, setGreeting] = useState('');

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isViewAllFilesOpen, setIsViewAllFilesOpen] = useState(false);
  const [isViewAllProjectsOpen, setIsViewAllProjectsOpen] = useState(false);
  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
  });
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [isDrawingModalOpen, setIsDrawingModalOpen] = useState(false);
  const [drawingName, setDrawingName] = useState('');
  const uploaderRef = useRef<MxCadUploaderRef>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefreshDashboard = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await usersControllerGetDashboardStats();
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让用户感知刷新失败
      if (result.error) throw result.error;
      if (result.data) {
        setRefreshedStats(result.data);
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileSystem.storageQuota,
      });
    } catch (error) {
      console.error('刷新统计数据失败:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 6) setGreeting(t('夜深了'));
    else if (hour < 9) setGreeting(t('早上好'));
    else if (hour < 12) setGreeting(t('上午好'));
    else if (hour < 14) setGreeting(t('中午好'));
    else if (hour < 18) setGreeting(t('下午好'));
    else setGreeting(t('晚上好'));
  }, []);

  useEffect(() => {
    if (searchParams.get('action') === 'create-project') {
      setIsProjectModalOpen(true);
      navigate('/dashboard', { replace: true });
    }
  }, [searchParams, navigate]);

  const handleCreateProject = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!projectFormData.name?.trim()) return;

      try {
        await createProject({
          name: projectFormData.name.trim(),
          description: projectFormData.description.trim() || undefined,
        });

        setIsProjectModalOpen(false);
        setProjectFormData({ name: '', description: '' });

        try {
          const result = await usersControllerGetDashboardStats();
          // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
          if (result.error) throw result.error;
          if (result.data) {
            setRefreshedStats(result.data);
          }
        } catch (refreshErr) {
          console.error('刷新统计数据失败:', refreshErr);
        }

        setCreateSuccess(projectFormData.name);
        setTimeout(() => setCreateSuccess(null), 3000);
      } catch (err) {
        console.error('创建项目失败:', err);
        // 同类问题：创建失败必须可见（与 handleCreateDrawing 一致），
        // 仅 console.error 用户看不到任何提示
        globalShowToast(getErrorMessage(err) || t('创建项目失败，请重试'), 'error');
      }
    },
    [projectFormData, createProject]
  );

  // 新建图纸：当前页弹框创建到个人空间根目录
  const handleCreateDrawing = useCallback(async () => {
    if (!drawingName.trim()) return;
    try {
      await createDrawing({ name: drawingName });
      setIsDrawingModalOpen(false);
      setDrawingName('');
      try {
        const result = await usersControllerGetDashboardStats();
        if (result.error) throw result.error;
        if (result.data) {
          setRefreshedStats(result.data);
        }
      } catch (refreshErr) {
        console.error('刷新统计数据失败:', refreshErr);
      }
      globalShowToast(t('图纸创建成功'), 'success');
    } catch (err) {
      console.error('创建图纸失败:', err);
      globalShowToast(getErrorMessage(err) || t('创建图纸失败，请重试'), 'error');
    }
  }, [drawingName, createDrawing]);

  // 上传图纸成功后刷新私人空间文件与统计
  const handleUploadSuccess = useCallback(() => {
    if (personalSpaceId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.personalSpaceChildren(personalSpaceId),
      });
    }
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] });
  }, [personalSpaceId, queryClient]);

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

  const fileTypeSubtitle = finalStats?.fileTypeStats
    ? [
        stats.dwgFiles && `DWG ${stats.dwgFiles}`,
        stats.dxfFiles && `DXF ${stats.dxfFiles}`,
      ]
        .filter(Boolean)
        .join(' / ')
    : undefined;
  const userName = user?.nickname || user?.username || t('用户');

  const recentProjects = useMemo(() => rawProjects.slice(0, 5), [rawProjects]);
  const recentFiles = useMemo(() => personalFiles.slice(0, 5), [personalFiles]);

  const handleFileEnter = useCallback(
    (node: FileSystemNode) => {
      if (node.isFolder) {
        navigate(`/personal-space/${node.id}`);
      } else {
        window.open(
          `/cad-editor/${node.id}?back=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          '_blank'
        );
      }
    },
    [navigate]
  );

  const handleProjectEnter = useCallback(
    (project: FileSystemNodeDto) => {
      navigate(`/projects/${project.id}/files`);
    },
    [navigate]
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <WelcomeBanner
        greeting={greeting}
        userName={userName}
        appName={appName}
        isDark={isDark}
        refreshDisabled={loading || isRefreshing || isBackgroundFetching}
        onRefresh={handleRefreshDashboard}
      />

      <ErrorBanner error={error} createError={createError} />

      {createSuccess && <SuccessBanner projectName={createSuccess} />}

      <StatsGrid
        stats={stats}
        fileTypeSubtitle={fileTypeSubtitle}
        quotaStorage={quotaStorage}
        quotaLoading={quotaLoading}
        loading={loading}
        onNavigateProjects={() => navigate('/projects')}
        onNavigatePersonalSpace={() => navigate('/personal-space')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <RecentFilesSection
            loading={loading}
            files={recentFiles}
            onViewAll={() => setIsViewAllFilesOpen(true)}
            onEnter={handleFileEnter}
          />

          <RecentProjectsSection
            loading={loading}
            projects={recentProjects}
            onViewAll={() => setIsViewAllProjectsOpen(true)}
            onEnter={handleProjectEnter}
          />
        </div>

        <div className="space-y-6">
          <QuickActionsSection
            onNewProject={() => setIsProjectModalOpen(true)}
            onUpload={() => uploaderRef.current?.triggerUpload()}
            onNewDrawing={() => setIsDrawingModalOpen(true)}
          />
        </div>
      </div>

      {/* 隐藏上传器：供「上传图纸」快捷操作在当前页直接触发文件选择 */}
      <div className="hidden">
        <MxCadUploader
          ref={uploaderRef}
          nodeId={() => personalSpaceId || ''}
          openAfterUpload={false}
          onSuccess={handleUploadSuccess}
          buttonText=""
        />
      </div>

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

      <NewDrawingModal
        isOpen={isDrawingModalOpen}
        drawingName={drawingName}
        loading={isCreatingDrawing}
        onClose={() => {
          setIsDrawingModalOpen(false);
          setDrawingName('');
        }}
        onDrawingNameChange={setDrawingName}
        onCreate={handleCreateDrawing}
      />

      <ViewAllFilesModal
        isOpen={isViewAllFilesOpen}
        onClose={() => setIsViewAllFilesOpen(false)}
      />

      <ViewAllProjectsModal
        isOpen={isViewAllProjectsOpen}
        onClose={() => setIsViewAllProjectsOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
