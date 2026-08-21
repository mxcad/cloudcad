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

import { UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { I18nContext } from 'nestjs-i18n';
import { TokenBlacklistService } from '../auth/services/token-blacklist.service';
import { DatabaseService } from '../database/database.service';

interface CooperateJwtPayload {
  sub: string;
  type?: string;
}

/**
 * 协同代理认证（main.ts 中 /api/cooperate 中间件使用）。
 * 校验逻辑与 JwtStrategy.validate 对齐：access token 类型、token 黑名单、
 * 用户黑名单、用户状态（禁用/删除）。
 */
export class CooperateAuthService {
  constructor(
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly databaseService: DatabaseService,
    private readonly jwtSecret: string
  ) {}

  /**
   * 校验 JWT 并返回 userId；不合法时抛 UnauthorizedException
   */
  async authenticateJwt(token: string): Promise<string> {
    let payload: CooperateJwtPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret) as CooperateJwtPayload;
    } catch {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.login_expired') ??
          '登录已过期，请重新登录'
      );
    }

    // 仅接受 access token（refresh token 不能用于协同）
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.token_invalid') ?? '无效的Token类型'
      );
    }

    if (!payload.sub) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.token_invalid') ?? '无效的Token'
      );
    }

    // Token 黑名单（登出后 token 立即失效）
    if (await this.tokenBlacklistService.isBlacklisted(token)) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.token_revoked') ?? 'Token已被撤销'
      );
    }

    await this.ensureUserActive(payload.sub);
    return payload.sub;
  }

  /**
   * 校验 Session 用户（禁用/删除拒绝），与 JwtStrategyExecutor 的 session 分支对齐
   */
  async authenticateSession(userId: string): Promise<void> {
    await this.ensureUserActive(userId);
  }

  private async ensureUserActive(userId: string): Promise<void> {
    // 用户黑名单
    if (await this.tokenBlacklistService.isUserBlacklisted(userId)) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.user_disabled') ?? '用户已被禁用'
      );
    }

    // 用户状态（禁用/删除）
    const user = await this.databaseService.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.user_disabled') ?? '用户已被禁用'
      );
    }
  }
}
