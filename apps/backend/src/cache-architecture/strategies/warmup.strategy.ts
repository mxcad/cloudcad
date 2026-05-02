///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 缓存预热结果接口
 */
export interface WarmupResult {
  /** 是否成功 */
  success: boolean;
  /** 预热数据数量 */
  count: number;
  /** 耗时（毫秒） */
  duration: number;
  /** 错误信息（可选） */
  error?: string;
}

/**
 * 缓存预热策略接口
 * 所有预热策略必须实现此接口
 */
export interface IWarmupStrategy {
  /** 策略名称（唯一标识） */
  readonly name: string;

  /**
   * 执行预热
   * @returns 预热结果
   */
  warmup(): Promise<WarmupResult>;
}
