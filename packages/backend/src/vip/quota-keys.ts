/**
 * 配额 key 单一来源（ADR-0036）。
 * 原散落于 RestrictionEngine.STRATEGY_KEYS、各 strategy 的 const KEY、
 * storage-info / user-crud 裸字符串，统一收敛于此。
 */
export const QUOTA_KEYS = {
  PROJECT_SIZE: 'quota.project_size_mb',
  PERSONAL_STORAGE: 'quota.personal_storage_mb',
  CONVERSION_WINDOW_COUNT: 'quota.conversion_window_count',
  CONVERSION_WINDOW_HOURS: 'quota.conversion_window_hours',
  // 转 bin（覆盖保存）频率窗口次数：与转 mxweb 的频率限制相互独立，窗口小时数复用
  // conversion_window_hours（运营改一处窗口，两套次数同步生效）。
  SAVE_WINDOW_COUNT: 'quota.save_window_count',
  // 历史版本查看（bin→mxweb 转换）频率窗口次数：与保存/转换相互独立，窗口小时数复用
  // conversion_window_hours（运营改一处窗口，各套次数同步生效）。
  HISTORY_WINDOW_COUNT: 'quota.history_window_count',
  MAX_PROJECTS: 'quota.max_projects',
} as const;

export type QuotaKey = (typeof QUOTA_KEYS)[keyof typeof QUOTA_KEYS];
