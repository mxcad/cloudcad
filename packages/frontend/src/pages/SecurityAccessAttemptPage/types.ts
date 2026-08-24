/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

/** 高危接口访问尝试：按 IP 聚合后的前端展示类型 */
export interface SecurityAccessAttemptAggregate {
  ip: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
  /** 各拒绝原因分布（reason -> 次数） */
  reasons: Record<string, number>;
  /** 最近一次尝试使用的账号（可能为扫描器瞎填） */
  account: string | null;
  /** 最近一次尝试的 User-Agent */
  userAgent: string | null;
  /** 当前是否已在管理员 IP 白名单中 */
  inWhitelist: boolean;
  /** 当前是否已在 IP 黑名单中 */
  inBlacklist: boolean;
}
