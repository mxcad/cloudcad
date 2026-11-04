/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { t } from '@/languages';

export const SECURITY_ATTEMPT_PAGE_SIZE = 20;

/** 拒绝原因 -> 前端展示文案（后端枚举值为 key）
 * 函数式取值：模块级 t() 会在 en-US pack 未就绪时烘焙成中文且切语言后不刷新 */
export function getSecurityAttemptReasonMeta(
  reason: string,
): { label: string; variant: 'error' | 'warning' | 'neutral' | 'info' } | undefined {
  switch (reason) {
    case 'ip_not_allowed':
      return { label: t('IP 不在白名单'), variant: 'error' };
    case 'blacklisted':
      return { label: t('IP 被拉黑'), variant: 'error' };
    case 'user_not_found':
      return { label: t('账号不存在'), variant: 'warning' };
    case 'account_unavailable':
      return { label: t('账号不可用'), variant: 'warning' };
    case 'not_admin':
      return { label: t('非管理员账号'), variant: 'warning' };
    case 'bad_password':
      return { label: t('密码错误'), variant: 'warning' };
    default:
      return undefined;
  }
}
