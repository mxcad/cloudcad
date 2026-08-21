///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 会员档位字符串（桌面客户端契约）。
 *
 * 由数字等级（vipTier.level）推导，格式 `VIP{level}`：免费用户为 `"VIP0"`，
 * 有效会员为 `"VIP1"`/`"VIP2"`/`"VIP3"...`。不依赖 vipTier.name（显示名，
 * 管理员可自定义，作为契约字段不稳定）。
 * EXE 客户端主判断走 `isVip` 布尔；membershipTier 用于等级展示/细分。
 */
export function membershipTierOf(tierLevel: number): string {
  return `VIP${tierLevel}`;
}
