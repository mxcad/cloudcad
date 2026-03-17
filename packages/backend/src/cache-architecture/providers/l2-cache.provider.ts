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
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import type { AppConfig } from '../../config/app.config';
import { IL2CacheManager } from '../interfaces/cache-manager.interface';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';

/**
 * L2 缓存提供者（Redis 缓存）
 * 分布式缓存，TTL 30 分钟，支持批量操作
 */
@Injectable()
export class L2CacheProvider<T = unknown>
  implements IL2CacheManager<T>, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(L2CacheProvider.name);
  private client: RedisClientType;
  private isConnected = false;
  private defaultTTL = 1800; // 30 分钟
  private hits = 0;
  private misses = 0;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const redisConfig = this.configService.get('redis', { infer: true })!;
    this.client = createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: redisConfig.connectTimeout,
      },
      password: redisConfig.password,
      database: redisConfig.db,
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis 错误: ${err.message}`);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      this.logger.log('Redis 连接成功');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      this.logger.warn('Redis 连接断开');
      this.isConnected = false;
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      this.logger.error('Redis 连接失败', error);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.isConnected = false;
  }

  /**
   * 获取缓存值
   */
  async get<K = T>(key: string): Promise<K | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis 未连接，跳过 L2 缓存读取');
      this.misses++;
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) {
        this.misses++;
        return null;
      }

      this.hits++;
      return JSON.parse(value as string) as K;
    } catch (error) {
      this.logger.error(`获取 L2 缓存失败: ${key}`, error);
      this.misses++;
      return null;
    }
  }

  /**
   * 设置缓存值
   */
  async set<K = T>(key: string, value: K, ttl?: number | null): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Redis 未连接，跳过 L2 缓存写入');
      return;
    }

    try {
      const effectiveTTL = ttl ?? this.defaultTTL;
      await this.client.setEx(key, effectiveTTL, JSON.stringify(value));
    } catch (error) {
      this.logger.error(`设置 L2 缓存失败: ${key}`, error);
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`删除 L2 缓存失败: ${key}`, error);
    }
  }

  /**
   * 批量删除缓存
   */
  async deleteMany(keys: string[]): Promise<void> {
    if (!this.isConnected || keys.length === 0) {
      return;
    }

    try {
      await this.client.del(keys);
    } catch (error) {
      this.logger.error(`批量删除 L2 缓存失败`, error);
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.flushDb();
      this.hits = 0;
      this.misses = 0;
    } catch (error) {
      this.logger.error('清空 L2 缓存失败', error);
    }
  }

  /**
   * 检查缓存是否存在
   */
  async has(key: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`检查 L2 缓存存在失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 获取缓存大小
   */
  async size(): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      return await this.client.dbSize();
    } catch (error) {
      this.logger.error('获取 L2 缓存大小失败', error);
      return 0;
    }
  }

  /**
   * 批量获取缓存
   */
  async getMany<K = T>(keys: string[]): Promise<Map<string, K>> {
    const result = new Map<string, K>();

    if (!this.isConnected || keys.length === 0) {
      return result;
    }

    try {
      const values = await this.client.mGet(keys);

      for (let i = 0; i < keys.length; i++) {
        const value = values[i];
        if (
          value !== null &&
          value !== undefined &&
          typeof value === 'string'
        ) {
          result.set(keys[i]!, JSON.parse(value) as K);
          this.hits++;
        } else {
          this.misses++;
        }
      }
    } catch (error) {
      this.logger.error('批量获取 L2 缓存失败', error);
      for (const key of keys) {
        this.misses++;
      }
    }

    return result;
  }

  /**
   * 批量设置缓存
   */
  async setMany<K = T>(items: Map<string, K>, ttl?: number): Promise<void> {
    if (!this.isConnected || items.size === 0) {
      return;
    }

    try {
      const effectiveTTL = ttl ?? this.defaultTTL;
      const pipeline = this.client.multi();

      for (const [key, value] of items.entries()) {
        pipeline.setEx(key, effectiveTTL, JSON.stringify(value));
      }

      await pipeline.exec();
    } catch (error) {
      this.logger.error('批量设置 L2 缓存失败', error);
    }
  }

  /**
   * 设置过期时间
   */
  async expire(key: string, ttl: number): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.expire(key, ttl);
    } catch (error) {
      this.logger.error(`设置 L2 缓存过期时间失败: ${key}`, error);
    }
  }

  /**
   * 获取剩余过期时间（秒）
   */
  async ttl(key: string): Promise<number> {
    if (!this.isConnected) {
      return -1;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error(`获取 L2 缓存 TTL 失败: ${key}`, error);
      return -1;
    }
  }

  /**
   * 根据模式删除缓存
   */
  async deleteByPattern(pattern: string): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const keys: string[] = [];
      for await (const key of this.client.scanIterator({
        MATCH: pattern,
      })) {
        // scanIterator 返回的键类型是 string，但 TypeScript 推断可能有问题
        keys.push(String(key));
      }

      if (keys.length > 0) {
        // Redis 的 del 方法支持数组形式
        // 使用 any 来避免 TypeScript 类型检查问题
        await (
          this.client.del as unknown as (keys: string[]) => Promise<number>
        )(keys);
        this.logger.debug(
          `根据模式删除了 ${keys.length} 条 L2 缓存: ${pattern}`
        );
      }

      return keys.length;
    } catch (error) {
      this.logger.error(`根据模式删除 L2 缓存失败: ${pattern}`, error);
      return 0;
    }
  }

  /**
   * 获取缓存级别
   */
  getLevel(): CacheLevel {
    return CacheLevel.L2;
  }

  /**
   * 获取缓存策略
   */
  getStrategy(): CacheStrategy {
    return CacheStrategy.TTL;
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    return {
      level: this.getLevel(),
      size: await this.size(),
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      totalRequests: this.hits + this.misses,
      memoryUsage: await this.getMemoryUsage(),
      isConnected: this.isConnected,
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
   * 获取内存使用量
   */
  private async getMemoryUsage(): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const info = await this.client.info('memory');
      const match = info?.match(/used_memory:(\d+)/);
      return match && match[1] ? parseInt(match[1], 10) : 0;
    } catch (error) {
      this.logger.error('获取 Redis 内存使用量失败', error);
      return 0;
    }
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.isConnected;
  }
}
