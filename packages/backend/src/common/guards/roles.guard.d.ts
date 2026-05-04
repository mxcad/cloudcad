import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionCacheService } from '../services/permission-cache.service';
import { RolesCacheService } from '../services/roles-cache.service';
import { PermissionService } from '../services/permission.service';
export declare class RolesGuard implements CanActivate {
    private reflector;
    private permissionService;
    private cacheService;
    private rolesCacheService;
    constructor(reflector: Reflector, permissionService: PermissionService, cacheService: PermissionCacheService, rolesCacheService: RolesCacheService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
//# sourceMappingURL=roles.guard.d.ts.map