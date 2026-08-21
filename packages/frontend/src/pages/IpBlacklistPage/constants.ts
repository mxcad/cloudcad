///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';

/** IP 黑名单每页条数（与后端 ListIpBlacklistQueryDto 默认一致） */
export const IP_BLACKLIST_PAGE_SIZE = 20;

/** 条目来源展示映射 */
export const IP_BLACKLIST_SOURCE_META: Record<string, { label: string }> = {
  manual: { label: t('手动添加') },
};
