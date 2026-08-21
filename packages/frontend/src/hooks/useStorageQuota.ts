import { useQuery } from '@tanstack/react-query';
import { projectControllerGetStorageQuota } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import type { StorageInfoDto } from '@/api-sdk';

export function useStorageQuota() {
  return useQuery({
    queryKey: queryKeys.fileSystem.storageQuota,
    queryFn: async () => {
      const result = await projectControllerGetStorageQuota();
      // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 react-query 进入 error 态
      if (result.error) throw result.error;
      return (result.data as StorageInfoDto) ?? null;
    },
  });
}
