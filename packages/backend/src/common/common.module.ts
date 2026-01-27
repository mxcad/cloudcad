import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { PermissionService } from './services/permission.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RolesCacheService } from './services/roles-cache.service';
import { RedisCacheService } from './services/redis-cache.service';
import { CacheWarmupService } from './services/cache-warmup.service';
import { CacheMonitorController } from './controllers/cache-monitor.controller';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [
    PermissionService,
    PermissionCacheService,
    RolesCacheService,
    RedisCacheService,
    CacheWarmupService,
  ],
  controllers: [CacheMonitorController],
  exports: [
    PermissionService,
    PermissionCacheService,
    RolesCacheService,
    RedisCacheService,
    CacheWarmupService,
  ],
})
export class CommonModule {}
