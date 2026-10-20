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

import {
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { PatternDeleteResult } from '../interfaces/cache-manager.interface';
import { L1CacheProvider } from '../providers/l1-cache.provider';
import { L2CacheProvider } from '../providers/l2-cache.provider';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheVersionService, CacheVersionType } from './cache-version.service';

/**
 * 缓存 TTL 上限（秒）。
 *
 * 超过此值几乎可以肯定是单位搞错——本仓库 TTL 统一按秒（L1 内部 *1000 换算、
 * L2 走 Redis SET EX）。历史上 CACHE_TTL 误写成毫秒，权限缓存实际存活 1000 倍，
 * 见 Gitea #468。这里把「单位再错一次」从静默 bug 变成日志可见。
 */
const MAX_CACHE_TTL_SECONDS = 86_400; // 24 小时

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
 * 统一管理 L1、L2 两级缓存
 */
@Injectable()
export class MultiLevelCacheService {
  private readonly logger = new Logger(MultiLevelCacheService.name);

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
   * 查询顺序：L1 → L2
   * 自动回填：L2 → L1
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
      // 回填 L1：沿用 L2 剩余 TTL，避免 L1 用自身默认 TTL 而比 L2 条目存活更久
      // （写入侧对 L1/L2 用同一随机化 TTL，但回填若走 L1 默认值会造成两级 TTL 漂移）
      const l2Ttl = await this.l2Cache.ttl(versionedKey);
      await this.l1Cache.set(versionedKey, l2Value, l2Ttl > 0 ? l2Ttl : null);
      return l2Value;
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
    ]);

    this.logger.debug(`批量删除缓存: ${keys.length} 条`);
  }

  /**
   * 根据模式删除缓存（所有级别）
   */
  async deleteByPattern(pattern: string): Promise<PatternDeleteResult> {
    const [l1Result, l2Result] = await Promise.all([
      this.l1Cache.deleteByPattern(pattern),
      this.l2Cache.deleteByPattern(pattern),
    ]);

    const truncated = l1Result.truncated || l2Result.truncated;
    this.logger.debug(
      `根据模式删除缓存: ${pattern}, L1: ${l1Result.deleted}, ` +
        `L2: ${l2Result.deleted}, 截断: ${truncated}`
    );
    return { deleted: l1Result.deleted + l2Result.deleted, truncated };
  }

  /**
   * 清空所有缓存（所有级别）
   *
   * ⚠️ 只有 L1 真的被清空。L2 的 clear 只重置命中统计、不删条目——
   * 全仓没有任何 FLUSHDB，Redis 条目一律走 TTL 自然过期。
   * 日志与 controller 文案都必须如实说明，否则会误导运维判断（#481）。
   */
  async clear(): Promise<void> {
    await Promise.all([
      this.l1Cache.clear(),
      this.l2Cache.clear(),
    ]);

    this.logger.debug('L1 缓存已清空；L2 仅重置统计，条目保留至自然过期');
  }

  /**
   * 清理指定级别缓存（L1 或 L2）。
   * 此前 controller 对 L1/L2 级别落到「需要实现」注释后直接返回 success:true（伪成功），
   * 补上真实入口使分级清理生效。
   */
  async clearLevel(level: 'L1' | 'L2'): Promise<void> {
    if (level === 'L1') {
      await this.l1Cache.clear();
    } else {
      await this.l2Cache.clear();
    }
    this.logger.debug(`${level} 缓存已清空`);
  }

  /**
   * 检查缓存是否存在
   */
  async has(key: string): Promise<boolean> {
    // 检查任意一级缓存存在即可
    const results = await Promise.all([
      this.l1Cache.has(key),
      this.l2Cache.has(key),
    ]);

    return results.some((result) => result);
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    const [l1Stats, l2Stats] = await Promise.all([
      this.l1Cache.getStats(),
      this.l2Cache.getStats(),
    ]);

    const totalHits = l1Stats.hits + l2Stats.hits;
    const totalMisses = l1Stats.misses + l2Stats.misses;
    const totalRequests = totalHits + totalMisses;

    return {
      levels: {
        L1: l1Stats,
        L2: l2Stats,
      },
      summary: {
        totalHits,
        totalMisses,
        totalRequests,
        overallHitRate:
          totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
        totalMemoryUsage:
          l1Stats.memoryUsage + l2Stats.memoryUsage,
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
      default:
        this.logger.warn(`不支持的缓存级别: ${level}`);
        return null;
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
      default:
        this.logger.warn(`不支持的缓存级别: ${level}`);
    }
  }

  /**
   * 获取有效 TTL（应用缓存雪崩保护）
   */
  private getEffectiveTTL(ttl?: number): number {
    const baseTTL = ttl ?? 300;
    if (baseTTL > MAX_CACHE_TTL_SECONDS) {
      this.logger.warn(
        `缓存 TTL ${baseTTL} 秒超过上限 ${MAX_CACHE_TTL_SECONDS} 秒，` +
          `疑似单位错误（毫秒被当成秒）；默认值为 300 秒`
      );
    }

    if (!this.avalancheConfig.enabled) {
      return baseTTL;
    }

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

}
