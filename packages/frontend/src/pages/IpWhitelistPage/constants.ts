/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';

/** 管理员 IP 白名单每页条数（与后端 ListIpWhitelistQueryDto 默认一致） */
export const IP_WHITELIST_PAGE_SIZE = 20;

/** 条目来源展示映射（manual=界面添加，file=服务器本地文件兜底） */
export const IP_WHITELIST_SOURCE_META: Record<
  string,
  { label: string }
> = {
  manual: { label: t('手动添加') },
  file: { label: t('本地文件') },
};

/** 本地文件条目 ID 前缀（与后端 FILE_ENTRY_ID_PREFIX 保持一致） */
export const FILE_ENTRY_ID_PREFIX = 'file:';
