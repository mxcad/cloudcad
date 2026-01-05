import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { TokenBlacklistService } from '../services/token-blacklist.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private tokenBlacklistService: TokenBlacklistService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

    this.logger.debug(`[JwtAuthGuard] URL: ${request.url}`);
    this.logger.debug(`[JwtAuthGuard] Token: ${token ? 'present' : 'missing'}`);
    this.logger.debug(`[JwtAuthGuard] Session: ${request.session?.userId ? 'present' : 'missing'}`);

    // 如果没有Token，检查 Session
    if (!token) {
      // 检查 Session 是否有用户信息
      if (request.session?.userId) {
        this.logger.debug(`使用 Session 认证: ${request.session.userId}`);
        // 将 Session 用户信息附加到 request.user
        request.user = {
          id: request.session.userId,
          role: request.session.userRole,
          email: request.session.userEmail,
        };
        // Session 认证成功，直接返回 true，不要调用 super.canActivate
        return true;
      }

      // 既没有 Token 也没有 Session，抛出异常
      this.logger.debug('请求未提供Token且无有效Session');
      throw new UnauthorizedException('未登录或登录已过期');
    }

    try {
      // 检查Token是否在黑名单中
      if (this.tokenBlacklistService) {
        const isBlacklisted =
          await this.tokenBlacklistService.isBlacklisted(token);
        if (isBlacklisted) {
          this.logger.warn('尝试使用已撤销的Token');
          throw new UnauthorizedException('Token已被撤销');
        }
      }

      // 继续正常的JWT验证
      const result = await (super.canActivate(context) as Promise<boolean>);
      if (result) {
        this.logger.debug('JWT验证成功');
      }
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`JWT验证失败: ${error.message}`, error.stack);
      throw new UnauthorizedException('Token验证失败');
    }
  }
}
