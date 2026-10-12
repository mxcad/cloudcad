import type { InjectionToken } from '@nestjs/common';

/**
 * 配额缓存失效 seam（ADR-0020 接口 + DI token）。
 *
 * MembershipService（vip，@Global）在配额变更（activate）后必须失效配额缓存，
 * 但缓存在 StorageInfoService（file-system）中，后者反过来依赖 MembershipService——
 * 直接依赖成环，故收敛到本 token：vip 侧 @Optional() 注入（未接线缓存的模块
 * 降级为 no-op），file-system 侧 useExisting 绑定实现。
 * 多实例拓扑可换第二个 adapter（Redis 广播），使失效不限于本实例 Map
 * （告警模块即按多实例拓扑设计）。
 */
export interface QuotaCacheInvalidator {
  /** 失效指定用户的个人存储配额缓存（缓存键仅用户维度，不涉及项目维度） */
  invalidateQuotaCache(userId: string): Promise<void>;
}

/** 配额缓存失效注入令牌（@Optional()，未接线时降级 no-op） */
export const IQuotaCacheInvalidator: InjectionToken =
  Symbol('IQuotaCacheInvalidator');
