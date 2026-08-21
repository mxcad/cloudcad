/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////

/**
 * 管理员登录入口配置
 *
 * 管理员登录地址通过环境变量 VITE_ADMIN_LOGIN_PATH 配置，
 * 默认 /admin-login。建议生产环境改为复杂难记的路径（防猜测攻击），例如：
 *   VITE_ADMIN_LOGIN_PATH=/u7x9k2-admin-secure-login
 *
 * 普通登录页不暴露管理员入口；只有知道该路径的人才能访问管理员登录。
 */
const DEFAULT_ADMIN_LOGIN_PATH = '/admin-login';

/** 管理员登录入口路径（需以 / 开头） */
export const ADMIN_LOGIN_PATH: string = (() => {
  const raw = import.meta.env.VITE_ADMIN_LOGIN_PATH as string | undefined;
  if (!raw) return DEFAULT_ADMIN_LOGIN_PATH;
  const trimmed = raw.trim();
  // 规范化：必须以 / 开头，去掉尾斜杠（除根路径外）
  if (!trimmed.startsWith('/')) return DEFAULT_ADMIN_LOGIN_PATH;
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : '/';
})();
