import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenBlacklistService } from '../services/token-blacklist.service';
declare const JwtAuthGuard_base: import("@nestjs/passport").Type<import("@nestjs/passport").IAuthGuard>;
export declare class JwtAuthGuard extends JwtAuthGuard_base {
    private tokenBlacklistService;
    private reflector;
    private readonly logger;
    constructor(tokenBlacklistService: TokenBlacklistService, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export {};
//# sourceMappingURL=jwt-auth.guard.d.ts.map