///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 认证检查工具函数
 *
 * 用于在非 React 组件环境中检查用户登录状态
 * 例如：MxCAD 命令回调、事件监听器等
 */

/**
 * 检查用户是否已登录
 * @returns boolean 是否已登录
 */
export function isAuthenticated(): boolean {
  try {
    const token = localStorage.getItem('accessToken');
    const user = localStorage.getItem('user');
    return !!(token && user);
  } catch {
    return false;
  }
}

/**
 * 获取当前登录用户的 ID
 * @returns 用户 ID，未登录返回 null
 */
export function getCurrentUserId(): string | null {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    return user?.id || null;
  } catch {
    return null;
  }
}

/**
 * 获取当前登录用户的信息
 * @returns 用户信息对象，未登录返回 null
 */
export function getCurrentUser(): { id: string; email?: string; username?: string } | null {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    if (!user?.id) return null;
    return {
      id: user.id,
      email: user?.email,
      username: user?.username,
    };
  } catch {
    return null;
  }
}

/**
 * 获取认证 Token
 * @returns Token 字符串，未登录返回 null
 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('accessToken');
  } catch {
    return null;
  }
}

/**
 * 检查登录状态，如果未登录则触发指定回调
 * @param onNotLoggedIn 未登录时的回调函数
 * @param action 触发登录的操作描述（用于日志记录）
 * @returns 是否已登录
 */
export function checkAuth(
  onNotLoggedIn: () => void,
  action: string = '此操作'
): boolean {
  if (isAuthenticated()) {
    return true;
  }

  console.log(`[authCheck] 用户未登录，尝试执行：${action}`);
  onNotLoggedIn();
  return false;
}

/**
 * 清除认证信息（用于退出登录）
 * 清理所有与认证相关的本地存储
 */
export function clearAuthData(): void {
  try {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    console.log('[authCheck] 认证信息已清除');
  } catch (error) {
    console.error('[authCheck] 清除认证信息失败:', error);
  }
}
