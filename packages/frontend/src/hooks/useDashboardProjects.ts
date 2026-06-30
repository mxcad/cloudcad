import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fileSystemControllerGetProjects,
  fileSystemControllerCreateProject,
  fileSystemControllerGetChildren,
} from '@/api-sdk';
import type {
  FileSystemNodeDto,
} from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';
import { t } from '@/languages';

const PROJECTS_KEY = ['dashboard', 'projects'] as const;

export function useDashboardProjects() {
  const queryClient = useQueryClient();

  // 1. 项目列表
  const projectsQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: async (): Promise<FileSystemNodeDto[]> => {
      const result = await fileSystemControllerGetProjects({ query: {} });
      if (result.error) throw result.error;
      const nodes = result.data?.nodes || [];
      return nodes
        .filter((p: FileSystemNodeDto) => p.fileStatus !== 'DELETED')
        .sort(
          (a: FileSystemNodeDto, b: FileSystemNodeDto) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    },
  });

  // 2. 私人空间（使用共享 hook）
  const personalSpaceQuery = usePersonalSpaceQuery();
  const personalSpaceId = personalSpaceQuery.data?.id;

  // 3. 私人空间下的子文件（依赖于私人空间 ID）
  const personalFilesQuery = useQuery({
    queryKey: queryKeys.dashboard.personalSpaceChildren(personalSpaceId || ''),
    queryFn: async () => {
      const result = await fileSystemControllerGetChildren({
        path: { nodeId: personalSpaceId! },
        query: { limit: 10 },
      });
      if (result.error) throw result.error;
      const data = result.data;
      return data?.nodes ?? [];
    },
    enabled: !!personalSpaceId,
    throwOnError: false,
  });

  // 4. 创建项目 mutation
  const createProjectMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const result = await fileSystemControllerCreateProject({
        body: {
          name: payload.name.trim(),
          description: payload.description?.trim() || undefined,
        },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });

  return {
    projects: projectsQuery.data ?? [],
    personalFiles: personalFilesQuery.data ?? [],
    loading:
      projectsQuery.isLoading ||
      personalSpaceQuery.isLoading ||
      personalFilesQuery.isLoading,
    isFetching:
      projectsQuery.isFetching ||
      personalSpaceQuery.isFetching ||
      personalFilesQuery.isFetching,
    error: projectsQuery.error
      ? t('加载数据失败')
      : personalSpaceQuery.error
        ? t('获取私人空间失败')
        : null,
    createProject: createProjectMutation.mutateAsync,
    isCreating: createProjectMutation.isPending,
    createError: createProjectMutation.error
      ? t('创建项目失败，请重试')
      : null,
  };
}