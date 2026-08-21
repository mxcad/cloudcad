import { useQuery } from '@tanstack/react-query';
import { projectControllerGetProjectQuota } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import type { ProjectQuotaDto } from '@/api-sdk';

export function useProjectQuota(projectId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.fileSystem.storageQuota, 'project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const result = await projectControllerGetProjectQuota({
        path: { projectId },
      });
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 react-query 进入 error 态
      if (result.error) throw result.error;
      return (result.data as ProjectQuotaDto) ?? null;
    },
    enabled: !!projectId,
  });
}
