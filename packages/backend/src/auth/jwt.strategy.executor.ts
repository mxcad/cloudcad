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
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from './decorators/optional-auth.decorator';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { DatabaseService } from '../database/database.service';
import { extractTokenFromRequest } from './utils/token-extractor';

import { I18nContext } from 'nestjs-i18n';
@Injectable()
export class JwtStrategyExecutor extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtStrategyExecutor.name);

  constructor(
    private reflector: Reflector,
    @Inject(TokenBlacklistService)
    private readonly tokenBlacklistService: TokenBlacklistService,
    @Inject(DatabaseService)
    private readonly prisma: DatabaseService
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

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

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()]
    );

    // 从所有来源（Authorization header、auth_token cookie）提取 token
    const token = extractTokenFromRequest(request);

    // 有 Token → 强制 JWT 验证，不降级到 session
    if (token) {
      try {
        const result = await super.canActivate(context);
        return result as boolean;
      } catch (error) {
        // OptionalAuth 端点：Token 无效时允许匿名访问，不抛异常
        if (isOptionalAuth) {
          this.logger.debug(
            `[JWT] ${request.method} ${request.path} - Token验证失败但端点标记为OptionalAuth，允许匿名访问`
          );
          return true;
        }
        this.logger.warn(
          `[JWT] ${request.method} ${request.path} - JWT验证失败，Token来源: ${request.headers.authorization ? 'Authorization header' : 'auth_token cookie'}`
        );
        throw error;
      }
    }

    // 无 Token → 回退到 Session 或 OptionalAuth
    if (request.session?.userId) {
      let sessionRoleId: string | undefined;
      try {
        const isUserBlacklisted =
          await this.tokenBlacklistService.isUserBlacklisted(
            request.session.userId
          );
        if (isUserBlacklisted) {
          this.logger.warn(`Session 用户已被禁用: ${request.session.userId}`);
          throw new UnauthorizedException(
            I18nContext.current()?.t('error.auth.user_disabled') ??
              '用户已被禁用'
          );
        }

        const userStatus = await this.prisma.user.findUnique({
          where: {
            id: request.session.userId,
            deletedAt: null,
          },
          select: {
            id: true,
            status: true,
            role: { select: { name: true, id: true } },
          },
        });

        if (!userStatus || userStatus.status !== 'ACTIVE') {
          this.logger.warn(`Session 用户状态异常: ${request.session.userId}`);
          throw new UnauthorizedException(
            I18nContext.current()?.t('error.auth.user_disabled') ??
              '用户已被禁用'
          );
        }

        // 优先使用 DB 查出的实时角色（角色降级/升级立即生效），否则回退到 session 角色
        const effectiveRole = userStatus.role?.name ?? request.session.userRole;
        // 仅当角色变化时才写回，避免每请求赋值触发 session store 持久化写放大
        if (request.session.userRole !== effectiveRole) {
          request.session.userRole = effectiveRole;
        }
        sessionRoleId = userStatus.role?.id;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        this.logger.error(`Session 用户验证失败: ${(error as Error).message}`);
        throw new UnauthorizedException(
          I18nContext.current()?.t('error.auth.token_invalid') ?? '认证失败'
        );
      }

      this.logger.debug(`使用 Session 认证: ${request.session.userId}`);
      request.user = {
        id: request.session.userId,
        roleId: sessionRoleId,
        role: { name: request.session.userRole },
        email: request.session.userEmail,
        phone: request.session.userPhone,
      };
      return true;
    }

    if (isOptionalAuth) {
      this.logger.debug(
        `[JWT] ${request.method} ${request.path} - 可选认证模式：允许未登录用户继续访问`
      );
      return true;
    }

    this.logger.warn(
      `[JWT] ${request.method} ${request.path} - 认证失败: 无Token且无Session`
    );
    throw new UnauthorizedException(
      I18nContext.current()?.t('error.auth.login_expired') ??
        '未登录或登录已过期'
    );
  }
}
