import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
declare const JwtStrategyExecutor_base: import("@nestjs/passport").Type<import("@nestjs/passport").IAuthGuard>;
export declare class JwtStrategyExecutor extends JwtStrategyExecutor_base {
    private reflector;
    private readonly logger;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export {};
//# sourceMappingURL=jwt.strategy.executor.d.ts.map