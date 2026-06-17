import { useQuery } from '@tanstack/react-query';
import { fileSystemControllerGetStorageQuota } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';

export function useStorageQuota(userId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.fileSystem.storageQuota,
    queryFn: async () => {
      const result = await fileSystemControllerGetStorageQuota({
        query: { nodeId: '', userId: userId || '' },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!userId,
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? '加载存储空间信息失败' : null,
  };
}
