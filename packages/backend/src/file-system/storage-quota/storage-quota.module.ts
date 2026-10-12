///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { StorageManagementModule } from '../../storage-management/storage-management.module';
import { StorageInfoService } from './storage-info.service';
import { NodeSizeResolverService } from './node-size-resolver.service';
import { IQuotaCacheInvalidator } from '../../common/interfaces/quota-cache-invalidator';

@Module({
  imports: [DatabaseModule, ConfigModule, StorageManagementModule],
  providers: [
    StorageInfoService,
    NodeSizeResolverService,
    // 配额缓存失效 seam 绑定（vip 侧 MembershipService 经 @Optional() 注入本 token）
    { provide: IQuotaCacheInvalidator, useExisting: StorageInfoService },
  ],
  exports: [StorageInfoService, NodeSizeResolverService, IQuotaCacheInvalidator],
})
export class StorageQuotaModule {}
