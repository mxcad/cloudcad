import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../services/permission.service';
/**
 * 统一权限检查 Guard
 *
 * 功能：
 * 1. 检查用户是否具有所需的权限
 * 2. 支持 AND 和 OR 逻辑
 * 3. 自动从请求中提取用户信息和节点 ID
 * 4. 支持上下文感知的权限检查
 */
export declare class PermissionsGuard implements CanActivate {
    private readonly reflector;
    private readonly permissionService;
    constructor(reflector: Reflector, permissionService: PermissionService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    /**
     * 从请求中提取上下文信息
     */
    private extractContext;
    /**
     * 检查权限
     */
    private checkPermissions;
}
//# sourceMappingURL=permissions.guard.d.ts.map