import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchBrandConfig,
  getBrandProfile,
  mergeBrandOverrides,
  setRuntimeBrandConfig,
  type BrandConfig,
  type BrandProfile,
  type RuntimeBrandConfig,
  type RuntimeBrandFieldOverrides,
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
    // 单项运行时键（外观/客服/文档/版权/法务，声明表见
    // appConfig.BRAND_FIELD_OVERRIDE_PATHS）覆盖品牌档案整块里的同名字段；
    // 合并结果整体作为「运行时层」参与三层合并，品牌运行时配置始终是最高优先级。
    const runtimeBrand: RuntimeBrandConfig = { ...runtimeConfig.brandProfile };
    const runtimeFields: RuntimeBrandFieldOverrides = {
      brandTitle: runtimeConfig.brandTitle,
      brandSubtitle: runtimeConfig.brandSubtitle,
      brandTagline: runtimeConfig.brandTagline,
      brandLogo: runtimeConfig.brandLogo,
      supportEmail: runtimeConfig.supportEmail,
      supportPhone: runtimeConfig.supportPhone,
      supportHours: runtimeConfig.supportHours,
      docsUrl: runtimeConfig.docsUrl,
      brandCopyrightLine: runtimeConfig.brandCopyrightLine,
      brandCopyrightYear: runtimeConfig.brandCopyrightYear,
      brandCopyrightHolder: runtimeConfig.brandCopyrightHolder,
      brandLegalProductName: runtimeConfig.brandLegalProductName,
      brandLegalProductShortName: runtimeConfig.brandLegalProductShortName,
    };
    const merged = mergeBrandOverrides(
      data ?? null,
      runtimeBrand,
      runtimeFields
    );
    // 同步进模块级缓存，让 getAppBrandConfig / getAppName / getBrandProfile 等
    // 不走 context 的消费者（标题、版权行、法务正文）也能读到运行时品牌
    //（含单项键覆盖），两条读取路径结果一致（#499）
    setRuntimeBrandConfig(runtimeBrand, runtimeFields);
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
