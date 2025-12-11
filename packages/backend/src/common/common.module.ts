import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PermissionService } from './services/permission.service';
import { PermissionCacheService } from './services/permission-cache.service';

@Module({
  imports: [DatabaseModule],
  providers: [PermissionService, PermissionCacheService],
  exports: [PermissionService, PermissionCacheService],
})
export class CommonModule {}
