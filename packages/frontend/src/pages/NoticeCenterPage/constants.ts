///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import type { TagVariant } from '@/components/ui/Tag';
import type { NoticeStatus } from './types';

/** 列表后台刷新间隔：让「生效中 → 已过期」在界面里自行翻转 */
export const NOTICE_LIST_REFRESH_MS = 60_000;

/** 与后端 CreateNoticeDto 的校验上限保持一致 */
export const NOTICE_TITLE_MAX = 200;
export const NOTICE_BODY_MAX = 4000;

/** 与后端 NOTICE_KINDS / NOTICE_LEVELS 白名单保持一致 */
export const NOTICE_KINDS = ['system', 'download'] as const;
export const NOTICE_LEVELS = ['info', 'warning', 'danger'] as const;

export type NoticeKind = (typeof NOTICE_KINDS)[number];
export type NoticeLevel = (typeof NOTICE_LEVELS)[number];

/** 中文原文作 key，渲染时统一走 t() */
export const NOTICE_KIND_LABELS: Record<string, string> = {
  system: '系统公告',
  download: '下载公告',
};

export const NOTICE_LEVEL_LABELS: Record<string, string> = {
  info: '普通',
  warning: '警告',
  danger: '紧急',
};

export const NOTICE_STATUS_LABELS: Record<NoticeStatus, string> = {
  active: '生效中',
  pending: '待生效',
  expired: '已过期',
  draft: '草稿',
  retracted: '已下线',
};

export const NOTICE_LEVEL_TAG_VARIANTS: Record<string, TagVariant> = {
  info: 'info',
  warning: 'warning',
  danger: 'error',
};

export const NOTICE_STATUS_TAG_VARIANTS: Record<NoticeStatus, TagVariant> = {
  active: 'success',
  pending: 'info',
  expired: 'neutral',
  draft: 'neutral',
  retracted: 'error',
};
