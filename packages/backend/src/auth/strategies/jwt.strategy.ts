///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly configService: ConfigService;
  private readonly prisma: DatabaseService;
  private readonly tokenBlacklistService: TokenBlacklistService;
  private readonly isDevelopment: boolean;

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
    this.isDevelopment =
      configService.get<string>('node.env') === 'development';
  }

  async validate(payload: {
    sub: string;
    email: string;
    username: string;
    role: string;
    type: string;
  }) {
    // 检查用户是否在黑名单中
    const isUserBlacklisted =
      await this.tokenBlacklistService.isUserBlacklisted(payload.sub);
    if (isUserBlacklisted) {
      if (this.isDevelopment) {
        this.logger.warn(`用户已被禁用: ${payload.sub}`);
      }
      throw new Error('用户已被禁用');
    }

    // 快速查询：仅检查用户是否存在和状态
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        status: true,
        roleId: true,
      },
    });

    if (!user) {
      if (this.isDevelopment) {
        this.logger.warn(`用户不存在: ${payload.sub}`);
      }
      throw new Error('用户不存在');
    }

    if (user.status !== 'ACTIVE') {
      if (this.isDevelopment) {
        this.logger.warn(`用户状态非ACTIVE: ${user.status}`);
      }
      throw new Error('用户已被禁用');
    }

    // 查询用户的角色和权限信息
    const role = await this.prisma.role.findUnique({
      where: { id: user.roleId },
      include: {
        permissions: {
          select: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      if (this.isDevelopment) {
        this.logger.warn(`角色不存在: ${user.roleId}`);
      }
      throw new Error('角色不存在');
    }

    // 返回用户基本信息 + 角色和权限信息
    return {
      ...user,
      role: {
        name: role.name,
        description: role.description,
        permissions: role.permissions.map((p) => p.permission),
      },
    };
  }
}
