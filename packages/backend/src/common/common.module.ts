import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PermissionService } from './services/permission.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RolesCacheService } from './services/roles-cache.service';

@Module({
  imports: [DatabaseModule],
  providers: [PermissionService, PermissionCacheService, RolesCacheService],
  exports: [PermissionService, PermissionCacheService, RolesCacheService],
})
export class CommonModule {}
