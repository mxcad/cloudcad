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

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'refresh-token'
) {
  private readonly configService: ConfigService;
  private readonly prisma: DatabaseService;
  private readonly tokenBlacklistService: TokenBlacklistService;

  constructor(
    configService: ConfigService,
    prisma: DatabaseService,
    tokenBlacklistService: TokenBlacklistService
  ) {
    const jwtSecret = configService.get<string>('jwt.secret');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

    this.configService = configService;
    this.prisma = prisma;
    this.tokenBlacklistService = tokenBlacklistService;
  }

  async validate(payload: { sub: string; type: string }) {
    if (payload.type !== 'refresh') {
      throw new Error('无效的刷新Token类型');
    }

    // 检查用户是否在黑名单中
    const isUserBlacklisted =
      await this.tokenBlacklistService.isUserBlacklisted(payload.sub);
    if (isUserBlacklisted) {
      throw new Error('用户已被禁用');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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
      throw new Error('用户不存在或已被禁用');
    }

    return user;
  }
}
