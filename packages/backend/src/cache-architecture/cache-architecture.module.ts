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
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';

// Providers
import { L1CacheProvider } from './providers/l1-cache.provider';
import { L2CacheProvider } from './providers/l2-cache.provider';
import { L3CacheProvider } from './providers/l3-cache.provider';

// Services
import { MultiLevelCacheService } from './services/multi-level-cache.service';
import { CacheWarmupService } from './services/cache-warmup.service';
import { CacheMonitorService } from './services/cache-monitor.service';
import { CacheVersionService } from './services/cache-version.service';

// Controllers
import { CacheMonitorController } from './controllers/cache-monitor.controller';

/**
 * 缓存架构模块
 * 提供三级缓存架构（L1 内存、L2 Redis、L3 数据库）
 *
 * 功能：
 * - 三级缓存管理
 * - 智能缓存预热
 * - 实时性能监控
 * - 缓存健康检查
 * - 热点数据识别
 */
@Global()
@Module({
  imports: [ConfigModule, ScheduleModule.forRoot()],
  controllers: [CacheMonitorController],
  providers: [
    // 缓存提供者
    L1CacheProvider,
    L2CacheProvider,
    L3CacheProvider,

    // 缓存服务
    MultiLevelCacheService,
    CacheWarmupService,
    CacheMonitorService,
    CacheVersionService,

    // DatabaseService
    DatabaseService,
  ],
  exports: [
    // 导出缓存提供者
    L1CacheProvider,
    L2CacheProvider,
    L3CacheProvider,

    // 导出缓存服务
    MultiLevelCacheService,
    CacheWarmupService,
    CacheMonitorService,
    CacheVersionService,
  ],
})
export class CacheArchitectureModule {
  /**
   * 模块初始化
   */
  onModuleInit() {
    // 可以在这里执行模块初始化逻辑
    console.log('CacheArchitectureModule 已初始化');
  }
}
