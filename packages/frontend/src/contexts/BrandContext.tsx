import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchBrandConfig,
  getBrandProfile,
  mergeBrandOverrides,
  setRuntimeBrandConfig,
  type BrandConfig,
  type BrandProfile,
} from '../constants/appConfig';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME_DEFAULT } from '@/constants/timeouts';
import { useRuntimeConfig } from './RuntimeConfigContext';

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

  // 运行时品牌配置（管理端可改）优先级最高，叠在 config.json 之上
  const { config: runtimeConfig } = useRuntimeConfig();

  const effectiveConfig = useMemo(() => {
    const merged = mergeBrandOverrides(
      data ?? null,
      runtimeConfig.brandProfile,
      // 客服邮箱/电话以 supportEmail / supportPhone 运行时项为准，
      // 高于 brandProfile.support，避免客服邮箱出现双事实源
      {
        email: runtimeConfig.supportEmail,
        phone: runtimeConfig.supportPhone,
      }
    );
    // 同步进模块级缓存，让 getAppBrandConfig / getAppName 等
    // 不走 context 的消费者（标题、版权行、法务正文）也能读到运行时品牌
    setRuntimeBrandConfig(runtimeConfig.brandProfile);
    return merged;
  }, [data, runtimeConfig]);

  // 数据就绪前用内置默认值先渲染，就绪后按 config.json + 运行时覆盖求值；
  // memo 化避免每次渲染新建对象导致消费方 effect 反复重跑
  const profile = useMemo(
    () => getBrandProfile(effectiveConfig),
    [effectiveConfig]
  );

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
