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

import { Injectable, Logger } from '@nestjs/common';
import { IL1CacheManager } from '../interfaces/cache-manager.interface';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';

/**
 * L1 缓存条目接口
 */
interface ICacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

/**
 * L1 缓存提供者（内存缓存）
 * 使用 LRU 策略，最大容量 1000 条，TTL 5 分钟
 */
@Injectable()
export class L1CacheProvider<T = unknown> implements IL1CacheManager<T> {
  private readonly logger = new Logger(L1CacheProvider.name);
  private readonly cache = new Map<string, ICacheEntry<T>>();
  private maxCapacity = 1000;
  private defaultTTL = 300; // 5 分钟
  private hits = 0;
  private misses = 0;

  constructor() {
    // 定期清理过期缓存（每分钟执行一次）
    setInterval(() => this.cleanExpired(), 60000);
  }

  /**
   * 获取缓存值
   */
  async get<K = T>(key: string): Promise<K | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // 更新访问信息（LRU 策略）
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    this.hits++;

    // 重新插入以更新访问顺序
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value as unknown as K;
  }

  /**
   * 设置缓存值
   */
  async set<K = T>(key: string, value: K, ttl?: number | null): Promise<void> {
    const effectiveTTL = ttl ?? this.defaultTTL;
    const entry: ICacheEntry<K> = {
      value,
      expiresAt: Date.now() + effectiveTTL * 1000,
      lastAccessedAt: Date.now(),
      accessCount: 0,
    };

    // 如果缓存已满，执行 LRU 淘汰
    if (this.cache.size >= this.maxCapacity && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, entry as unknown as ICacheEntry<T>);
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * 批量删除缓存
   */
  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.cache.delete(key);
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 检查缓存是否存在
   */
  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    return Date.now() <= entry.expiresAt;
  }

  /**
   * 获取缓存大小
   */
  async size(): Promise<number> {
    return this.cache.size;
  }

  /**
   * 获取缓存级别
   */
  getLevel(): CacheLevel {
    return CacheLevel.L1;
  }

  /**
   * 获取缓存策略
   */
  getStrategy(): CacheStrategy {
    return CacheStrategy.LRU_TTL;
  }

  /**
   * 设置最大缓存容量
   */
  setMaxCapacity(capacity: number): void {
    if (capacity < 1) {
      throw new Error('容量必须大于 0');
    }
    this.maxCapacity = capacity;

    // 如果当前大小超过新容量，执行淘汰
    while (this.cache.size > this.maxCapacity) {
      this.evictLRU();
    }
  }

  /**
   * 获取当前缓存容量
   */
  getCurrentCapacity(): number {
    return this.cache.size;
  }

  /**
   * 获取缓存命中率
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    if (total === 0) {
      return 0;
    }
    return (this.hits / total) * 100;
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      level: this.getLevel(),
      size: this.cache.size,
      maxCapacity: this.maxCapacity,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      totalRequests: this.hits + this.misses,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * 清理过期缓存
   */
  private cleanExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`清理了 ${cleaned} 条过期 L1 缓存`);
    }
  }

  /**
   * 执行 LRU 淘汰
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Number.MAX_VALUE;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug(`LRU 淘汰缓存键: ${oldestKey}`);
    }
  }

  /**
   * 估算内存使用量（字节）
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      // 估算字符串大小（UTF-16 编码，每个字符 2 字节）
      totalSize += key.length * 2;

      // 估算值大小（JSON 字符串）
      const valueStr = JSON.stringify(entry.value);
      totalSize += valueStr.length * 2;

      // 元数据大小
      totalSize += 24; // timestamp (8) * 3 + count (8)
    }

    return totalSize;
  }
}
