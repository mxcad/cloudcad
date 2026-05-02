///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { PermissionService } from './services/permission.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RolesCacheService } from './services/roles-cache.service';
import { RedisCacheService } from './services/redis-cache.service';
import { FileLockService } from './services/file-lock.service';
import { DirectoryAllocator } from './services/directory-allocator.service';
import { StorageManager } from './services/storage-manager.service';
import { FileCopyService } from './services/file-copy.service';
import { DiskMonitorService } from './services/disk-monitor.service';
import { StorageCleanupService } from './services/storage-cleanup.service';
import { StorageCleanupScheduler } from './schedulers/storage-cleanup.scheduler';

import { RoleInheritanceService } from './services/role-inheritance.service';
import { InitializationService } from './services/initialization.service';
import { FileExtensionsService } from './services/file-extensions.service';
import { UserCleanupService } from './services/user-cleanup.service';
import { UserCleanupScheduler } from './schedulers/user-cleanup.scheduler';
import { UserCleanupController } from './controllers/user-cleanup.controller';
import { ConcurrencyManager } from './concurrency/concurrency-manager';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
  ],
  providers: [
    PermissionService,
    PermissionCacheService,
    RolesCacheService,
    RedisCacheService,
    FileLockService,
    DirectoryAllocator,
    StorageManager,
    FileCopyService,
    DiskMonitorService,
    StorageCleanupService,
    StorageCleanupScheduler,
    RoleInheritanceService,
    InitializationService,
    FileExtensionsService,
    UserCleanupService,
    UserCleanupScheduler,
    ConcurrencyManager,
  ],
  controllers: [UserCleanupController],
  exports: [
    PermissionService,
    PermissionCacheService,
    RolesCacheService,
    RedisCacheService,
    FileLockService,
    DirectoryAllocator,
    StorageManager,
    FileCopyService,
    DiskMonitorService,
    StorageCleanupService,
    RoleInheritanceService,
    InitializationService,
    FileExtensionsService,
    UserCleanupService,
    ConcurrencyManager,
  ],
})
export class CommonModule {}
