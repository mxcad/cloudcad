///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';

/** IP 黑名单每页条数（前端默认值，前端恒显式传 pageSize） */
export const IP_BLACKLIST_PAGE_SIZE = 30;

/** 条目来源展示文案（函数式取值：模块级 t() 会在 en-US pack 未就绪时烘焙成中文） */
export function getIpBlacklistSourceLabel(source: string): string | undefined {
  switch (source) {
    case 'manual':
      return t('手动添加');
    default:
      return undefined;
  }
}
