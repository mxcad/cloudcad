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

import { SetMetadata } from '@nestjs/common';

/**
 * 端点允许 Prometheus 抓取令牌认证的元数据键（#315）
 */
export const SCRAPE_AUTH_KEY = 'allowsScrapeAuth';

/**
 * 声明端点接受 SCRAPE_TOKEN 抓取令牌认证（Bearer/Basic）
 *
 * 仅影响 JwtStrategyExecutor：凭据与配置的 SCRAPE_TOKEN 匹配时跳过 JWT 校验，
 * 并在 request.isScrapeAuth 打标，由端点级 Guard 决定是否放行（如 MetricsAccessGuard）。
 * 未配置 SCRAPE_TOKEN 时该装饰器无任何效果。
 */
export const ScrapeAuth = () => SetMetadata(SCRAPE_AUTH_KEY, true);
