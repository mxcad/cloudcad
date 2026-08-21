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

  private readonly publicLimit: RateLimitConfig;
  private readonly authenticatedLimit: RateLimitConfig;
  private readonly loginLimit: RateLimitConfig;

  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') redisClient: Redis,
  ) {
    this.redis = redisClient;

    // 从环境变量读取配置，提供默认值
    const windowMs = this.configService.get<number>('RATE_LIMIT_WINDOW_MS', 60000);
    const publicMax = this.configService.get<number>('RATE_LIMIT_PUBLIC_MAX', 100);
    const authMax = this.configService.get<number>('RATE_LIMIT_AUTH_MAX', 300);
    const loginMax = this.configService.get<number>('RATE_LIMIT_LOGIN_MAX', 5);
    const loginWindowMs = this.configService.get<number>('RATE_LIMIT_LOGIN_WINDOW_MS', 15 * 60 * 1000);

    this.publicLimit = { windowMs, maxRequests: publicMax };
    this.authenticatedLimit = { windowMs, maxRequests: authMax };
    this.loginLimit = { windowMs: loginWindowMs, maxRequests: loginMax };
  }

  /**
   * 获取客户端真实 IP
   */
  private getClientIp(request: Request): string {
    // 优先从 CLS 获取（由 ClsMiddleware 设置）
    const clsIp = this.cls.get<string>('clientIp');
    if (clsIp && clsIp !== 'unknown') {
      return clsIp;
    }

    // 回退到请求头
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0].trim();
      return ips;
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || (request.connection as { remoteAddress?: string })?.remoteAddress || 'unknown';
  }

  /**
   * 判断是否为登录相关端点
   */
  private isLoginEndpoint(request: Request): boolean {
    const path = request.path;
    return (
      path.includes('/auth/login') ||
      path.includes('/auth/register') ||
      path.includes('/auth/refresh') ||
      path.includes('/auth/verify') ||
      path.includes('/auth/forgot-password') ||
      path.includes('/auth/reset-password') ||
      path.includes('/auth/bind') ||
      path.includes('/auth/unbind') ||
      path.includes('/auth/send-verification') ||
      path.includes('/auth/resend-verification') ||
      path.includes('/auth/send-sms-code') ||
      path.includes('/auth/verify-sms-code') ||
      path.includes('/auth/register-phone') ||
      path.includes('/auth/login-phone') ||
      path.includes('/auth/verify-phone')
    );
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

    // 选择限流配置
    let limitConfig: RateLimitConfig;
    let limitType: string;

    if (isLoginEndpoint) {
      limitConfig = this.loginLimit;
      limitType = '登录接口';
    } else if (isPublic) {
      limitConfig = this.publicLimit;
      limitType = '公开接口';
    } else {
      limitConfig = this.authenticatedLimit;
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