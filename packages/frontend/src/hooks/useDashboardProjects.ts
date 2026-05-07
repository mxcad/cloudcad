import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fileSystemControllerGetProjects,
  fileSystemControllerCreateProject,
  fileSystemControllerGetPersonalSpace,
  fileSystemControllerGetChildren,
} from '@/api-sdk';
import type {
  FileSystemNodeDto,
  ProjectListResponseDto,
  NodeListResponseDto,
} from '@/api-sdk';

const PROJECTS_KEY = ['dashboard', 'projects'] as const;
const PERSONAL_SPACE_KEY = ['dashboard', 'personal-space'] as const;

function getPersonalSpaceChildrenKey(personalSpaceId: string) {
  return ['dashboard', 'personal-space', 'children', personalSpaceId] as const;
}

export function useDashboardProjects() {
  const queryClient = useQueryClient();

  // 1. 项目列表
  const projectsQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: async () => {
      const result = await fileSystemControllerGetProjects({ query: {} } as any);
      if (result.error) throw result.error;
      const data = result.data as any;
      const sorted = (data?.nodes || [])
        .filter((p: FileSystemNodeDto) => (p as any).status !== 'DELETED')
        .sort(
          (a: FileSystemNodeDto, b: FileSystemNodeDto) =>
            new Date((b as any).updatedAt).getTime() -
            new Date((a as any).updatedAt).getTime()
        );
      return { nodes: sorted, raw: data };
    },
  });

  // 2. 私人空间
  const personalSpaceQuery = useQuery({
    queryKey: PERSONAL_SPACE_KEY,
    queryFn: async () => {
      const result = await fileSystemControllerGetPersonalSpace();
      if (result.error) throw result.error;
      return result.data as FileSystemNodeDto | null;
    },
    throwOnError: false,
  });

  const personalSpaceId = personalSpaceQuery.data?.id;

  // 3. 私人空间下的子文件（依赖于私人空间 ID）
  const personalFilesQuery = useQuery({
    queryKey: getPersonalSpaceChildrenKey(personalSpaceId || ''),
    queryFn: async () => {
      const result = await fileSystemControllerGetChildren({
        path: { nodeId: personalSpaceId! },
        query: { limit: 10 },
      } as any);
      if (result.error) throw result.error;
      const data = result.data as NodeListResponseDto;
      return data?.nodes || [];
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
        } as any,
      });
      if (result.error) throw result.error;
      return result.data as FileSystemNodeDto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });

  return {
    projects: projectsQuery.data?.nodes || [],
    personalFiles: (personalFilesQuery.data as FileSystemNodeDto[]) || [],
    loading:
      projectsQuery.isLoading ||
      personalSpaceQuery.isLoading ||
      personalFilesQuery.isLoading,
    error: projectsQuery.error
      ? '加载数据失败'
      : personalSpaceQuery.error
        ? '获取私人空间失败'
        : null,
    createProject: createProjectMutation.mutateAsync,
    isCreating: createProjectMutation.isPending,
    createError: createProjectMutation.error
      ? '创建项目失败，请重试'
      : null,
  };
}
