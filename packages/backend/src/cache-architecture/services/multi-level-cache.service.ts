///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  Optional,
  InternalServerErrorException,
} from '@nestjs/common';
import { L1CacheProvider } from '../providers/l1-cache.provider';
import { L2CacheProvider } from '../providers/l2-cache.provider';
import { L3CacheProvider } from '../providers/l3-cache.provider';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheVersionService, CacheVersionType } from './cache-version.service';

/**
 * 缓存穿透配置
 */
interface CachePenetrationConfig {
  /**
   * 是否启用缓存穿透保护
   */
  enabled: boolean;

  /**
   * 空值缓存 TTL（秒）
   */
  nullTTL: number;

  /**
   * 布隆过滤器大小
   */
  bloomSize: number;
}

/**
 * 缓存雪崩配置
 */
interface CacheAvalancheConfig {
  /**
   * 是否启用缓存雪崩保护
   */
  enabled: boolean;

  /**
   * TTL 随机化范围（秒）
   */
  randomizationRange: number;
}

/**
 * 缓存版本配置
 */
interface CacheVersionConfig {
  /**
   * 是否启用版本控制
   */
  enabled: boolean;

  /**
   * 版本类型
   */
  type?: CacheVersionType;

  /**
   * 版本键（用于特定数据的版本控制）
   */
  versionKey?: string;
}

/**
 * 多级缓存服务
 * 统一管理 L1、L2、L3 三级缓存
 */
@Injectable()
export class MultiLevelCacheService {
  private readonly logger = new Logger(MultiLevelCacheService.name);

  private readonly penetrationConfig: CachePenetrationConfig = {
    enabled: true,
    nullTTL: 60, // 1 分钟
    bloomSize: 1000000,
  };

  private readonly avalancheConfig: CacheAvalancheConfig = {
    enabled: true,
    randomizationRange: 300, // 5 分钟
  };

  private readonly versionConfig: CacheVersionConfig = {
    enabled: false, // 默认不启用版本控制，需要显式配置
  };

  constructor(
    private readonly l1Cache: L1CacheProvider,
    private readonly l2Cache: L2CacheProvider,
    private readonly l3Cache: L3CacheProvider,
    @Optional() private readonly cacheVersionService?: CacheVersionService
  ) {}

  /**
   * 启用版本控制
   */
  enableVersionControl(type: CacheVersionType, versionKey?: string): void {
    this.versionConfig.enabled = true;
    this.versionConfig.type = type;
    this.versionConfig.versionKey = versionKey;
    this.logger.debug(`启用版本控制: ${type}, ${versionKey || 'global'}`);
  }

  /**
   * 禁用版本控制
   */
  disableVersionControl(): void {
    this.versionConfig.enabled = false;
    this.versionConfig.type = undefined;
    this.versionConfig.versionKey = undefined;
    this.logger.debug('禁用版本控制');
  }

  /**
   * 获取版本化的缓存键
   */
  private async getVersionedKey(baseKey: string): Promise<string> {
    if (!this.versionConfig.enabled || !this.cacheVersionService) {
      return baseKey;
    }

    try {
      return await this.cacheVersionService.getVersionedKey(
        baseKey,
        this.versionConfig.type!,
        this.versionConfig.versionKey
      );
    } catch (error) {
      this.logger.error(`获取版本化缓存键失败: ${error.message}`);
      // 出错时返回原始键，确保服务可用性
      return baseKey;
    }
  }

