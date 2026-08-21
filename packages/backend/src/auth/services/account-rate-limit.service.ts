import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { I18nContext } from 'nestjs-i18n';
import type { AppConfig, AuthRateLimitConfig } from '../../config/app.config';

/**
 * 账号维度限流动作
 */
export type AccountRateLimitAction = 'login' | 'password_reset' | 'register';

interface AccountLimitConfig {
  max: number;
  windowSeconds: number;
}

/**
 * 账号维度限流服务（防撞库 / 暴力破解 / 验证码轰炸）
 *
 * 与 RateLimitGuard（IP 维度）互补：按「邮箱 / 手机号 / 用户名」维度计数。
 * 使用 Redis INCR + EXPIRE 实现滑动窗口计数（窗口从首次请求开始计算）。
 *
 * 参数通过环境变量配置（configuration.ts → authRateLimit 段）：
 * - login：登录尝试（默认 5 次 / 60 秒 / 账号）
 * - password_reset：密码找回（默认 5 次 / 3600 秒 / 账号）
 * - register：注册（默认 5 次 / 3600 秒 / 账号）
 *
 * 说明：验证码发送（1 次 / 60 秒 / 账号）已由 EmailVerificationService /
 * SmsVerificationService 的 per-identifier 限流覆盖，无需重复实现。
 *
 * 熔断策略：Redis 故障时 fail-open（放行），保证认证服务可用性优先。
 */
@Injectable()
export class AccountRateLimitService {
  private readonly logger = new Logger(AccountRateLimitService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: ConfigService<AppConfig>,
  ) {}

  private getConfig(action: AccountRateLimitAction): AccountLimitConfig {
    const authRateLimit = this.configService.get<AuthRateLimitConfig>('authRateLimit', { infer: true }) ?? ({} as AuthRateLimitConfig);
    switch (action) {
      case 'login':
        return {
          max: authRateLimit.loginMax ?? 5,
          windowSeconds: authRateLimit.loginWindowSeconds ?? 60,
        };
      case 'password_reset':
        return {
          max: authRateLimit.passwordResetMax ?? 5,
          windowSeconds: authRateLimit.passwordResetWindowSeconds ?? 3600,
        };
      case 'register':
        return {
          max: authRateLimit.registerMax ?? 5,
          windowSeconds: authRateLimit.registerWindowSeconds ?? 3600,
        };
    }
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
  }

  private buildKey(action: AccountRateLimitAction, identifier: string): string {
    return `account-rate-limit:${action}:${this.normalizeIdentifier(identifier)}`;
  }

  /**
   * 计数并检查是否超过限流阈值。
   * 超过阈值时抛出 429（Too Many Requests），未超过则正常返回。
   */
  async checkLimit(action: AccountRateLimitAction, identifier: string): Promise<void> {
    if (!identifier) return;

    const { max, windowSeconds } = this.getConfig(action);
    // max <= 0 表示禁用该维度的限流
    if (max <= 0 || windowSeconds <= 0) return;

    const key = this.buildKey(action, identifier);

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      }

      if (count > max) {
        this.logger.warn(
          `账号维度限流触发: action=${action}, identifier=${this.normalizeIdentifier(identifier)}, count=${count}, max=${max}, window=${windowSeconds}s`,
        );
        throw new HttpException(
          I18nContext.current()?.t('error.rate_limit.too_many_requests') ?? '请求过于频繁，请稍后再试',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Redis 故障时 fail-open，避免限流导致认证服务不可用
      this.logger.error(
        `账号维度限流检查失败（fail-open）: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 重置某账号在某动作上的计数（例如登录成功后清空失败计数）。
   */
  async reset(action: AccountRateLimitAction, identifier: string): Promise<void> {
    if (!identifier) return;

    try {
      await this.redis.del(this.buildKey(action, identifier));
    } catch (error) {
      this.logger.error(
        `账号维度限流重置失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
