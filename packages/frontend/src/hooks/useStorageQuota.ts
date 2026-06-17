import { useQuery } from '@tanstack/react-query';
import { fileSystemControllerGetStorageQuota } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';
import type { StorageInfoDto } from '@/api-sdk';

export function useStorageQuota() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.fileSystem.storageQuota,
    queryFn: async () => {
      const result = await fileSystemControllerGetStorageQuota({
        query: { nodeId: '', userId: user?.id || '' },
      });
      return (result.data as StorageInfoDto) ?? null;
    },
    enabled: !!user,
  });
}
