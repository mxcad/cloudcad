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
    this.isDevelopment = configService.get<string>('node.env') === 'development';
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

    // 返回用户基本信息 + JWT payload 中的角色信息
    // 这样避免每次请求都查询角色和权限表
    return {
      ...user,
      role: {
        name: payload.role,
      },
    };
  }
}
