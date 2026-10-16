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
 * CORS 允许源解析（纯函数，便于回归测试）。
 *
 * 生产环境：FRONTEND_URL 恒在允许列表内，CORS_ORIGINS 是**追加**的公网域名
 * 白名单、不整体接管。部署脚本用 FRONTEND_URL 声明前端实际地址（离线部署 =
 * http://localhost:8000）；若 CORS_ORIGINS 一设就替换它，本机前端会被静默拦截
 * ——预检拿到 204 却没有 Access-Control-Allow-Origin，浏览器丢弃请求、后端零
 * 错误日志，前端只报 TypeError: Failed to fetch。
 *
 * 非生产环境：额外放行本地开发端口，不受 CORS_ORIGINS 影响。
 */

/** 非生产环境额外放行的本地前端地址 */
const DEV_LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:8000'];

/** FRONTEND_URL 未配置时的回退地址 */
const DEFAULT_FRONTEND_URL = 'http://localhost:8000';

/**
 * 计算 CORS 允许源列表。
 *
 * @param nodeEnv 运行环境（'production' 走白名单模式，其余走本地开发模式）
 * @param frontendUrl FRONTEND_URL，前端实际地址
 * @param corsOriginsEnv CORS_ORIGINS，逗号分隔的额外白名单（生产环境追加）
 */
export function resolveCorsOrigins(
  nodeEnv: string,
  frontendUrl: string,
  corsOriginsEnv?: string
): string[] {
  const frontendOrigin = (frontendUrl || DEFAULT_FRONTEND_URL).trim();
  const origins =
    nodeEnv === 'production'
      ? [frontendOrigin, ...(corsOriginsEnv ?? '').split(',')]
      : [frontendOrigin, ...DEV_LOCAL_ORIGINS];

  return Array.from(
    new Set(
      origins.map((origin) => origin.trim()).filter((origin) => origin !== '')
    )
  );
}
