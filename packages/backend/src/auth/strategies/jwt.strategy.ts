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
    console.log('[JwtStrategy] 初始化, JWT_SECRET:', jwtSecret ? '已配置' : '未配置');

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
    console.log('[JwtStrategy] 开始验证用户:', payload.sub);

    // 检查用户是否在黑名单中
    const isUserBlacklisted =
      await this.tokenBlacklistService.isUserBlacklisted(payload.sub);
    if (isUserBlacklisted) {
      console.log('[JwtStrategy] 用户已被禁用:', payload.sub);
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

    console.log('[JwtStrategy] 查询用户结果:', user ? `存在 (${user.id})` : '不存在');

    if (!user) {
      throw new Error('用户不存在');
    }

    if (user.status !== 'ACTIVE') {
      console.log('[JwtStrategy] 用户状态非ACTIVE:', user.status);
      throw new Error('用户已被禁用');
    }

    console.log('[JwtStrategy] 验证成功:', user.email);
    return user;
  }
}
