/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

/** IP 访问控制页内的 Tab 标识 */
export type IpAccessTab = 'blacklist' | 'whitelist' | 'attempts';

/**
 * Tab 声明顺序（即原三个菜单的展示顺序）：
 * IP 黑名单 → 管理员 IP 白名单 → 高危访问尝试
 */
export const IP_ACCESS_TABS: readonly IpAccessTab[] = [
  'blacklist',
  'whitelist',
  'attempts',
];
