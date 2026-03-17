///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IL3CacheManager } from '../interfaces/cache-manager.interface';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';

/**
 * L3 缓存条目接口
 */
interface ICacheEntry<T> {
  id: string;
  key: string;
  value: string;
  expiresAt: Date | null;
  lastAccessedAt: Date;
  accessCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * L3 缓存提供者（数据库缓存）
 * 持久化存储，最终数据源，使用 Prisma 查询
 */
@Injectable()
export class L3CacheProvider<T = unknown> implements IL3CacheManager<T> {
  private readonly logger = new Logger(L3CacheProvider.name);
  private defaultTTL = 86400; // 24 小时
  private hits = 0;
  private misses = 0;

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 获取缓存值
   */
  async get<K = T>(key: string): Promise<K | null> {
    try {
      const entry = await this.prisma.cacheEntry.findUnique({
        where: { key },
      });

      if (!entry) {
        this.misses++;
        return null;
      }

      // 检查是否过期
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        await this.delete(key);
        this.misses++;
        return null;
      }

      // 解析并返回值（更新访问信息失败不影响读取）
      this.hits++;

      // 异步更新访问信息（使用 updateMany 避免条目不存在时报错）
      this.prisma.cacheEntry
        .updateMany({
          where: { id: entry.id },
          data: {
            lastAccessedAt: new Date(),
            accessCount: { increment: 1 },
          },
        })
        .catch(() => {
          // 忽略错误
        });

      return JSON.parse(entry.value) as K;
    } catch (error) {
      this.logger.error(`获取 L3 缓存失败: ${key}`, error);
      this.misses++;
      return null;
    }
  }

  /**
   * 设置缓存值
   */
  async set<K = T>(key: string, value: K, ttl?: number | null): Promise<void> {
    try {
      const effectiveTTL = ttl ?? this.defaultTTL;
      const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;

      const valueStr = JSON.stringify(value);

      // 使用 upsert 更新或创建缓存
      await this.prisma.cacheEntry.upsert({
        where: { key },
        update: {
          value: valueStr,
          expiresAt,
          lastAccessedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          key,
          value: valueStr,
          expiresAt,
          lastAccessedAt: new Date(),
          accessCount: 0,
        },
      });
    } catch (error) {
      this.logger.error(`设置 L3 缓存失败: ${key}`, error);
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    try {
      // 使用 deleteMany 代替 delete，避免条目不存在时报错
      await this.prisma.cacheEntry.deleteMany({
        where: { key },
      });
    } catch (error) {
      this.logger.error(`删除 L3 缓存失败: ${key}`, error);
    }
  }

  /**
   * 批量删除缓存
   */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    try {
      await this.prisma.cacheEntry.deleteMany({
        where: {
          key: { in: keys },
        },
      });
    } catch (error) {
      this.logger.error('批量删除 L3 缓存失败', error);
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      await this.prisma.cacheEntry.deleteMany({});
      this.hits = 0;
      this.misses = 0;
    } catch (error) {
      this.logger.error('清空 L3 缓存失败', error);
    }
  }

  /**
   * 检查缓存是否存在
   */
  async has(key: string): Promise<boolean> {
    try {
      const entry = await this.prisma.cacheEntry.findUnique({
        where: { key },
      });

      if (!entry) {
        return false;
      }

      // 检查是否过期
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        await this.delete(key);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`检查 L3 缓存存在失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 获取缓存大小
   */
  async size(): Promise<number> {
    try {
      return await this.prisma.cacheEntry.count();
    } catch (error) {
      this.logger.error('获取 L3 缓存大小失败', error);
      return 0;
    }
  }

  /**
   * 从数据库加载数据
   */
  async load<K = T>(key: string, loader: () => Promise<K>): Promise<K> {
    // 先尝试从缓存获取
    const cached = await this.get<K>(key);
    if (cached !== null) {
      return cached;
    }

    // 缓存未命中，从数据源加载
    const value = await loader();

    // 写入缓存
    await this.set(key, value);

    return value;
  }

  /**
   * 预加载数据
   */
  async preload<K = T>(
    keys: string[],
    loader: (key: string) => Promise<K>
  ): Promise<Map<string, K>> {
    const result = new Map<string, K>();

    // 批量检查缓存
    const cachedEntries = await this.prisma.cacheEntry.findMany({
      where: {
        key: { in: keys },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    // 返回已缓存的数据
    const cachedKeys = new Set<string>();
    for (const entry of cachedEntries) {
      try {
        const value = JSON.parse(entry.value) as K;
        result.set(entry.key, value);
        cachedKeys.add(entry.key);

        // 更新访问信息（使用 updateMany 避免报错）
        await this.prisma.cacheEntry.updateMany({
          where: { id: entry.id },
          data: {
            lastAccessedAt: new Date(),
            accessCount: { increment: 1 },
          },
        });
      } catch (error) {
        this.logger.error(`解析 L3 缓存失败: ${entry.key}`, error);
      }
    }

    // 加载未缓存的数据
    const uncachedKeys = keys.filter((key) => !cachedKeys.has(key));
    for (const key of uncachedKeys) {
      try {
        const value = await loader(key);
        result.set(key, value);
        await this.set(key, value);
      } catch (error) {
        this.logger.error(`预加载 L3 缓存失败: ${key}`, error);
      }
    }

    return result;
  }

  /**
   * 获取缓存级别
   */
  getLevel(): CacheLevel {
    return CacheLevel.L3;
  }

  /**
   * 获取缓存策略
   */
  getStrategy(): CacheStrategy {
    return CacheStrategy.LRU;
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    const size = await this.size();
    return {
      level: this.getLevel(),
      size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      totalRequests: this.hits + this.misses,
      memoryUsage: await this.getMemoryUsage(),
    };
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
   * 获取内存使用量（字节）
   */
  private async getMemoryUsage(): Promise<number> {
    try {
      const entries = await this.prisma.cacheEntry.findMany({
        select: { value: true },
      });

      let totalSize = 0;
      for (const entry of entries) {
        totalSize += entry.value.length * 2; // UTF-16 编码，每个字符 2 字节
      }

      return totalSize;
    } catch (error) {
      this.logger.error('获取 L3 缓存内存使用量失败', error);
      return 0;
    }
  }

  /**
   * 清理过期缓存
   */
  async cleanExpired(): Promise<number> {
    try {
      const result = await this.prisma.cacheEntry.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        this.logger.debug(`清理了 ${result.count} 条过期 L3 缓存`);
      }

      return result.count;
    } catch (error) {
      this.logger.error('清理过期 L3 缓存失败', error);
      return 0;
    }
  }

  /**
   * 获取热点数据
   */
  async getHotData(
    limit: number = 100
  ): Promise<
    Array<{ key: string; accessCount: number; lastAccessedAt: Date }>
  > {
    try {
      const entries = await this.prisma.cacheEntry.findMany({
        orderBy: { accessCount: 'desc' },
        take: limit,
        select: {
          key: true,
          accessCount: true,
          lastAccessedAt: true,
        },
      });

      return entries;
    } catch (error) {
      this.logger.error('获取 L3 热点数据失败', error);
      return [];
    }
  }
}
