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

@Module({
  imports: [DatabaseModule, ConfigModule, StorageManagementModule],
  providers: [StorageInfoService, NodeSizeResolverService],
  exports: [StorageInfoService, NodeSizeResolverService],
})
export class StorageQuotaModule {}
