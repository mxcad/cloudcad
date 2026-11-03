///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';

/** IP 黑名单每页条数（前端默认值，前端恒显式传 pageSize） */
export const IP_BLACKLIST_PAGE_SIZE = 30;

/** 条目来源展示映射 */
export const IP_BLACKLIST_SOURCE_META: Record<string, { label: string }> = {
  manual: { label: t('手动添加') },
};
