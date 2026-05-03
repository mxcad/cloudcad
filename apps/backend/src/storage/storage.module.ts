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

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';
import { StorageService } from './storage.service';
import { StorageCheckService } from './storage-check.service';
import { FlydriveStorageProvider } from './flydrive-storage.provider';
import { IStorageProvider } from './interfaces/storage-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalStorageProvider,
    StorageService,
    StorageCheckService,
    {
      provide: IStorageProvider,
      useClass: FlydriveStorageProvider,
    },
  ],
  exports: [
    LocalStorageProvider,
    StorageService,
    StorageCheckService,
    IStorageProvider,
  ],
})
export class StorageModule {}
