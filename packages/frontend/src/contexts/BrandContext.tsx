import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBrandConfig, type BrandConfig } from '../constants/appConfig';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME_DEFAULT } from '@/constants/timeouts';

interface BrandContextValue {
  config: BrandConfig | null;
  loading: boolean;
}

const BrandContext = createContext<BrandContextValue>({
  config: null,
  loading: true,
});

export function BrandProvider({ children }: { children: ReactNode }) {
  // server 配置（/brand/config.json）统一走 react-query（ADR-0030）
  // AppInitializer 已通过 fetchQuery 预取并缓存，queryFn 命中缓存直接返回
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.brand.config,
    queryFn: fetchBrandConfig,
    staleTime: STALE_TIME_DEFAULT,
  });

  return (
    <BrandContext.Provider value={{ config: data ?? null, loading: isLoading }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrandConfig() {
  return useContext(BrandContext);
}

export { type BrandConfig };
