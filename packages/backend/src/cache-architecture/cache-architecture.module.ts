///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { TaskRunModule } from '../task-run/task-run.module';
import { PermissionModule } from '../permission/permission.module';
import { AlertModule } from '../alert/alert.module';

// Providers
import { L1CacheProvider } from './providers/l1-cache.provider';
import { L2CacheProvider } from './providers/l2-cache.provider';
// Services
import { MultiLevelCacheService } from './services/multi-level-cache.service';
import { CacheMonitorService } from './services/cache-monitor.service';
import { CacheVersionService } from './services/cache-version.service';

// Controllers
import { CacheMonitorController } from './controllers/cache-monitor.controller';

@Global()
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RuntimeConfigModule,
    TaskRunModule,
    PermissionModule,
    AlertModule,
  ],
  controllers: [CacheMonitorController],
  providers: [
    L1CacheProvider,
    L2CacheProvider,
    MultiLevelCacheService,
    CacheMonitorService,
    CacheVersionService,
  ],
  exports: [
    L1CacheProvider,
    L2CacheProvider,
    MultiLevelCacheService,
    CacheMonitorService,
    CacheVersionService,
  ],
})
export class CacheArchitectureModule {}
