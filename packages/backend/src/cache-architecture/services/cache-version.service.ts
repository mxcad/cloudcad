///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

/**
 * 缓存版本类型
 */
export enum CacheVersionType {
  USER_PERMISSIONS = 'user_permissions',
  USER_ROLE = 'user_role',
  PROJECT_PERMISSIONS = 'project_permissions',
  PROJECT_MEMBERS = 'project_members',
  ROLE_PERMISSIONS = 'role_permissions',
  SYSTEM_CONFIG = 'system_config',
}

/**
 * 缓存版本信息
 */
interface CacheVersionInfo {
  /** 版本号 */
  version: string;
  /** 更新时间戳 */
  updatedAt: number;
  /** 版本描述 */
  description?: string;
}

/**
 * 缓存版本管理服务
 *
 * 功能：
 * 1. 为不同类型的缓存数据维护版本号
 * 2. 通过版本号确保缓存一致性
 * 3. 支持版本升级和回滚
 * 4. 防止使用过期数据
 */
@Injectable()
export class CacheVersionService implements OnModuleInit {
  private readonly logger = new Logger(CacheVersionService.name);
  private readonly VERSION_PREFIX = 'cache:version:';
  private readonly VERSION_LOCK_PREFIX = 'cache:version:lock:';
  private readonly defaultTTL: number;
  private readonly distributedLockTTL: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis
  ) {
    const cacheTTL = this.configService.get('cacheTTL', { infer: true });
    const timeout = this.configService.get('timeout', { infer: true });
    this.defaultTTL = cacheTTL.cacheVersion;
    this.distributedLockTTL = Math.floor(timeout.distributedLock / 1000); // 转为秒
  }

  async onModuleInit() {
    this.logger.log('缓存版本管理服务已初始化');
  }

  /**
   * 获取指定类型的缓存版本
   *
   * @param type 缓存类型
   * @param key 可选的缓存键（用于特定数据的版本控制）
   * @returns 版本信息
   */
  async getVersion(
    type: CacheVersionType,
    key?: string
  ): Promise<CacheVersionInfo | null> {
    try {
      const versionKey = this.getVersionKey(type, key);
      const data = await this.redis.get(versionKey);

      if (!data) {
        return null;
      }

      const info: CacheVersionInfo = JSON.parse(data);
      return info;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `获取缓存版本失败: ${type}, ${key || 'global'} - ${message}`,
        stack
      );
      return null;
    }
  }

  /**
   * 创建新的缓存版本
   *
   * @param type 缓存类型
   * @param key 可选的缓存键
   * @param description 版本描述
   * @returns 新版本号
   */
  async createVersion(
    type: CacheVersionType,
    key?: string,
    description?: string
  ): Promise<string> {
    try {
      // 获取分布式锁，防止并发创建版本
      const lockKey = this.getVersionLockKey(type, key);
      const lock = await this.acquireLock(lockKey, this.distributedLockTTL * 1000); // 使用配置的锁 TTL

      if (!lock) {
        // 如果获取锁失败，重试获取现有版本
        const existing = await this.getVersion(type, key);
        if (existing) {
          return existing.version;
        }
      }

      try {
        // 生成新版本号（时间戳 + 随机数）
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const version = `v${timestamp}_${random}`;

        const info: CacheVersionInfo = {
          version,
          updatedAt: timestamp,
          description,
        };

        // 保存版本信息
        const versionKey = this.getVersionKey(type, key);
        await this.redis.setex(
          versionKey,
          this.defaultTTL,
          JSON.stringify(info)
        );

        this.logger.debug(
          `创建缓存版本: ${type}, ${key || 'global'} -> ${version}`
        );

        return version;
      } finally {
        if (lock) {
          await this.releaseLock(lockKey, lock);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `创建缓存版本失败: ${type}, ${key || 'global'} - ${message}`,
        stack
      );
      throw error;
    }
  }

  /**
   * 更新缓存版本（创建新版本）
   *
   * @param type 缓存类型
   * @param key 可选的缓存键
   * @param description 版本描述
   * @returns 新版本号
   */
  async updateVersion(
    type: CacheVersionType,
    key?: string,
    description?: string
  ): Promise<string> {
    return this.createVersion(type, key, description);
  }

  /**
   * 删除缓存版本
   *
   * @param type 缓存类型
   * @param key 可选的缓存键
   */
  async deleteVersion(type: CacheVersionType, key?: string): Promise<void> {
    try {
      const versionKey = this.getVersionKey(type, key);
      await this.redis.del(versionKey);

      this.logger.debug(`删除缓存版本: ${type}, ${key || 'global'}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `删除缓存版本失败: ${type}, ${key || 'global'} - ${message}`,
        stack
      );
    }
  }

  /**
   * 批量删除缓存版本
   *
   * @param type 缓存类型
   * @param keys 缓存键列表
   */
  async deleteVersions(type: CacheVersionType, keys: string[]): Promise<void> {
    try {
      const promises = keys.map((key) => this.deleteVersion(type, key));
      await Promise.all(promises);

      this.logger.debug(`批量删除缓存版本: ${type}, ${keys.length} 个`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `批量删除缓存版本失败: ${type} - ${message}`,
        stack
      );
    }
  }

  /**
   * 检查缓存版本是否过期
   *
   * @param type 缓存类型
   * @param key 可选的缓存键
   * @param maxAge 最大有效时间（毫秒）
   * @returns 是否过期
   */
  async isVersionExpired(
    type: CacheVersionType,
    key?: string,
    maxAge: number = 5 * 60 * 1000 // 默认 5 分钟
  ): Promise<boolean> {
    try {
      const info = await this.getVersion(type, key);

      if (!info) {
        return true; // 没有版本信息视为过期
      }

      const age = Date.now() - info.updatedAt;
      return age > maxAge;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `检查缓存版本过期失败: ${type}, ${key || 'global'} - ${message}`,
        stack
      );
      return true; // 出错时视为过期
    }
  }

  /**
   * 获取版本化的缓存键
   *
   * @param baseKey 基础缓存键
   * @param type 缓存类型
   * @param key 可选的缓存键
   * @returns 带版本号的缓存键
   */
  async getVersionedKey(
    baseKey: string,
    type: CacheVersionType,
    key?: string
  ): Promise<string> {
    const info = await this.getVersion(type, key);

    if (!info) {
      // 如果没有版本信息，创建一个新版本
      const version = await this.createVersion(type, key, 'Auto-created');
      return `${baseKey}:${version}`;
    }

    return `${baseKey}:${info.version}`;
  }

  /**
   * 验证缓存键的版本是否有效
   *
   * @param versionedKey 带版本号的缓存键
   * @param type 缓存类型
   * @param key 可选的缓存键
   * @returns 是否有效
   */
  async validateKey(
    versionedKey: string,
    type: CacheVersionType,
    key?: string
  ): Promise<boolean> {
    try {
      const info = await this.getVersion(type, key);

      if (!info) {
        return false;
      }

      // 检查版本是否匹配
      return versionedKey.endsWith(`:${info.version}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `验证缓存键版本失败: ${versionedKey} - ${message}`,
        stack
      );
      return false;
    }
  }

  /**
   * 获取所有版本信息（用于调试）
   *
   * @param type 缓存类型
   * @returns 版本信息列表
   */
  async getAllVersions(type: CacheVersionType): Promise<
    Array<{
      key: string;
      version: string;
      updatedAt: number;
    }>
  > {
    try {
      const pattern = `${this.VERSION_PREFIX}${type}:*`;
      const keys = await this.redis.keys(pattern);

      const versions: Array<{
        key: string;
        version: string;
        updatedAt: number;
      }> = [];
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const info: CacheVersionInfo = JSON.parse(data);
          const cacheKey = key.replace(this.VERSION_PREFIX, '');
          versions.push({
            key: cacheKey,
            version: info.version,
            updatedAt: info.updatedAt,
          });
        }
      }

      return versions;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `获取所有版本信息失败: ${type} - ${message}`,
        stack
      );
      return [];
    }
  }

  /**
   * 清理过期版本
   *
   * @param type 缓存类型
   * @param maxAge 最大有效时间（毫秒）
   * @returns 清理的版本数量
   */
  async cleanupExpiredVersions(
    type: CacheVersionType,
    maxAge: number = 60 * 60 * 1000 // 默认 1 小时
  ): Promise<number> {
    try {
      const versions = await this.getAllVersions(type);
      const now = Date.now();
      let cleaned = 0;

      for (const version of versions) {
        if (now - version.updatedAt > maxAge) {
          await this.deleteVersion(type, version.key);
          cleaned++;
        }
      }

      this.logger.debug(`清理过期版本: ${type}, 清理了 ${cleaned} 个`);
      return cleaned;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `清理过期版本失败: ${type} - ${message}`,
        stack
      );
      return 0;
    }
  }

  /**
   * 生成版本键
   */
  private getVersionKey(type: CacheVersionType, key?: string): string {
    if (key) {
      return `${this.VERSION_PREFIX}${type}:${key}`;
    }
    return `${this.VERSION_PREFIX}${type}:global`;
  }

  /**
   * 生成版本锁键
   */
  private getVersionLockKey(type: CacheVersionType, key?: string): string {
    if (key) {
      return `${this.VERSION_LOCK_PREFIX}${type}:${key}`;
    }
    return `${this.VERSION_LOCK_PREFIX}${type}:global`;
  }

  /**
   * 获取分布式锁
   */
  private async acquireLock(
    lockKey: string,
    ttl: number = 5000
  ): Promise<string | null> {
    const lockValue = `${process.pid}:${Date.now()}:${Math.random()}`;
    const result = await this.redis.set(lockKey, lockValue, 'PX', ttl, 'NX');
    return result === 'OK' ? lockValue : null;
  }

  /**
   * 释放分布式锁
   */
  private async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, lockKey, lockValue);
  }
}
