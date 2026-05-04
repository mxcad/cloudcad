import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
/**
 * 速率限制 Guard
 *
 * 功能：
 * 1. 对公开接口（@Public）施加严格的速率限制
 * 2. 对需要认证的接口施加宽松的速率限制
 * 3. 基于 IP 进行限流
 * 4. 使用滑动窗口算法
 * 5. 可通过装饰器自定义限流规则
 */
export declare class RateLimitGuard implements CanActivate {
    private readonly reflector;
    private readonly logger;
    private readonly requestRecords;
    private readonly publicLimit;
    private readonly authenticatedLimit;
    private cleanupInterval;
    constructor(reflector: Reflector);
    /**
     * 清理过期的请求记录
     */
    private cleanupOldRecords;
    /**
     * 获取客户端真实 IP
     */
    private getClientIp;
    /**
     * 检查是否超过速率限制
     */
    private isRateLimited;
    canActivate(context: ExecutionContext): Promise<boolean>;
}
//# sourceMappingURL=rate-limit.guard.d.ts.map