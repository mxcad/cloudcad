import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PermissionService } from './services/permission.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { DebugLogger } from './utils/debug-logger';

@Module({
  imports: [DatabaseModule],
  providers: [PermissionService, PermissionCacheService, DebugLogger],
  exports: [PermissionService, PermissionCacheService, DebugLogger],
})
export class CommonModule {}
