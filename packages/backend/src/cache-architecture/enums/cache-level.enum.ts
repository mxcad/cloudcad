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
 * 缓存级别枚举
 * 定义两级缓存架构的缓存级别
 */
export enum CacheLevel {
  /**
   * L1 缓存 - 内存缓存
   * 特点：
   * - 最快访问速度
   * - 容量最小
   * - TTL 最短（5 分钟）
   * - 单实例独享
   */
  L1 = 'L1',

  /**
   * L2 缓存 - Redis 缓存
   * 特点：
   * - 快速访问
   * - 容量中等
   * - TTL 中等（30 分钟）
   * - 跨实例共享
   */
  L2 = 'L2',
}
