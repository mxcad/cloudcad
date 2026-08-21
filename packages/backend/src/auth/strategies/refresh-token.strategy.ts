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

import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';

import { I18nContext } from 'nestjs-i18n';
@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'refresh-token'
) {
  private readonly configService: ConfigService;
  private readonly prisma: DatabaseService;
  private readonly tokenBlacklistService: TokenBlacklistService;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DatabaseService) prisma: DatabaseService,
    @Inject(TokenBlacklistService) tokenBlacklistService: TokenBlacklistService
  ) {
    const jwtRefreshSecret = configService.get<string>('jwt.refreshSecret');
    if (!jwtRefreshSecret) {
      throw new BadRequestException('JWT_REFRESH_SECRET environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtRefreshSecret,
    });

    this.configService = configService;
    this.prisma = prisma;
    this.tokenBlacklistService = tokenBlacklistService;
  }

  async validate(payload: { sub: string; type: string }) {
    if (payload.type !== 'refresh') {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.refresh_token_invalid_type') ?? '无效的刷新Token类型');
    }

    // 检查用户是否在黑名单中
    const isUserBlacklisted =
      await this.tokenBlacklistService.isUserBlacklisted(payload.sub);
    if (isUserBlacklisted) {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.user_disabled') ?? '用户已被禁用');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.user_not_found_or_disabled') ?? '用户不存在或已被禁用');
    }

    return user;
  }
}
