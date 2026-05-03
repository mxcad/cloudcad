import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useTheme } from '@/composables/useTheme';
import { useBrandConfig } from '@/composables/useBrandConfig';
import { projectsApi, type FileSystemNodeDto } from '@/services/projectsApi';
import { usersApi, type UserDashboardStatsDto } from '@/services/usersApi';
import { formatFileSize, formatRelativeTime, computeGreeting } from '@/utils/formatters';

export function useDashboard() {
  const router = useRouter();
  const route = useRoute();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { config: brandConfig } = useBrandConfig();

  const appName = computed(() => brandConfig.value?.title || 'CloudCAD');

  const projects = ref<FileSystemNodeDto[]>([]);
  const personalFiles = ref<FileSystemNodeDto[]>([]);
  const dashboardStats = ref<UserDashboardStatsDto | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const greeting = ref(computeGreeting());

  const isProjectModalOpen = ref(false);
  const projectFormData = ref({ name: '', description: '' });
  const projectCreating = ref(false);
  const createSuccess = ref<string | null>(null);
  let createSuccessTimer: ReturnType<typeof setTimeout> | null = null;

  const userName = computed(() => user.value?.nickname || user.value?.username || '用户');

  const stats = computed(() => {
    if (!dashboardStats.value) {
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

    const ds = dashboardStats.value;
    return {
      projects: ds.projectCount,
      files: ds.totalFiles,
      todayUploads: ds.todayUploads,
      storage: formatFileSize(ds.storage.used),
      storageTotal: formatFileSize(ds.storage.total),
      usagePercent: ds.storage.usagePercent,
      dwgFiles: ds.fileTypeStats.dwg,
      dxfFiles: ds.fileTypeStats.dxf,
      otherFiles: ds.fileTypeStats.other,
    };
  });

  const recentProjects = computed(() => projects.value.slice(0, 5));
  const recentFiles = computed(() => personalFiles.value.slice(0, 5));

  onMounted(() => {
    if (route.query.action === 'create-project') {
      isProjectModalOpen.value = true;
      router.replace('/dashboard');
    }
  });

  async function loadData(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const [projectsRes, statsRes, personalSpaceRes] = await Promise.all([
        projectsApi.list(),
        usersApi.getDashboardStats(),
        projectsApi.getPersonalSpace().catch(() => null),
      ]);

      if (projectsRes && projectsRes.data?.nodes) {
        const sortedProjects = projectsRes.data.nodes
          .filter((p: FileSystemNodeDto) => p.status !== 'DELETED')
          .sort(
            (a: FileSystemNodeDto, b: FileSystemNodeDto) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        projects.value = sortedProjects;
      }

      if (statsRes.data) {
        dashboardStats.value = statsRes.data;
      }

      if (personalSpaceRes?.data?.id) {
        const childrenRes = await projectsApi.getChildren(
          personalSpaceRes.data.id,
          { limit: 10 }
        );
        if (childrenRes.data?.nodes) {
          personalFiles.value = childrenRes.data.nodes;
        }
      }
    } catch (err) {
      console.error('加载仪表盘数据失败:', err);
      error.value = '加载数据失败，请稍后重试';
    } finally {
      loading.value = false;
    }
  }

  async function handleCreateProject(): Promise<void> {
    if (!projectFormData.value.name.trim()) return;

    projectCreating.value = true;
    try {
      const response = await projectsApi.create({
        name: projectFormData.value.name.trim(),
        description: projectFormData.value.description.trim() || undefined,
      });

      const createdName = response.data?.name || projectFormData.value.name.trim();
      createSuccess.value = createdName;
      if (createSuccessTimer) clearTimeout(createSuccessTimer);
      createSuccessTimer = setTimeout(() => {
        createSuccess.value = null;
      }, 3000);

      isProjectModalOpen.value = false;
      projectFormData.value = { name: '', description: '' };

      const projectsRes = await projectsApi.list();
      if (projectsRes && projectsRes.data?.nodes) {
        const sortedProjects = projectsRes.data.nodes
          .filter((p: FileSystemNodeDto) => p.status !== 'DELETED')
          .sort(
            (a: FileSystemNodeDto, b: FileSystemNodeDto) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        projects.value = sortedProjects;
      }
    } catch (err) {
      console.error('创建项目失败:', err);
      error.value = '创建项目失败，请重试';
    } finally {
      projectCreating.value = false;
    }
  }

  function closeProjectModal(): void {
    isProjectModalOpen.value = false;
    projectFormData.value = { name: '', description: '' };
  }

  function navigateToUpload(): void {
    router.push('/personal-space?action=upload');
  }

  function handleFileClick(file: FileSystemNodeDto): void {
    if (file.isFolder) {
      router.push(`/personal-space/${file.id}`);
    } else {
      window.open(`/cad-editor/${file.id}`, '_blank');
    }
  }

  onUnmounted(() => {
    if (createSuccessTimer) {
      clearTimeout(createSuccessTimer);
    }
  });

  loadData();

  return {
    isDark,
    appName,
    userName,
    greeting,
    projects,
    personalFiles,
    dashboardStats,
    loading,
    error,
    isProjectModalOpen,
    projectFormData,
    projectCreating,
    createSuccess,
    stats,
    recentProjects,
    recentFiles,
    formatRelativeTime,
    handleCreateProject,
    closeProjectModal,
    navigateToUpload,
    handleFileClick,
    loadData,
  };
}