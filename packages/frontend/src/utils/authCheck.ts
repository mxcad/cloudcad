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
import { isValidToken, getValidToken } from './tokenUtils';

export function isAuthenticated(): boolean {
  try {
    const token = getValidToken();
    const user = localStorage.getItem('user');
    return isValidToken(token) && !!user;
  } catch {
    return false;
  }
}

