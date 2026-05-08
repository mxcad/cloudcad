import { useQuery } from '@tanstack/react-query';
import { fileSystemControllerGetPersonalSpace } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';

/**
 * 共享的私人空间查询 hook
 *
 * 所有需要获取私人空间 ID 的组件都应使用此 hook，
 * 确保 React Query 缓存共享，避免重复请求。
 */
export function usePersonalSpaceQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.fileSystem.personalSpace,
    queryFn: async () => {
      const result = await fileSystemControllerGetPersonalSpace();
      if (result.error) throw result.error;
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
    ...options,
  });
}
