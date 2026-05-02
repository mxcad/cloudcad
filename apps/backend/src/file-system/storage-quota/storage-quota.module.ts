///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { RuntimeConfigModule } from '../../runtime-config/runtime-config.module';
import { StorageQuotaService } from './storage-quota.service';
import { StorageInfoService } from './storage-info.service';
import { QuotaEnforcementService } from './quota-enforcement.service';

/**
 * 存储配额子模块
 *
 * 职责: 统一管理个人空间、项目、公共资源库三种存储配额。
 *
 * 服务链:
 * - StorageQuotaService: 配额类型判定 + 上限计算（最底层，仅依赖 RuntimeConfigService）
 * - StorageInfoService: 已用空间计算 + 配额缓存（依赖 StorageQuotaService + DatabaseService）
 * - QuotaEnforcementService: 上传前配额检查（依赖 StorageInfoService）
 */
@Module({
  imports: [DatabaseModule, ConfigModule, RuntimeConfigModule],
  providers: [StorageQuotaService, StorageInfoService, QuotaEnforcementService],
  exports: [StorageQuotaService, StorageInfoService, QuotaEnforcementService],
})
export class StorageQuotaModule {}
