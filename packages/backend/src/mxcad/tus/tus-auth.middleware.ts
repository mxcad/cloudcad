///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { ExtractJwt } from 'passport-jwt';

/**
 * Tus 可选认证中间件
 *
 * 为 Tus 上传端点提供可选的 JWT 认证。
 * - 有 token → 验证 JWT，设置 req.user
 * - 有 session → 使用 session，设置 req.user
 * - 都没有 → 允许匿名上传（req.user 为 undefined）
 */
@Injectable()
export class TusAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TusAuthMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    // 跳过 OPTIONS 请求（CORS 预检）
    if (req.method === 'OPTIONS') {
      return next();
    }

    try {
      // 从 Authorization header 提取 token
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

      if (token) {
        // 验证 JWT — 使用 JwtService 内置的 secret，不手动传入，避免与 JwtModule 初始化逻辑冲突
        const payload = this.jwtService.verify(token);
        (req as any).user = payload;
        this.logger.debug(`JWT 认证成功: ${payload.id}`);
        return next();
      }

      // 尝试从 session 中获取
      if ((req.session as any)?.userId) {
        (req as any).user = {
          id: (req.session as any).userId,
          role: (req.session as any).userRole,
          email: (req.session as any).userEmail,
        };
        this.logger.debug(`使用 Session 认证: ${(req as any).user.id}`);
        return next();
      }

      // 匿名用户：不设置 user，继续处理
      this.logger.debug('匿名上传（无 Token 且无 Session）');
      res.setHeader('X-Auth-Status', 'anonymous');
      next();
    } catch (error) {
      // Token 存在但无效 → 降级为匿名上传，不拒绝请求
      this.logger.warn(`Token 无效，降级为匿名上传: ${(error as Error).message}`);
      res.setHeader('X-Auth-Status', 'anonymous');
      next();
    }
  }
}
