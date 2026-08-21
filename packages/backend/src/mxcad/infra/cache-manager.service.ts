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
import { ConfigService } from '@nestjs/config';

export interface CacheItem<T> {
  data: T;
  timestamp: number;
}

@Injectable()
export class CacheManagerService {
  private readonly logger = new Logger(CacheManagerService.name);
  private readonly caches: Map<string, Map<string, CacheItem<any>>> = new Map();
  private readonly defaultTTL: number;

  constructor(private readonly configService: ConfigService) {
    const cacheTTL = this.configService.get('cacheTTL', { infer: true });
    this.defaultTTL = cacheTTL.mxcad * 1000; // 转为毫秒
  }

  /**
   * 获取缓存值
   * @param cacheName 缓存名称
   * @param key 缓存键
   * @param ttl 过期时间（毫秒），可选
   * @returns 缓存值或null
   */
  get<T>(cacheName: string, key: string, ttl?: number): T | null {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return null;
    }

    const item = cache.get(key);
    if (!item) {
      return null;
    }

    const now = Date.now();
    const actualTTL = ttl || this.defaultTTL;

    if (now - item.timestamp >= actualTTL) {
      cache.delete(key);
      this.logger.debug(`缓存过期已清理: ${cacheName}:${key}`);
      return null;
    }

    this.logger.debug(`缓存命中: ${cacheName}:${key}`);
    return item.data;
  }

  /**
   * 设置缓存值
   * @param cacheName 缓存名称
   * @param key 缓存键
   * @param value 缓存值
   */
  set<T>(cacheName: string, key: string, value: T): void {
    if (!this.caches.has(cacheName)) {
      this.caches.set(cacheName, new Map());
    }

    const cache = this.caches.get(cacheName)!;
    cache.set(key, {
      data: value,
      timestamp: Date.now(),
    });

    this.logger.debug(`缓存设置: ${cacheName}:${key}`);
  }

  /**
   * 删除缓存值
   * @param cacheName 缓存名称
   * @param key 缓存键
   * @returns 是否删除成功
   */
  delete(cacheName: string, key: string): boolean {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return false;
    }

    const deleted = cache.delete(key);
    if (deleted) {
      this.logger.debug(`缓存删除: ${cacheName}:${key}`);
    }

    return deleted;
  }

  /**
   * 清理过期缓存
   * @param cacheName 缓存名称，可选
   * @param ttl 过期时间（毫秒），可选
   */
  cleanExpired(cacheName?: string, ttl?: number): void {
    const now = Date.now();
    const actualTTL = ttl || this.defaultTTL;

    if (cacheName) {
      this.cleanCacheExpired(cacheName, now, actualTTL);
    } else {
      for (const [name] of this.caches) {
        this.cleanCacheExpired(name, now, actualTTL);
      }
    }
  }

  /**
   * 清空指定缓存
   * @param cacheName 缓存名称
   */
  clear(cacheName: string): void {
    const cache = this.caches.get(cacheName);
    if (cache) {
      cache.clear();
      this.logger.debug(`缓存清空: ${cacheName}`);
    }
  }

  /**
   * 清空所有缓存
   */
  clearAll(): void {
    this.caches.clear();
    this.logger.debug('所有缓存已清空');
  }

  /**
   * 获取缓存统计信息
   * @param cacheName 缓存名称，可选
   * @returns 缓存统计信息
   */
  getStats(cacheName?: string): Record<string, number> {
    const stats: Record<string, number> = {};

    if (cacheName) {
      const cache = this.caches.get(cacheName);
      stats[cacheName] = cache ? cache.size : 0;
    } else {
      for (const [name, cache] of this.caches) {
        stats[name] = cache.size;
      }
    }

    return stats;
  }

  private cleanCacheExpired(cacheName: string, now: number, ttl: number): void {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return;
    }

    let cleanedCount = 0;
    for (const [key, item] of cache) {
      if (now - item.timestamp >= ttl) {
        cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`缓存 ${cacheName} 清理过期项目: ${cleanedCount} 个`);
    }
  }
}
