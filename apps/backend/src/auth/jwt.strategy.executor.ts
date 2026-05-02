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

import {
  Injectable,
  Logger,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from './decorators/optional-auth.decorator';

@Injectable()
export class JwtStrategyExecutor extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtStrategyExecutor.name);

  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 添加详细日志排查问题
    this.logger.log(
      `[JWT] ${request.method} ${request.path} - Auth: ${request.headers.authorization ? 'present' : 'missing'} - Session: ${request.session?.userId || 'none'}`
    );

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 检查是否为可选认证路由
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()]
    );

    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

    // 如果没有Token，检查 Session
    if (!token) {
      // 检查 Session 是否有用户信息
      if (request.session?.userId) {
        this.logger.debug(`使用 Session 认证: ${request.session.userId}`);
        // 将 Session 用户信息附加到 request.user
        request.user = {
          id: request.session.userId,
          role: request.session.userRole,
          email: request.session.userEmail,
          phone: request.session.userPhone,
        };
        // Session 认证成功，直接返回 true，不要调用 super.canActivate
        return true;
      }

      // 既没有 Token 也没有 Session
      if (isOptionalAuth) {
        // 可选认证模式：允许未登录用户继续访问
        this.logger.debug(
          `[JWT] ${request.method} ${request.path} - 可选认证模式：允许未登录用户继续访问`
        );
        return true;
      }

      // 强制认证模式：抛出异常
      this.logger.warn(
        `[JWT] ${request.method} ${request.path} - 认证失败: 无Token且无Session`
      );
      throw new UnauthorizedException('未登录或登录已过期');
    }

    // 有 Token，继续正常的 JWT 验证
    const result = await super.canActivate(context);
    return result as boolean;
  }
}
