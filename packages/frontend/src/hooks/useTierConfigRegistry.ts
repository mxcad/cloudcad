import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { vipControllerGetRegistry } from '@/api-sdk';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME_DEFAULT } from '@/constants/timeouts';
import { buildRegistryMap } from '@/utils/tierConfigUtils';
import { isAccessTokenExpired } from '@/utils/tokenUtils';
import type { ConfigRegistryEntry, RegistryMap } from '@/utils/tierConfigUtils';

export interface UseTierConfigRegistryResult {
  registry: RegistryMap;
  entries: ConfigRegistryEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
}

interface TierConfigQueryData {
  entries: ConfigRegistryEntry[];
  registry: RegistryMap;
}

async function fetchRegistry(): Promise<TierConfigQueryData> {
  const res = await vipControllerGetRegistry();
  // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 react-query 进入 error 态
  if (res?.error) throw res.error;
  const data = res?.data as ConfigRegistryEntry[] | undefined;
  const entries = Array.isArray(data) ? data : [];
  return { entries, registry: buildRegistryMap(entries) };
}

export function useTierConfigRegistry(): UseTierConfigRegistryResult {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.vipConfig.registry,
    queryFn: fetchRegistry,
    staleTime: STALE_TIME_DEFAULT,
    // 未登录（无有效 accessToken 或 token 已过期）时不请求 registry。
    // PlanSelectOverlay 全局挂载导致本 hook 在所有页面无条件触发，
    // 未登录时请求会返回 401 并在控制台产生大量 [API Error] 噪音。
    enabled: !isAccessTokenExpired(),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.vipConfig.registry,
    });
  }, [queryClient]);

  return {
    registry: data?.registry ?? new Map(),
    entries: data?.entries ?? [],
    loading: isLoading,
    refresh,
  };
}
