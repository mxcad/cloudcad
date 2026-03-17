///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';

/**
 * 缓存管理器接口
 * 定义三级缓存的标准操作
 */
export interface ICacheManager<T = unknown> {
  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 缓存值，如果不存在则返回 null
   */
  get<K = T>(key: string): Promise<K | null>;

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（秒），默认为 null 表示使用默认 TTL
   */
  set<K = T>(key: string, value: K, ttl?: number | null): Promise<void>;

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): Promise<void>;

  /**
   * 批量删除缓存
   * @param keys 缓存键数组
   */
  deleteMany(keys: string[]): Promise<void>;

  /**
   * 清空所有缓存
   */
  clear(): Promise<void>;

  /**
   * 检查缓存是否存在
   * @param key 缓存键
   */
  has(key: string): Promise<boolean>;

  /**
   * 获取缓存大小
   */
  size(): Promise<number>;

  /**
   * 获取缓存级别
   */
  getLevel(): CacheLevel;

  /**
   * 获取缓存策略
   */
  getStrategy(): CacheStrategy;
}

/**
 * L1 缓存管理器接口（内存缓存）
 */
export interface IL1CacheManager<T = unknown> extends ICacheManager<T> {
  /**
   * 设置最大缓存容量
   * @param capacity 最大容量
   */
  setMaxCapacity(capacity: number): void;

  /**
   * 获取当前缓存容量
   */
  getCurrentCapacity(): number;

  /**
   * 获取缓存命中率
   */
  getHitRate(): number;
}

/**
 * L2 缓存管理器接口（Redis 缓存）
 */
export interface IL2CacheManager<T = unknown> extends ICacheManager<T> {
  /**
   * 批量获取缓存
   * @param keys 缓存键数组
   */
  getMany<K = T>(keys: string[]): Promise<Map<string, K>>;

  /**
   * 批量设置缓存
   * @param items 键值对数组
   * @param ttl 过期时间（秒）
   */
  setMany<K = T>(items: Map<string, K>, ttl?: number): Promise<void>;

  /**
   * 设置过期时间
   * @param key 缓存键
   * @param ttl 过期时间（秒）
   */
  expire(key: string, ttl: number): Promise<void>;

  /**
   * 获取剩余过期时间（秒）
   * @param key 缓存键
   */
  ttl(key: string): Promise<number>;

  /**
   * 根据模式删除缓存
   * @param pattern 模式（支持通配符）
   */
  deleteByPattern(pattern: string): Promise<number>;
}

/**
 * L3 缓存管理器接口（数据库缓存）
 */
export interface IL3CacheManager<T = unknown> extends ICacheManager<T> {
  /**
   * 从数据库加载数据
   * @param key 缓存键
   * @param loader 数据加载函数
   */
  load<K = T>(key: string, loader: () => Promise<K>): Promise<K>;

  /**
   * 预加载数据
   * @param keys 缓存键数组
   * @param loader 数据加载函数
   */
  preload<K = T>(
    keys: string[],
    loader: (key: string) => Promise<K>
  ): Promise<Map<string, K>>;
}
