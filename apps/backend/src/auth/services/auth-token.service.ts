///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from './token-blacklist.service';
import {
  JwtAccessPayload,
  JwtRefreshPayload,
  UserForToken,
} from '../interfaces/jwt-payload.interface';

@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);

  constructor(
    private prisma: DatabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService
  ) {}

  async generateTokens(user: UserForToken): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role?.name || 'USER',
      type: 'access',
    };

    const refreshPayload: JwtRefreshPayload = {
      sub: user.id,
      type: 'refresh',
    };

    const jwtSecret = this.configService.get<string>('jwt.secret');

    if (!jwtSecret) {
      throw new InternalServerErrorException(
        'JWT_SECRET environment variable is required'
      );
    }

    const accessExpiresInConfig =
      this.configService.get<string>('jwt.expiresIn');
    const refreshExpiresInConfig = this.configService.get<string>(
      'jwt.refreshExpiresIn'
    );

    const accessExpiresIn = (accessExpiresInConfig ||
      '1h') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`;
    const refreshExpiresIn = (refreshExpiresInConfig ||
      '7d') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: jwtSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: jwtSecret,
        expiresIn: refreshExpiresIn,
      }),
    ]);

    await this.storeRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async storeRefreshToken(
    userId: string,
    token: string
  ): Promise<void> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as JwtRefreshPayload & { exp: number };

      const expiresAt = new Date(payload.exp * 1000);

      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      await this.prisma.refreshToken.create({
        data: {
          token,
          userId,
          expiresAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        this.logger.warn(`并发刷新 token 冲突，已忽略: ${error.message}`);
        return;
      }
      throw new UnauthorizedException('Token存储失败');
    }
  }

  async validateRefreshToken(token: string, userId: string): Promise<boolean> {
    try {
      const refreshToken = await this.prisma.refreshToken.findFirst({
        where: {
          token,
          userId,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      return !!refreshToken;
    } catch (error) {
      return false;
    }
  }

  async deleteAllRefreshTokens(userId: string): Promise<void> {
    try {
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
    } catch (error) {
      throw new UnauthorizedException('删除刷新Token失败');
    }
  }

  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserForToken & { hasPassword?: boolean };
  }> {
    const payload = this.jwtService.verify(refreshToken, {
      secret: this.configService.get<string>('jwt.secret'),
    }) as JwtRefreshPayload;

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('无效的刷新Token');
    }

    const isValidRefreshToken = await this.validateRefreshToken(
      refreshToken,
      payload.sub
    );
    if (!isValidRefreshToken) {
      throw new UnauthorizedException('刷新Token无效或已过期');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            isSystem: true,
            permissions: {
              select: {
                permission: true,
              },
            },
          },
        },
        status: true,
        wechatId: true,
        provider: true,
        password: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户不存在或已被禁用');
    }

    const hasPassword = !!user.password;
    const { password: _, ...userWithoutPassword } = user;
    const tokens = await this.generateTokens(userWithoutPassword);

    return {
      ...tokens,
      user: {
        ...userWithoutPassword,
        hasPassword,
      },
    };
  }

  async logout(userId: string, accessToken?: string, req?: any): Promise<void> {
    try {
      await this.deleteAllRefreshTokens(userId);
      this.logger.log(`用户退出登录，已删除刷新令牌：${userId}`);

      if (accessToken) {
        try {
          const payload = this.jwtService.verify(accessToken, {
            secret: this.configService.get<string>('jwt.secret'),
          }) as JwtAccessPayload & { exp: number };

          if (payload.type === 'access') {
            const now = Math.floor(Date.now() / 1000);
            const expiresIn = payload.exp - now;

            if (expiresIn > 0) {
              await this.tokenBlacklistService.addToBlacklist(
                accessToken,
                expiresIn
              );
              this.logger.log(`Access Token 已加入黑名单：${userId}`);
            }
          }
        } catch (error) {
          this.logger.warn(
            `Access Token 验证失败，跳过黑名单：${error instanceof Error ? error.message : 'Unknown'}`
          );
        }
      }

      if (req?.session) {
        await new Promise<void>((resolve, reject) => {
          req.session.destroy((err: Error) => {
            if (err) {
              this.logger.error(`Session 销毁失败：${err.message}`);
              reject(err);
            } else {
              this.logger.log(`用户 Session 已销毁：${userId}`);
              resolve();
            }
          });
        });
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`登出失败：${err.message}`);
      throw new UnauthorizedException('登出失败');
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as JwtRefreshPayload & { exp: number };

      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.exp - now;

      if (expiresIn > 0) {
        await this.tokenBlacklistService.addToBlacklist(token, expiresIn);
      }
    } catch (error) {
      throw new UnauthorizedException('无效的Token');
    }
  }
}
