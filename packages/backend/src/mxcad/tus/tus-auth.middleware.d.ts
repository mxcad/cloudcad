import { NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
/**
 * Tus 认证中间件
 *
 * 为 Tus 上传端点提供 JWT 认证保护。
 */
export declare class TusAuthMiddleware implements NestMiddleware {
    private readonly jwtService;
    private readonly configService;
    private readonly logger;
    constructor(jwtService: JwtService, configService: ConfigService);
    use(req: Request, res: Response, next: NextFunction): void;
}
//# sourceMappingURL=tus-auth.middleware.d.ts.map