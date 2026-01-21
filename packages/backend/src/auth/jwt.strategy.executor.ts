import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

@Injectable()
export class JwtStrategyExecutor extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtStrategyExecutor.name);

  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: any): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

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
      throw new UnauthorizedException('未登录或登录已过期');
    }

    // 有 Token，继续正常的 JWT 验证
    const result = await super.canActivate(context);
    return result as boolean;
  }
}
