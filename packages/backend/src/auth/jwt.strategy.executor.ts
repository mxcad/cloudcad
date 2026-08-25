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
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { IS_OPTIONAL_AUTH_KEY } from './decorators/optional-auth.decorator';
import { SCRAPE_AUTH_KEY } from './decorators/scrape-auth.decorator';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { DatabaseService } from '../database/database.service';
import { extractTokenFromRequest } from './utils/token-extractor';
import { matchScrapeCredentials } from './utils/scrape-token';

import { I18nContext } from 'nestjs-i18n';
@Injectable()
export class JwtStrategyExecutor extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtStrategyExecutor.name);

  constructor(
    private reflector: Reflector,
    @Inject(TokenBlacklistService)
    private readonly tokenBlacklistService: TokenBlacklistService,
    @Inject(DatabaseService)
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService
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

    // #315：Prometheus 抓取令牌认证 —— 仅对声明 @ScrapeAuth() 的端点生效，
    // 匹配 SCRAPE_TOKEN 时放行且不注入 request.user（无用户身份），
    // 由端点级 Guard（如 MetricsAccessGuard）依据 request.isScrapeAuth 决定授权
    if (this.tryScrapeTokenAuth(context, request)) {
      return true;
    }

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

  /**
   * 尝试抓取令牌认证（#315）
   *
   * 前置条件（全部满足才走此通道）：
   * 1. 服务端配置了 SCRAPE_TOKEN（metrics.scrapeToken）；
   * 2. 端点声明了 @ScrapeAuth() 元数据；
   * 3. Authorization 凭据与令牌匹配（Bearer 或 Basic 密码形式）。
   *
   * 匹配成功：request.isScrapeAuth = true 并放行；不满足则返回 false，
   * 请求继续走原有 JWT/Session 流程（错误凭据自然被后续校验以 401 拒绝）。
   */
  private tryScrapeTokenAuth(
    context: ExecutionContext,
    request: Record<string, any>
  ): boolean {
    const scrapeToken = this.configService.get<string>('metrics.scrapeToken');
    if (!scrapeToken) {
      return false;
    }

    const allowsScrapeAuth = this.reflector.getAllAndOverride<boolean>(
      SCRAPE_AUTH_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!allowsScrapeAuth) {
      return false;
    }

    const matched = matchScrapeCredentials(
      request?.headers?.authorization as string | undefined,
      scrapeToken
    );
    if (!matched) {
      return false;
    }

    request.isScrapeAuth = true;
    this.logger.debug(
      `[JWT] ${request.method} ${request.path} - 抓取令牌认证通过`
    );
    return true;
  }
}
