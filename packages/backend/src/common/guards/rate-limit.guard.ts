///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { I18nContext } from 'nestjs-i18n';
import { ClsService } from 'nestjs-cls';
import Redis from 'ioredis';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { getClientIp } from '../utils/client-ip';

/**
 * 速率限制配置接口
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * 速率限制 Guard
 *
 * 功能：
 * 1. 对公开接口（@Public）施加严格的速率限制
 * 2. 对认证接口施加中等速率限制
 * 3. 对登录接口施加严格速率限制
 * 4. 使用 Redis 进行分布式限流
 * 5. 基于 IP 进行限流
 * 6. 添加速率限制响应头
 * 7. 可通过装饰器自定义限流规则
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private redis: Redis;

  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
    private readonly configService: ConfigService,
    private readonly runtimeConfig: RuntimeConfigService,
    @Inject('REDIS_CLIENT') redisClient: Redis,
  ) {
    this.redis = redisClient;
  }

  /**
   * 每请求解析限流配置，使运行时配置页的修改即时生效。
   *
   * 取值三层（见 RuntimeConfigService.resolveValue）：运行时配置 > .env（envKey） > 默认值。
   * 五个值并行读取，各命中 Redis 缓存即一次 GET；Redis 故障时 getValue 内部降级直查数据库。
   * 全部读取包在 canActivate 的 try/catch 中，异常仍按既有 fail-open 语义放行。
   */
  private async resolveLimits(): Promise<{
    publicLimit: RateLimitConfig;
    authenticatedLimit: RateLimitConfig;
    loginLimit: RateLimitConfig;
  }> {
    const [windowMs, publicMax, authMax, loginMax, loginWindowMs] =
      await Promise.all([
        this.runtimeConfig.getValue<number>('rateLimitPublicWindowMs', 60000),
        this.runtimeConfig.getValue<number>('rateLimitPublicMax', 100),
        this.runtimeConfig.getValue<number>('rateLimitAuthMax', 300),
        this.runtimeConfig.getValue<number>('rateLimitLoginMax', 30),
        this.runtimeConfig.getValue<number>('rateLimitLoginWindowMs', 15 * 60 * 1000),
      ]);

    return {
      publicLimit: { windowMs, maxRequests: publicMax },
      authenticatedLimit: { windowMs, maxRequests: authMax },
      loginLimit: { windowMs: loginWindowMs, maxRequests: loginMax },
    };
  }

  /**
   * 获取客户端真实 IP
   */
  private getClientIp(request: Request): string {
    // 优先从 CLS 获取（由 ClsMiddleware 设置，其值已走 client-ip 唯一出口）
    const clsIp = this.cls.get<string>('clientIp');
    if (clsIp && clsIp !== 'unknown') {
      return clsIp;
    }

    // 回退到统一 IP 提取（XFF → x-real-ip → socket）
    return getClientIp(request);
  }

  /**
   * 登录爆破面端点（命中严格 IP 配额：rateLimitLoginMax / rateLimitLoginWindowMs）。
   *
   * 只收录「可用少量尝试撞库/暴力破解的认证提交入口」：账号密码登录、手机码登录、
   * 注册、找回密码、验证码校验、微信登录与回调。
   *
   * 刻意排除（各有更合适的防护；共享登录配额会让正常用户被误伤）：
   * - /auth/refresh：token 刷新是高频保活请求。前端有 4 处无节流的触发点
   *   （提前 5 分钟主动刷新、visibilitychange 回前台、打开图纸前 ensureFreshAuthCookie
   *   两处），access token 仅 1 小时，最后 10 分钟窗口内反复切 tab 即可耗光配额
   *   （2026-10-15 实跑：本机部署 3 次正常登出重登即 429）
   * - /auth/send-*、/auth/resend-verification：验证码发送已有 per-identifier 独立限流
   *   （EmailVerificationService / SmsVerificationService，1 次/60 秒/账号）
   * - /auth/wechat/poll-transaction：交易状态轮询，高频正常
   * - /auth/bind-*、/auth/unbind-*、/auth/rebind-*、/auth/verify-bind-*、
   *   /auth/verify-unbind-*、/auth/logout、/auth/profile、/auth/check-field：
   *   需已登录态，非爆破面
   *
   * 用「剥离路由版本前缀后的精确路径」匹配而非 includes：includes 会把
   * /api/v1/admin/auth/login 这类含 /auth/login 子串的路径全算进来（管理员入口本
   * 就该算，但理由不同），也会把 /auth/bind-email-and-login（含登录）与纯
   * /auth/bind-email（已登录绑定）混为一类。
   */
  private static readonly LOGIN_ENDPOINT_PATHS = new Set([
    '/auth/login',
    '/auth/login-phone',
    '/admin/auth/login',
    '/auth/register',
    '/auth/register-phone',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
    '/auth/verify-email-and-register-phone',
    '/auth/verify-phone',
    '/auth/verify-sms-code',
    '/auth/bind-email-and-login',
    '/auth/bind-phone-and-login',
    '/auth/wechat/login',
    '/auth/wechat/callback',
  ]);

  /** 判断是否为登录爆破面端点 */
  private isLoginEndpoint(request: Request): boolean {
    // 剥离路由版本前缀（/api/v1 等），只比对路径本体
    const path = request.path.replace(/^\/api\/v\d+/, '');
    return RateLimitGuard.LOGIN_ENDPOINT_PATHS.has(path);
  }

  /**
   * 检查是否超过速率限制
   */
  private async isRateLimited(
    key: string,
    limitConfig: RateLimitConfig,
  ): Promise<{ limited: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - limitConfig.windowMs;
    const redisKey = `ratelimit:${key}`;

    // 使用 Redis 事务确保原子性
    const multi = this.redis.multi();
    multi.zremrangebyscore(redisKey, 0, windowStart);
    multi.zadd(redisKey, now, `${now}-${Math.random()}`);
    multi.zcard(redisKey);
    multi.expire(redisKey, Math.ceil(limitConfig.windowMs / 1000) + 1);

    const results = await multi.exec();
    const currentCount = results?.[2]?.[1] as number ?? 0;

    const limited = currentCount > limitConfig.maxRequests;
    const remaining = Math.max(0, limitConfig.maxRequests - currentCount);
    const resetTime = now + limitConfig.windowMs;

    return { limited, remaining, resetTime };
  }

  /**
   * 添加速率限制响应头
   */
  private setRateLimitHeaders(
    response: any,
    limit: number,
    remaining: number,
    resetTime: number,
  ): void {
    response.setHeader('X-RateLimit-Limit', limit.toString());
    response.setHeader('X-RateLimit-Remaining', remaining.toString());
    response.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();

    const ip = this.getClientIp(request);

    // 开发环境豁免本地 IP
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'development' && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost')) {
      return true;
    }

    // 检查是否是公开接口
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()]
    );

    // 检查是否为登录端点
    const isLoginEndpoint = this.isLoginEndpoint(request);

    // 选择限流配置（每请求解析，支持运行时热修改）
    const limits = await this.resolveLimits();
    let limitConfig: RateLimitConfig;
    let limitType: string;

    if (isLoginEndpoint) {
      limitConfig = limits.loginLimit;
      limitType = '登录接口';
    } else if (isPublic) {
      limitConfig = limits.publicLimit;
      limitType = '公开接口';
    } else {
      limitConfig = limits.authenticatedLimit;
      limitType = '认证接口';
    }

    const rateLimitKey = `${ip}:${request.method}:${request.path}`;

    try {
      const { limited, remaining, resetTime } = await this.isRateLimited(
        rateLimitKey,
        limitConfig,
      );

      // 设置速率限制响应头
      this.setRateLimitHeaders(response, limitConfig.maxRequests, remaining, resetTime);

      if (limited) {
        this.logger.warn(
          `IP ${ip} 超过速率限制 (${limitType}: ${request.method} ${request.path})`
        );
        throw new HttpException(
          I18nContext.current()?.t('error.rate_limit.too_many_requests') ?? '请求过于频繁，请稍后再试',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`速率限制检查失败: ${error.message}`, error.stack);
      // 发生错误时允许请求通过（fail-open），避免因 Redis 故障导致服务不可用
      return true;
    }
  }
}