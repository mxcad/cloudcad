import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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

  async validate(payload: { sub: string; email: string; username: string }) {
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
      },
    });
    if (!user) {
      throw new Error('用户不存在');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('用户已被禁用');
    }
    return user;
  }
}
