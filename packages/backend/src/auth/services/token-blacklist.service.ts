import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly redis: Redis;
  private readonly blacklistPrefix = 'token:blacklist:';
  private readonly defaultTTL = 7 * 24 * 60 * 60; // 7天

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      db: this.configService.get<number>('REDIS_DB', 0),
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

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
      this.logger.error('添加Token到黑名单失败:', error);
      throw error;
    }
  }

  /**
   * 检查Token是否在黑名单中
   * @param token JWT Token
   * @returns 是否在黑名单中
   */
  async isBlacklisted(token: string): Promise<boolean> {
    try {
      const key = this.blacklistPrefix + token;
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error('检查Token黑名单失败:', error);
      // 如果Redis不可用，为了安全起见，返回true
      return true;
    }
  }

  /**
   * 将用户的所有Token添加到黑名单
   * @param userId 用户ID
   */
  async blacklistUserTokens(userId: string): Promise<void> {
    try {
      // 这个方法需要配合JWT ID才能实现
      // 目前先记录日志，后续可以通过JWT payload中的jti实现
      this.logger.log(`用户 ${userId} 的所有Token将被加入黑名单`);

      // 可以通过Redis的SCAN命令查找该用户的所有Token
      // 或者维护一个用户黑名单列表
      const userBlacklistKey = `user:blacklist:${userId}`;
      await this.redis.setex(userBlacklistKey, this.defaultTTL, '1');
    } catch (error) {
      this.logger.error('黑名单用户Token失败:', error);
      throw error;
    }
  }

  /**
   * 检查用户是否在黑名单中
   * @param userId 用户ID
   * @returns 是否在黑名单中
   */
  async isUserBlacklisted(userId: string): Promise<boolean> {
    try {
      const key = `user:blacklist:${userId}`;
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error('检查用户黑名单失败:', error);
      return true;
    }
  }

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
   * 清理过期的黑名单条目
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const pattern = this.blacklistPrefix + '*';
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        // Redis的EXPIRE会自动清理过期键，这里只是记录统计信息
        this.logger.log(`当前黑名单中有 ${keys.length} 个Token`);
      }
    } catch (error) {
      this.logger.error('清理过期Token失败:', error);
    }
  }

  /**
   * 获取黑名单统计信息
   */
  async getBlacklistStats(): Promise<{
    totalTokens: number;
    blacklistedUsers: number;
  }> {
    try {
      const tokenCount = await this.redis.keys(this.blacklistPrefix + '*');
      const userCount = await this.redis.keys('user:blacklist:*');

      return {
        totalTokens: tokenCount.length,
        blacklistedUsers: userCount.length,
      };
    } catch (error) {
      this.logger.error('获取黑名单统计失败:', error);
      return { totalTokens: 0, blacklistedUsers: 0 };
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
