import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  projectControllerCreateProject,
  nodeControllerGetChildren,
} from '@/api-sdk';
import type { FileSystemNodeDto } from '@/api-sdk';
import type { TransferSettings } from '@/types/filesystem';
import { queryKeys } from '@/lib/queryKeys';
import { fetchProjects } from '@/lib/projects';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';

const PROJECTS_KEY = ['dashboard', 'projects'] as const;

export function useDashboardProjects() {
  const queryClient = useQueryClient();

  // 1. 项目列表（单一出口 @/lib/projects）
  const projectsQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: async (): Promise<FileSystemNodeDto[]> => {
      const { nodes } = await fetchProjects({ excludeDeleted: true });
      return nodes.sort(
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
      const result = await nodeControllerGetChildren({
        throwOnError: true,
        path: { nodeId: personalSpaceId! },
        query: { limit: 10 },
      });
      const data = result.data;
      return data?.nodes ?? [];
    },
    enabled: !!personalSpaceId,
    throwOnError: false,
  });

  // 4. 创建项目 mutation（transferSettings：创建时设定跨项目转移 6 域，省略回落后端默认值）
  const createProjectMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string;
      transferSettings?: TransferSettings;
    }) => {
      const result = await projectControllerCreateProject({
        throwOnError: true,
        body: {
          name: payload.name.trim(),
          description: payload.description?.trim() || undefined,
          ...payload.transferSettings,
        },
      });
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
      ? getErrorMessage(projectsQuery.error) || t('加载数据失败')
      : personalSpaceQuery.error
        ? getErrorMessage(personalSpaceQuery.error) || t('获取私人空间失败')
        : null,
    createProject: createProjectMutation.mutateAsync,
    isCreating: createProjectMutation.isPending,
    createError: createProjectMutation.error
      ? getErrorMessage(createProjectMutation.error) ||
        t('创建项目失败，请重试')
      : null,
    personalSpaceId,
  };
}
