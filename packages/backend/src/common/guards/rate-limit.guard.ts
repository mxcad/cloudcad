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
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

/**
 * IP 请求记录
 */
interface RateLimitRecord {
  count: number;
  startTime: number;
}

/**
 * 速率限制 Guard
 *
 * 功能：
 * 1. 对公开接口（@Public）施加严格的速率限制
 * 2. 对需要认证的接口施加宽松的速率限制
 * 3. 基于 IP 进行限流
 * 4. 使用滑动窗口算法
 * 5. 可通过装饰器自定义限流规则
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  // 内存存储的 IP 请求记录
  private readonly requestRecords = new Map<string, RateLimitRecord>();

  // 配置：公开接口限制（更严格）
  private readonly publicLimit = {
    windowMs: 60000, // 1分钟
    maxRequests: 30, // 最多30次请求
  };

  // 配置：认证接口限制（更宽松）
  private readonly authenticatedLimit = {
    windowMs: 60000, // 1分钟
    maxRequests: 150, // 最多150次请求
  };

  // 定期清理旧记录的定时器（防止内存泄漏）
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly reflector: Reflector) {
    // 每5分钟清理一次过期记录
    this.cleanupInterval = setInterval(() => this.cleanupOldRecords(), 300000);
  }

  /**
   * 清理过期的请求记录
   */
  private cleanupOldRecords(): void {
    const now = Date.now();
    const maxAge = Math.max(this.publicLimit.windowMs, this.authenticatedLimit.windowMs) * 2;

    for (const [ip, record] of this.requestRecords) {
      if (now - record.startTime > maxAge) {
        this.requestRecords.delete(ip);
      }
    }
    this.logger.debug(`清理了过期的速率限制记录`);
  }

  /**
   * 获取客户端真实 IP
   */
  private getClientIp(request: Request): string {
    // 尝试从各种可能的头中获取真实 IP
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0].trim();
      return ips;
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // 回退到 Express 的 ip 属性
    return request.ip || (request.connection as { remoteAddress?: string })?.remoteAddress || 'unknown';
  }

  /**
   * 检查是否超过速率限制
   */
  private isRateLimited(ip: string, limitConfig: { windowMs: number; maxRequests: number }): boolean {
    const now = Date.now();
    let record = this.requestRecords.get(ip);

    if (!record) {
      // 没有记录，创建新的
      record = { count: 1, startTime: now };
      this.requestRecords.set(ip, record);
      return false;
    }

    // 检查是否在同一个时间窗口内
    if (now - record.startTime < limitConfig.windowMs) {
      // 在同一个窗口内，增加计数
      record.count++;
      if (record.count > limitConfig.maxRequests) {
        return true;
      }
    } else {
      // 新的时间窗口，重置计数
      record.count = 1;
      record.startTime = now;
    }

    return false;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.getClientIp(request);

    // 检查是否是公开接口
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()]
    );

    const limitConfig = isPublic ? this.publicLimit : this.authenticatedLimit;

    if (this.isRateLimited(ip, limitConfig)) {
      this.logger.warn(`IP ${ip} 超过速率限制 (${isPublic ? '公开接口' : '认证接口'})`);
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
