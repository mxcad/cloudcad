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

@Module({
  imports: [ConfigModule],
  providers: [LocalStorageProvider, StorageService],
  exports: [LocalStorageProvider, StorageService],
})
export class StorageModule {}
