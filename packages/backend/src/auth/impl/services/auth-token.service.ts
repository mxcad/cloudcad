import { Injectable, Logger, UnauthorizedException, InternalServerErrorException, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { SessionRequest, ITokenBlacklistService, IUserRepository, IRefreshTokenRepository, IAuthTokenService } from '@cloudcad/contracts';
import { TOKEN_BLACKLIST, USER_REPOSITORY, REFRESH_TOKEN_REPOSITORY } from '@cloudcad/contracts';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class AuthTokenService implements IAuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokenRepo: IRefreshTokenRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(TOKEN_BLACKLIST) private readonly tokenBlacklistService: ITokenBlacklistService
  ) {}

  async generateTokens(user: any, oldRefreshTokenToDelete?: string, clientId?: string): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtSecret = this.configService.get<string>('jwt.secret');
    const jwtRefreshSecret = this.configService.get<string>('jwt.refreshSecret');

    if (!jwtSecret) { throw new InternalServerErrorException('JWT_SECRET environment variable is required'); }

    const accessExpiresIn = this.configService.get<string>('jwt.expiresIn') || '1h';
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn') || '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        // jti 保证同一秒内多次签发 access token 也不相同（避免同一秒签发 token 冲突/复用）
        { sub: user.id, email: user.email, username: user.username, role: (user.role as any)?.name || 'USER', type: 'access', jti: randomUUID() },
        { secret: jwtSecret, expiresIn: accessExpiresIn as any }
      ),
      this.jwtService.signAsync(
        // jti 保证同一秒内多次签发 refresh token 也不相同（避免唯一约束冲突）
        { sub: user.id, type: 'refresh', jti: randomUUID() },
        { secret: jwtRefreshSecret, expiresIn: refreshExpiresIn as any }
      ),
    ]);

    const payload = this.jwtService.verify(refreshToken, {
      secret: jwtRefreshSecret,
    }) as Record<string, unknown> & { exp: number };
    const expiresAt = new Date(payload.exp * 1000);

    await this.refreshTokenRepo.storeRefreshToken({
      token: refreshToken,
      userId: user.id,
      expiresAt,
      clientId: clientId ?? null,
    }, oldRefreshTokenToDelete);

    return { accessToken, refreshToken };
  }

  async validateRefreshToken(token: string, userId: string): Promise<boolean> {
    try {
      const refreshToken = await this.refreshTokenRepo.findValid(token, userId);
      return !!refreshToken;
    } catch { return false; }
  }

  async deleteAllRefreshTokens(userId: string, clientId?: string): Promise<void> {
    try {
      await this.refreshTokenRepo.deleteByUserId(userId, clientId);
    } catch (error) {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.delete_refresh_token_failed') ?? '删除刷新Token失败');
    }
  }

  async refreshToken(refreshToken: string): Promise<any> {
    let payload: Record<string, unknown> & { type: string; sub: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      }) as Record<string, unknown> & { type: string; sub: string };
    } catch {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.refresh_token_invalid') ?? '无效的刷新Token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.refresh_token_invalid') ?? '无效的刷新Token');
    }

    const isValidRefreshToken = await this.refreshTokenRepo.findValid(refreshToken, payload.sub);
    if (!isValidRefreshToken) {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.refresh_token_expired') ?? '刷新Token无效或已过期');
    }

    const user = await this.userRepo.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.user_not_found_or_disabled') ?? '用户不存在或已被禁用');
    }

    const hasPassword = !!user.password;
    const { password: _, ...userWithoutPassword } = user;
    const clientId = (payload as Record<string, unknown>).client_id as string | undefined;
    const tokens = await this.generateTokens(userWithoutPassword, refreshToken, clientId);

    return { ...tokens, user: { ...userWithoutPassword, hasPassword } };
  }

  async logout(userId: string, accessToken?: string, req?: SessionRequest): Promise<void> {
    try {
      let tokenClientId: string | null | undefined;
      if (accessToken) {
        try {
          const payload = this.jwtService.verify(accessToken, {
            secret: this.configService.get<string>('jwt.secret'),
          }) as Record<string, unknown> & { client_id?: string };
          tokenClientId = payload.client_id ?? null;
        } catch {
          // accessToken 校验失败时忽略，走默认（清除该用户全部刷新令牌）分支
        }
      }
      if (tokenClientId !== undefined) {
        await this.deleteAllRefreshTokens(userId, tokenClientId);
      } else {
        await this.deleteAllRefreshTokens(userId);
      }
      this.logger.log(`用户退出登录，已删除刷新令牌：${userId}${tokenClientId !== undefined ? ` (client: ${tokenClientId ?? 'web'})` : ''}`);

      if (accessToken) {
        let payload: (Record<string, unknown> & { exp: number; type: string }) | null = null;
        try {
          payload = this.jwtService.verify(accessToken, {
            secret: this.configService.get<string>('jwt.secret'),
          }) as Record<string, unknown> & { exp: number; type: string };
        } catch (verifyError) {
          this.logger.warn(`退出登录：Token 验证失败，跳过黑名单：${verifyError instanceof Error ? verifyError.message : 'Unknown'}`);
        }
        if (payload && payload.type === 'access') {
          const now = Math.floor(Date.now() / 1000);
          const expiresIn = payload.exp - now;
          if (expiresIn > 0) {
            try {
              await this.tokenBlacklistService.addToBlacklist(accessToken, expiresIn);
              this.logger.log(`Access Token 已加入黑名单：${userId}`);
            } catch (redisError) {
              this.logger.error(`退出登录：Token 加入黑名单失败(Redis)：${redisError instanceof Error ? redisError.message : 'Unknown'}`);
            }
          }
        }
      }

      if (req?.session) {
        try {
          await (req.session as any).destroy();
          this.logger.log(`用户 Session 已销毁：${userId}`);
        } catch (err) {
          this.logger.error(`Session 销毁失败：${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`登出失败：${err.message}`);
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.logout_failed') ?? '登出失败');
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      }) as Record<string, unknown> & { exp: number };
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = payload.exp - now;
      if (expiresIn > 0) {
        await this.tokenBlacklistService.addToBlacklist(token, expiresIn);
      }
    } catch (error) {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.token_invalid') ?? '无效的Token');
    }
  }
}
