/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

import { ADMIN_LOGIN_PATH } from '@/constants/adminLoginConfig';

/**
 * 全局转换队列面板（悬浮按钮 + 展开面板）不渲染的公开路由。
 *
 * 面板承载上传 / 转换 / 下载语义，只对「需登录的后台页 + CAD 编辑器」有意义；
 * 登录、注册、找回密码、隐私政策、用户协议、设备授权等公开页渲染面板属于噪音，
 * 还会白白触发无登录态的云端任务拉取与 SSE 订阅。
 *
 * 新增公开路由时必须同步登记，否则面板会在该页重新出现。
 */
const HIDDEN_PATHS: readonly string[] = [
  '/login',
  ADMIN_LOGIN_PATH,
  // 桌面端 EXE OAuth 回调（复用 Login 页渲染）
  '/logo',
  '/register',
  '/verify-email',
  '/verify-phone',
  '/forgot-password',
  '/reset-password',
  '/device',
  '/session-transfer',
  '/privacy',
  '/terms',
];

/**
 * 该路径是否应渲染全局转换队列面板。
 *
 * CAD 编辑器（`/` 与 `/cad-editor*`，公开访问、可游客使用）与所有需登录的
 * 后台页 → 显示；其余公开页（认证 / 合规 / 设备授权）→ 不显示。
 */
export function isConversionPanelRoute(
  pathname: string = window.location.pathname
): boolean {
  return !HIDDEN_PATHS.includes(pathname);
}
