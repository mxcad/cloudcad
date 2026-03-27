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
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private tokenBlacklistService: TokenBlacklistService,
    private reflector: Reflector
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否为公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

    this.logger.debug(`URL: ${request.url}`);
    this.logger.debug(
      `Token: ${token ? `present (${token.substring(0, 20)}...)` : 'missing'}`
    );
    this.logger.debug(
      `Session: ${request.session?.userId ? 'present' : 'missing'}`
    );

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
        };
        // Session 认证成功，直接返回 true，不要调用 super.canActivate
        return true;
      }

      // 既没有 Token 也没有 Session，抛出异常
      this.logger.debug('请求未提供Token且无有效Session');
      throw new UnauthorizedException('未登录或登录已过期');
    }

    try {
      // 检查Token是否在黑名单中
      if (this.tokenBlacklistService) {
        const isBlacklisted =
          await this.tokenBlacklistService.isBlacklisted(token);
        if (isBlacklisted) {
          this.logger.warn('尝试使用已撤销的Token');
          throw new UnauthorizedException('Token已被撤销');
        }
      }

      // 继续正常的JWT验证
      const result = await (super.canActivate(context) as Promise<boolean>);
      if (result) {
        this.logger.debug('JWT验证成功');
      }
      return result;
    } catch (error) {
      const err = error as Error;

      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`JWT验证失败: ${err.message}`, err.stack);
      throw new UnauthorizedException('Token验证失败');
    }
  }
}
