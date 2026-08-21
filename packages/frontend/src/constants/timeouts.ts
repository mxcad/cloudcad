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
 * Application timeout and interval constants.
 *
 * All magic number timeouts, polling intervals, and retry limits
 * MUST reference these constants instead of hardcoded values.
 */

/** React Query default stale time (30s) */
export const STALE_TIME_DEFAULT = 30_000;

/** Brand config initialization timeout (5s) */
export const INIT_TIMEOUT = 5_000;

/** Fetch collaboration works timeout (30s) */
export const FETCH_WORKS_TIMEOUT = 30_000;

/** Collaboration works polling interval (30s) — 协同列表是低实时性展示，8s 轮询会产生过量请求 */
export const POLL_INTERVAL = 30_000;

/** My project ids cache TTL (60s) — 仅用于协同列表「项目协同」分组过滤，无需每次轮询都拉取 */
export const PROJECT_IDS_CACHE_TTL = 60_000;

/** Auto-join safety fallback (15s) — hide loading if collaborative file never loads */
export const AUTO_JOIN_SAFETY_TIMEOUT = 15_000;

/** Auto-join maximum retry count（重试间隔 1s；无效/已关闭的协同链接 5s 内快速失败提示，避免 30s 无反馈卡死） */
export const AUTO_JOIN_MAX_RETRIES = 5;

/** Resource list loading timeout (10s) */
export const LOADING_TIMEOUT = 10_000;

/**
 * Resource list request timeout (20s) — 防止 fetch 挂起导致 loading 永久锁死分页。
 * 配合 react-query 重试：超时 reject → retry 3 次 → 最终 error 解锁交互。
 */
export const REQUEST_TIMEOUT_MS = 20_000;
