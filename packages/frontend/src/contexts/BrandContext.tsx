import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchBrandConfig,
  getBrandProfile,
  type BrandConfig,
  type BrandProfile,
} from '../constants/appConfig';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME_DEFAULT } from '@/constants/timeouts';

interface BrandContextValue {
  config: BrandConfig | null;
  profile: BrandProfile;
  loading: boolean;
}

const BrandContext = createContext<BrandContextValue>({
  config: null,
  profile: getBrandProfile(),
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

  // 数据就绪前用内置默认值先渲染，就绪后按 config.json 求值；
  // memo 化避免每次渲染新建对象导致消费方 effect 反复重跑
  const profile = useMemo(() => getBrandProfile(data ?? null), [data]);

  return (
    <BrandContext.Provider
      value={{ config: data ?? null, profile, loading: isLoading }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrandConfig() {
  return useContext(BrandContext);
}

export { type BrandConfig };
