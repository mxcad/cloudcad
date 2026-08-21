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

import type { CacheLevel } from '../enums/cache-level.enum';

/**
 * 缓存性能指标接口
 */
export interface ICachePerformanceMetrics {
  /**
   * 平均响应时间（毫秒）
   */
  avgResponseTime: number;

  /**
   * P50 响应时间（毫秒）
   */
  p50ResponseTime: number;

  /**
   * P95 响应时间（毫秒）
   */
  p95ResponseTime: number;

  /**
   * P99 响应时间（毫秒）
   */
  p99ResponseTime: number;

  /**
   * 吞吐量（请求/秒）
   */
  throughput: number;

  /**
   * 错误率（0-100）
   */
  errorRate: number;
}

/**
 * 缓存健康状态接口
 */
export interface ICacheHealthStatus {
  /**
   * 缓存级别
   */
  level: CacheLevel;

  /**
   * 健康状态
   */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * 最后检查时间
   */
  lastCheckTime: Date;

  /**
   * 可用性（0-100）
   */
  availability: number;

  /**
   * 错误信息
   */
  error?: string;
}