  /**
   * 更新缓存版本
   */
  async updateVersion(description?: string): Promise<string | null> {
    if (!this.versionConfig.enabled || !this.cacheVersionService) {
      return null;
    }

    try {
      return await this.cacheVersionService.updateVersion(
        this.versionConfig.type!,
        this.versionConfig.versionKey,
        description
      );
    } catch (error) {
      this.logger.error(`更新缓存版本失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取缓存值（多级查询）
   * 查询顺序：L1 → L2 → L3
   * 自动回填：L3 → L2 → L1
   */
  async get<T>(key: string): Promise<T | null> {
    // 获取版本化的缓存键
    const versionedKey = await this.getVersionedKey(key);

    // L1 查询
    const l1Value = await this.l1Cache.get<T>(versionedKey);
    if (l1Value !== null) {
      this.logger.debug(`L1 缓存命中: ${key}`);
      return l1Value;
    }

    // L2 查询
    const l2Value = await this.l2Cache.get<T>(versionedKey);
    if (l2Value !== null) {
      this.logger.debug(`L2 缓存命中: ${key}`);
      // 回填 L1
      await this.l1Cache.set(versionedKey, l2Value);
      return l2Value;
    }

    // L3 查询
    const l3Value = await this.l3Cache.get<T>(versionedKey);
    if (l3Value !== null) {
      this.logger.debug(`L3 缓存命中: ${key}`);
      // 回填 L2 和 L1
      await this.l2Cache.set(versionedKey, l3Value);
      await this.l1Cache.set(versionedKey, l3Value);
      return l3Value;
    }

    this.logger.debug(`缓存未命中: ${key}`);
    return null;
  }

  /**
   * 获取或加载缓存值
   * 如果缓存不存在，从数据源加载并写入所有级别
   */
  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    // 先尝试从缓存获取
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 缓存未命中，从数据源加载
    const value = await loader();

    // 写入所有级别
    await this.set(key, value);

    return value;
  }

  /**
   * 批量获取缓存值
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    const missedKeys: string[] = [];

    // L1 批量查询
    for (const key of keys) {
      const value = await this.l1Cache.get<T>(key);
      if (value !== null) {
        result.set(key, value);
      } else {
        missedKeys.push(key);
      }
    }

    if (missedKeys.length === 0) {
      return result;
    }

    // L2 批量查询
    const l2Values = await this.l2Cache.getMany<T>(missedKeys);
    for (const [key, value] of l2Values.entries()) {
      result.set(key, value);
      await this.l1Cache.set(key, value);
    }

    const stillMissedKeys = missedKeys.filter((key) => !l2Values.has(key));

    if (stillMissedKeys.length === 0) {
      return result;
    }

    // L3 查询
    for (const key of stillMissedKeys) {
      const value = await this.l3Cache.get<T>(key);
      if (value !== null) {
        result.set(key, value);
        await this.l2Cache.set(key, value);
        await this.l1Cache.set(key, value);
      }
    }

    return result;
  }

  /**
   * 设置缓存值（写入所有级别）
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTTL = this.getEffectiveTTL(ttl);

    // 获取版本化的缓存键
    const versionedKey = await this.getVersionedKey(key);

    // 并行写入所有级别
    await Promise.all([
      this.l1Cache.set(versionedKey, value, effectiveTTL),
      this.l2Cache.set(versionedKey, value, effectiveTTL),
      this.l3Cache.set(versionedKey, value, effectiveTTL),
    ]);

    this.logger.debug(`缓存已设置: ${key}`);
  }

  /**
   * 批量设置缓存值
   */
  async setMany<T>(items: Map<string, T>, ttl?: number): Promise<void> {
    const effectiveTTL = this.getEffectiveTTL(ttl);

    await Promise.all([
      this.setL1Many(items, effectiveTTL),
      this.l2Cache.setMany(items, effectiveTTL),
      this.setL3Many(items, effectiveTTL),
    ]);

    this.logger.debug(`批量设置缓存: ${items.size} 条`);
  }

  /**
   * 删除缓存（所有级别）
   */
  async delete(key: string): Promise<void> {
    // 获取版本化的缓存键
    const versionedKey = await this.getVersionedKey(key);

    await Promise.all([
      this.l1Cache.delete(versionedKey),
      this.l2Cache.delete(versionedKey),
      this.l3Cache.delete(versionedKey),
    ]);

    this.logger.debug(`缓存已删除: ${key}`);
  }

  /**
   * 批量删除缓存（所有级别）
   */
  async deleteMany(keys: string[]): Promise<void> {
    // 批量获取版本化的缓存键
    const versionedKeys = await Promise.all(
      keys.map((key) => this.getVersionedKey(key))
    );

    await Promise.all([
      this.l1Cache.deleteMany(versionedKeys),
      this.l2Cache.deleteMany(versionedKeys),
      this.l3Cache.deleteMany(versionedKeys),
    ]);

    this.logger.debug(`批量删除缓存: ${keys.length} 条`);
  }

  /**
   * 根据模式删除缓存（仅 L2 和 L3）
   */
  async deleteByPattern(pattern: string): Promise<number> {
    const [l2Count, l3Count] = await Promise.all([
      this.l2Cache.deleteByPattern(pattern),
      this.deleteL3ByPattern(pattern),
    ]);

    this.logger.debug(
      `根据模式删除缓存: ${pattern}, L2: ${l2Count}, L3: ${l3Count}`
    );
    return l2Count + l3Count;
  }

  /**
   * 清空所有缓存（所有级别）
   */
  async clear(): Promise<void> {
    await Promise.all([
      this.l1Cache.clear(),
      this.l2Cache.clear(),
      this.l3Cache.clear(),
    ]);

    this.logger.debug('所有缓存已清空');
  }

  /**
   * 检查缓存是否存在
   */
  async has(key: string): Promise<boolean> {
    // 检查任意一级缓存存在即可
    const results = await Promise.all([
      this.l1Cache.has(key),
      this.l2Cache.has(key),
      this.l3Cache.has(key),
    ]);

    return results.some((result) => result);
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    const [l1Stats, l2Stats, l3Stats] = await Promise.all([
      this.l1Cache.getStats(),
      this.l2Cache.getStats(),
      this.l3Cache.getStats(),
    ]);

    const totalHits = l1Stats.hits + l2Stats.hits + l3Stats.hits;
    const totalMisses = l1Stats.misses + l2Stats.misses + l3Stats.misses;
    const totalRequests = totalHits + totalMisses;

    return {
      levels: {
        L1: l1Stats,
        L2: l2Stats,
        L3: l3Stats,
      },
      summary: {
        totalHits,
        totalMisses,
        totalRequests,
        overallHitRate:
          totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
        totalMemoryUsage:
          l1Stats.memoryUsage + l2Stats.memoryUsage + l3Stats.memoryUsage,
      },
    };
  }

  /**
   * 刷新缓存（删除并重新加载）
   */
  async refresh<T>(key: string, loader: () => Promise<T>): Promise<T> {
    await this.delete(key);
    return this.getOrLoad(key, loader);
  }

  /**
   * 仅从指定级别获取缓存
   */
  async getFromLevel<T>(key: string, level: CacheLevel): Promise<T | null> {
    switch (level) {
      case CacheLevel.L1:
        return this.l1Cache.get<T>(key);
      case CacheLevel.L2:
        return this.l2Cache.get<T>(key);
      case CacheLevel.L3:
        return this.l3Cache.get<T>(key);
      default:
        throw new InternalServerErrorException(`不支持的缓存级别: ${level}`);
    }
  }

  /**
   * 仅写入指定级别
   */
  async setToLevel<T>(
    key: string,
    value: T,
    level: CacheLevel,
    ttl?: number
  ): Promise<void> {
    switch (level) {
      case CacheLevel.L1:
        await this.l1Cache.set(key, value, ttl);
        break;
      case CacheLevel.L2:
        await this.l2Cache.set(key, value, ttl);
        break;
      case CacheLevel.L3:
        await this.l3Cache.set(key, value, ttl);
        break;
      default:
        throw new InternalServerErrorException(`不支持的缓存级别: ${level}`);
    }
  }

  /**
   * 获取有效 TTL（应用缓存雪崩保护）
   */
  private getEffectiveTTL(ttl?: number): number {
    if (!this.avalancheConfig.enabled) {
      return ttl ?? 300;
    }

    const baseTTL = ttl ?? 300;
    const randomOffset = Math.floor(
      Math.random() * this.avalancheConfig.randomizationRange
    );
    return baseTTL + randomOffset;
  }

  /**
   * 批量设置 L1 缓存
   */
  private async setL1Many<T>(
    items: Map<string, T>,
    ttl?: number
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [key, value] of items.entries()) {
      promises.push(this.l1Cache.set(key, value, ttl));
    }
    await Promise.all(promises);
  }

  /**
   * 批量设置 L3 缓存
   */
  private async setL3Many<T>(
    items: Map<string, T>,
    ttl?: number
  ): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [key, value] of items.entries()) {
      promises.push(this.l3Cache.set(key, value, ttl));
    }
    await Promise.all(promises);
  }

  /**
   * 根据模式删除 L3 缓存
   */
  private async deleteL3ByPattern(pattern: string): Promise<number> {
    // Prisma 不支持 LIKE 查询，需要获取所有键后过滤
    const allEntries = await this.l3Cache.getHotData(1000000);
    const keysToDelete = allEntries
      .filter((entry) => this.matchPattern(entry.key, pattern))
      .map((entry) => entry.key);

    if (keysToDelete.length > 0) {
      await this.l3Cache.deleteMany(keysToDelete);
    }

    return keysToDelete.length;
  }

  /**
   * 简单的模式匹配
   */
  private matchPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(key);
  }
}
