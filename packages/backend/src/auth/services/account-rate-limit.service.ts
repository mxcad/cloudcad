import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { I18nContext } from 'nestjs-i18n';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import type {
  AppConfig,
  AuthRateLimitConfig,
  AccountLockConfig,
} from '../../config/app.config';

/**
 * 账号维度限流动作
 */
export type AccountRateLimitAction =
  | 'login'
  | 'password_reset'
  | 'register'
  | 'order_create';

interface AccountLimitConfig {
  max: number;
  windowSeconds: number;
}

/** 进程内锁定态（Redis 故障降级通道） */
interface InProcessLockState {
  count: number;
  windowStart: number;
  lockUntil: number;
}

/**
 * 账号维度限流 + 失败锁定服务（防撞库 / 暴力破解 / 验证码轰炸）
 *
 * 与 RateLimitGuard（IP 维度）互补：按「邮箱 / 手机号 / 用户名」维度计数。
 *
 * ## 两层机制（#416 等保 8.1.4.1 c) 防暴力破解）
 *
 * 1. **频率限流**（checkLimit/reset）：Redis INCR + EXPIRE 滑动窗口计数
 *    （窗口从首次请求开始计算）。参数：
 *    - login：登录尝试（默认 5 次 / 60 秒 / 账号）
 *    - password_reset：密码找回（默认 5 次 / 3600 秒 / 账号）
 *    - register：注册（默认 5 次 / 3600 秒 / 账号）
 *    超过阈值抛 429。
 *
 * 2. **失败锁定**（checkAccountLock/recordLoginFailure/clearLoginFailures）：
 *    独立于频率限流（独立 Redis key），管「连续失败暴力破解」——
 *    failThreshold 次失败（windowSeconds 窗口内，从首次失败起算）→ 锁 durationSeconds。
 *    锁期内正确密码也拒绝并告知剩余时间；无手动解锁页，到期自愈。
 *
 * 熔断策略：Redis 故障时 fail-open（放行）保证认证服务可用性优先；
 * 失败锁定额外降级到进程内计数（Map），保证限流仍生效 + WARN 告警。
 *
 * 说明：验证码发送（1 次 / 60 秒 / 账号）已由 EmailVerificationService /
 * SmsVerificationService 的 per-identifier 限流覆盖，无需重复实现。
 */
