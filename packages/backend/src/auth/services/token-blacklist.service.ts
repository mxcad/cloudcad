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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import type { ITokenBlacklistService } from '@cloudcad/contracts';

@Injectable()
export class TokenBlacklistService implements OnModuleInit, ITokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly blacklistPrefix = 'token:blacklist:';
  private readonly defaultTTL: number;

  constructor(
    private configService: ConfigService,
    @InjectRedis() private readonly redis: Redis
  ) {
    const cacheTTL = this.configService.get('cacheTTL', { infer: true });
    this.defaultTTL = cacheTTL.tokenBlacklist;
  }

  onModuleInit() {
    this.redis.on('error', (error) => {
      this.logger.error('Redis连接错误:', error);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis连接成功');
    });
  }

  /**
   * 将Token添加到黑名单
   * @param token JWT Token
   * @param expiresIn Token过期时间（秒）
   */
  async addToBlacklist(token: string, expiresIn?: number): Promise<void> {
    try {
      const key = this.blacklistPrefix + token;
      const ttl = expiresIn || this.defaultTTL;

      await this.redis.setex(key, ttl, '1');
      this.logger.log(`Token已添加到黑名单: ${token.substring(0, 20)}...`);
    } catch (error) {
      this.logger.error('添加Token到黑名单失败(Redis):', error);
    }
  }

  /**
   * 检查Token是否在黑名单中
   *
   * 读失败 fail-open（放行），刻意不 fail-closed：写入方是登出 / 改密 / 会话转移三条真实路径，
   * 作用域只有单个 token，放行最多让「一次登出没生效」直到该 token 自然过期，代价远小于拒绝。
   * 它也不承担「用户停用即失效」——那条由 DB 实时判定负责（见下方用户级名单退役注释）。
   * 副作用是 Redis 长时间不可用时吊销会静默失效，故保留 warn 日志便于从日志侧发现。
   *
   * @param token JWT Token
   * @returns 是否在黑名单中
   */
  async isBlacklisted(token: string): Promise<boolean> {
    try {
      const key = this.blacklistPrefix + token;
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.warn('检查Token黑名单失败(Redis), 降级: 放行令牌:', error);
      return false;
    }
  }

  // 用户级名单（user:blacklist:<userId>）已整体退役，只保留 token 级名单。
  // 退役原因（Gitea #484）：写入方恒为空，而读侧挂在四处鉴权热路径上并 fail-closed——
  // 它唯一可能被触发的情况就是 Redis 异常，效果是「Redis 一抖，全平台用户收到
  // 用户已被禁用」。而它想表达的「用户停用/删除即失效」已由 DB 实时判定负责
  // （deletedAt: null + status !== 'ACTIVE'，同一个 error.auth.user_disabled 文案）。
  // 另外写入方即使接线也不是令牌吊销：它写的是 user:blacklist:<userId> 一个 7 天标记，
  // 效果是把该用户登录/刷新/协同三条入口硬锁 7 天，不是撤销其已有 token。

  /**
   * 从黑名单中移除Token
   * @param token JWT Token
   */
  async removeFromBlacklist(token: string): Promise<void> {
    try {
      const key = this.blacklistPrefix + token;
      await this.redis.del(key);
      this.logger.log(`Token已从黑名单移除: ${token.substring(0, 20)}...`);
    } catch (error) {
      this.logger.error('从黑名单移除Token失败:', error);
      throw error;
    }
  }

  /**
   * 获取黑名单统计信息
   */
  async getBlacklistStats(): Promise<{ totalTokens: number }> {
    try {
      const tokenCount = await this.scanKeys(this.blacklistPrefix + '*');

      return { totalTokens: tokenCount.length };
    } catch (error) {
      this.logger.error('获取黑名单统计失败:', error);
      return { totalTokens: 0 };
    }
  }

  /**
   * 存储临时数据
   * @param key 键名
   * @param value 值
   * @param ttl 过期时间（秒）
   */
  async setTempData(key: string, value: string, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, ttl, value);
      this.logger.log(`临时数据已存储: ${key}`);
    } catch (error) {
      this.logger.error('存储临时数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取临时数据
   * @param key 键名
   */
  async getTempData(key: string): Promise<string | null> {
    try {
      const result = await this.redis.get(key);
      return result;
    } catch (error) {
      this.logger.error('获取临时数据失败:', error);
      return null;
    }
  }

  /**
   * 删除临时数据
   * @param key 键名
   */
  async deleteTempData(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.log(`临时数据已删除: ${key}`);
    } catch (error) {
      this.logger.error('删除临时数据失败:', error);
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * 使用 SCAN 游标迭代查找匹配的键，避免 KEYS 阻塞 Redis
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
      );
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');
    return keys;
  }
}
