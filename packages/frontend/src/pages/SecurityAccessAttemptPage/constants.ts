/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';

export const SECURITY_ATTEMPT_PAGE_SIZE = 20;

/** 拒绝原因 -> 前端展示文案（后端枚举值为 key） */
export const SECURITY_ATTEMPT_REASON_META: Record<
  string,
  { label: string; variant: 'error' | 'warning' | 'neutral' | 'info' }
> = {
  ip_not_allowed: { label: t('IP 不在白名单'), variant: 'error' },
  blacklisted: { label: t('IP 被拉黑'), variant: 'error' },
  user_not_found: { label: t('账号不存在'), variant: 'warning' },
  account_unavailable: { label: t('账号不可用'), variant: 'warning' },
  not_admin: { label: t('非管理员账号'), variant: 'warning' },
  bad_password: { label: t('密码错误'), variant: 'warning' },
};