@Injectable()
export class AccountRateLimitService {
  private readonly logger = new Logger(AccountRateLimitService.name);
  /** 进程内锁定态（Redis 故障降级通道；key=归一化账号） */
  private readonly inProcessLocks = new Map<string, InProcessLockState>();

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: ConfigService<AppConfig>,
    private readonly alertService: AlertService,
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
      case 'order_create':
        return {
          max: authRateLimit.orderCreateMax ?? 10,
          windowSeconds: authRateLimit.orderCreateWindowSeconds ?? 3600,
        };
    }
  }

  private getLockConfig(): AccountLockConfig {
    const accountLock = this.configService.get<AccountLockConfig>('accountLock', { infer: true }) ?? ({} as AccountLockConfig);
    return {
      failThreshold: accountLock.failThreshold ?? 10,
      windowSeconds: accountLock.windowSeconds ?? 900,
      durationSeconds: accountLock.durationSeconds ?? 1800,
    };
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
  }

  /**
   * 账号失败锁定触发时上报 P1 暴力破解告警（#418 入侵信号告警 / #405·#416 挂接点）。
   *
   * 与 Prometheus AuthLoginFailureSpike 规则互补：本告警是「单账号触发锁定」的应用层信号，
   * 指标规则覆盖「多账号/多 IP 分布式慢速爆破」。两者都指向同一入侵面，交叉印证。
   *
   * 去重：AlertService.raise 对同 source+messageKey 的 OPEN 告警刷新而非新建，
   * 故锁定风暴不会刷爆告警表；detail 携带账号与计数供排查。
   * 告警上报失败不阻断登录失败处理本身（catch 吞掉 + WARN）。
   */
  private async raiseBruteForceAlert(
    normalized: string,
    count: number,
    durationSeconds: number,
  ): Promise<void> {
    const minutes = Math.ceil(durationSeconds / 60);
    const message =
      I18nContext.current()?.t('error.security.brute_force_suspected', {
        args: { account: normalized, count, minutes },
      }) ??
      `Account ${normalized} locked after ${count} failures (suspected brute-force)`;
    try {
      await this.alertService.raise({
        source: 'auth',
        messageKey: 'security.brute_force_suspected',
        level: AlertLevel.P1,
        message,
        detail: {
          account: normalized,
          count,
          lockMinutes: minutes,
        },
      });
    } catch (error) {
      this.logger.warn(
        `暴力破解告警上报失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

  // ============================================================
  // #416 失败锁定状态机（独立于 5次/60s 频率限流）
  //
  // Redis key（与频率限流 key 区分）：
  // - account-lock:fail:<account>  失败计数（windowSeconds TTL 滑动窗口）
  // - account-lock:locked:<account> 锁定态（durationSeconds TTL，value=锁定到期时间戳 ms）
  // ============================================================

  private buildFailKey(identifier: string): string {
    return `account-lock:fail:${this.normalizeIdentifier(identifier)}`;
  }

  private buildLockKey(identifier: string): string {
    return `account-lock:locked:${this.normalizeIdentifier(identifier)}`;
  }

  /** 锁期内抛 429（含剩余分钟，i18n 文案） */
  private throwLocked(remainingMs: number): never {
    const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
    this.logger.warn(
      `账号锁定中，剩余 ${remainingMin} 分钟（到期自愈，无手动解锁）`,
    );
    throw new HttpException(
      I18nContext.current()?.t('error.rate_limit.account_locked', {
        args: { minutes: remainingMin },
      }) ?? `账号已锁定，请 ${remainingMin} 分钟后再试`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * 检查账号是否处于锁定态。
   * 锁期内抛 429（含剩余分钟）；未锁定正常返回。
   * Redis 故障时降级进程内判定（fail-open 但保留计数）。
   */
  async checkAccountLock(identifier: string): Promise<void> {
    if (!identifier) return;
    const key = this.buildLockKey(identifier);
    const now = Date.now();

    try {
      const lockValue = await this.redis.get(key);
      if (lockValue) {
        const lockUntil = parseInt(lockValue, 10);
        const remainingMs = lockUntil - now;
        if (remainingMs > 0) {
          this.throwLocked(remainingMs);
        }
        // 锁已过期（TTL 应已清理），忽略
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Redis 故障：降级进程内判定 + WARN
      this.logger.warn(
        `账号锁定检查 Redis 故障，降级进程内判定: ${error instanceof Error ? error.message : String(error)}`,
      );
      const state = this.inProcessLocks.get(
        this.normalizeIdentifier(identifier),
      );
      if (state && state.lockUntil > now) {
        this.throwLocked(state.lockUntil - now);
      }
    }
  }

  /**
   * 记录一次登录失败（密码错误 / TOTP 错码等认证失败）。
   * windowSeconds 窗口内累计 failThreshold 次 → 置锁 durationSeconds。
   * 成功登录时调用 clearLoginFailures 清零。
   * Redis 故障时降级进程内计数。
   */
  async recordLoginFailure(identifier: string): Promise<void> {
    if (!identifier) return;
    const { failThreshold, windowSeconds, durationSeconds } =
      this.getLockConfig();
    // failThreshold <= 0 表示禁用失败锁定
    if (failThreshold <= 0) return;

    const failKey = this.buildFailKey(identifier);
    const lockKey = this.buildLockKey(identifier);
    const now = Date.now();

    try {
      const count = await this.redis.incr(failKey);
      if (count === 1) {
        // 窗口从首次失败起算（滑动窗口）
        await this.redis.expire(failKey, windowSeconds);
      }

      if (count >= failThreshold) {
        const lockUntil = now + durationSeconds * 1000;
        await this.redis.set(lockKey, String(lockUntil), 'EX', durationSeconds);
        this.logger.warn(
          `账号失败锁定触发: identifier=${this.normalizeIdentifier(identifier)}, count=${count}, threshold=${failThreshold}, 锁 ${durationSeconds}s`,
        );
        // #418：锁定触发即疑似暴力破解，上报 P1 告警（不 await 阻断，异常内部吞掉）
        void this.raiseBruteForceAlert(
          this.normalizeIdentifier(identifier),
          count,
          durationSeconds,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Redis 故障：降级进程内计数 + WARN
      this.logger.warn(
        `账号失败计数 Redis 故障，降级进程内计数: ${error instanceof Error ? error.message : String(error)}`,
      );
      const normalized = this.normalizeIdentifier(identifier);
      let state = this.inProcessLocks.get(normalized);
      if (!state || now - state.windowStart > windowSeconds * 1000) {
        state = { count: 0, windowStart: now, lockUntil: 0 };
      }
      state.count += 1;
      if (state.count >= failThreshold) {
        state.lockUntil = now + durationSeconds * 1000;
        this.logger.warn(
          `账号失败锁定触发（进程内降级）: identifier=${normalized}, count=${state.count}, threshold=${failThreshold}`,
        );
        // #418：进程内降级锁定同样上报 P1 告警
        void this.raiseBruteForceAlert(normalized, state.count, durationSeconds);
      }
      this.inProcessLocks.set(normalized, state);
    }
  }

  /**
   * 登录成功：清零失败计数（连续失败链中断）。
   * 锁定态不清除（到期自愈，符合"锁期内正确密码也拒绝"语义）。
   */
  async clearLoginFailures(identifier: string): Promise<void> {
    if (!identifier) return;
    const failKey = this.buildFailKey(identifier);
    const normalized = this.normalizeIdentifier(identifier);

    try {
      await this.redis.del(failKey);
    } catch (error) {
      this.logger.error(
        `账号失败计数清零失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // 同步清进程内计数（保持双通道一致）
    const state = this.inProcessLocks.get(normalized);
    if (state) {
      state.count = 0;
    }
  }
}
