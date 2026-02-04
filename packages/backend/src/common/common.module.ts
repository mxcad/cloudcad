import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { StorageModule } from '../storage/storage.module';
import { PermissionService } from './services/permission.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RolesCacheService } from './services/roles-cache.service';
import { RedisCacheService } from './services/redis-cache.service';
import { CacheWarmupService } from './services/cache-warmup.service';
import { FileLockService } from './services/file-lock.service';
import { DirectoryAllocator } from './services/directory-allocator.service';
import { StorageManager } from './services/storage-manager.service';
import { FileCopyService } from './services/file-copy.service';
import { DiskMonitorService } from './services/disk-monitor.service';
import { StorageCleanupService } from './services/storage-cleanup.service';
import { StorageCleanupScheduler } from './schedulers/storage-cleanup.scheduler';
import { CacheMonitorController } from './controllers/cache-monitor.controller';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    forwardRef(() => AuditLogModule),
  ],
  providers: [
    PermissionService,
    PermissionCacheService,
    RolesCacheService,
    RedisCacheService,
    CacheWarmupService,
    FileLockService,
    DirectoryAllocator,
    StorageManager,
    FileCopyService,
    DiskMonitorService,
    StorageCleanupService,
    StorageCleanupScheduler,
  ],
  controllers: [CacheMonitorController],
  exports: [
    PermissionService,
    PermissionCacheService,
    RolesCacheService,
    RedisCacheService,
    CacheWarmupService,
    FileLockService,
    DirectoryAllocator,
    StorageManager,
    FileCopyService,
    DiskMonitorService,
    StorageCleanupService,
  ],
})
export class CommonModule {}
