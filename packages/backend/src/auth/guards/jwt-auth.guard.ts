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

    // 如果没有Token，让父类处理
    if (!token) {
      this.logger.debug('请求未提供Token');
      return super.canActivate(context) as Promise<boolean>;
    }

    try {
      // 检查Token是否在黑名单中
      if (this.tokenBlacklistService) {
        const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
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
