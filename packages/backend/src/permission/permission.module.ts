import { Module } from '@nestjs/common';
import { PermissionService } from './services/permission.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RoleInheritanceService } from './services/role-inheritance.service';
import { IPERMISSION_SERVICE } from './interfaces/permission-service.interface';
import { StorePermissionStrategy, ISTORE_PERMISSION_STRATEGY } from './strategies/store-permission.strategy';
import { ContextPermissionStrategy, ICONTEXT_PERMISSION_STRATEGY } from './strategies/context-permission.strategy';

@Module({
  providers: [
    PermissionService,
    {
      provide: IPERMISSION_SERVICE,
      useClass: PermissionService,
    },
    PermissionCacheService,
    RoleInheritanceService,
    {
      provide: ISTORE_PERMISSION_STRATEGY,
      useClass: StorePermissionStrategy,
    },
    {
      provide: ICONTEXT_PERMISSION_STRATEGY,
      useClass: ContextPermissionStrategy,
    },
  ],
  exports: [
    PermissionService,
    IPERMISSION_SERVICE,
    PermissionCacheService,
    RoleInheritanceService,
  ],
})
export class PermissionModule {}
