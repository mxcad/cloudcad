///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, NestMiddleware, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { ExtractJwt } from 'passport-jwt';

/**
 * Tus 认证中间件
 *
 * 为 Tus 上传端点提供 JWT 认证保护。
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
      
      if (!token) {
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
        
        this.logger.debug('请求未提供 Token 且无有效 Session');
        throw new UnauthorizedException('未登录或登录已过期');
      }

      // 验证 JWT
      const secret = this.configService.get('jwt.secret', { infer: true });
      const payload = this.jwtService.verify(token, { secret });
      
      (req as any).user = payload;
      this.logger.debug(`JWT 认证成功: ${payload.id}`);
      
      next();
    } catch (error) {
      this.logger.error(`Tus 认证失败: ${(error as Error).message}`);
      res.status(401).json({
        statusCode: 401,
        message: '未登录或登录已过期',
        error: 'Unauthorized'
      });
    }
  }
}
