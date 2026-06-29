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

/** Collaboration works polling interval (8s) */
export const POLL_INTERVAL = 8_000;

/** Auto-join safety fallback (15s) — hide loading if collaborative file never loads */
export const AUTO_JOIN_SAFETY_TIMEOUT = 15_000;

/** Auto-join maximum retry count */
export const AUTO_JOIN_MAX_RETRIES = 30;

/** Resource list loading timeout (10s) */
export const LOADING_TIMEOUT = 10_000;
