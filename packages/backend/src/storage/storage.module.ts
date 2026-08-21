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
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';
import { StorageService } from './storage.service';
import { FlydriveStorageProvider } from './flydrive-storage.provider';
import { HttpStorageProvider } from './http-storage.provider';
import { UploadTokenService } from './upload-token.service';
import { UploadTokenController } from './upload-token.controller';
import { IStorageProvider } from './interfaces/storage-provider.interface';
import { IStorageService } from './interfaces/storage-service.interface';

@Module({
  imports: [ConfigModule],
  controllers: [UploadTokenController],
  providers: [
    LocalStorageProvider,
    StorageService,
    FlydriveStorageProvider,
    HttpStorageProvider,
    UploadTokenService,
    {
      provide: IStorageProvider,
      useFactory: (
        configService: ConfigService,
        flydrive: FlydriveStorageProvider,
        http: HttpStorageProvider,
      ) => {
        const mode = configService.get<string>('STORAGE_MODE') || 'embedded';
        return mode === 'standalone' ? http : flydrive;
      },
      inject: [ConfigService, FlydriveStorageProvider, HttpStorageProvider],
    },
    {
      provide: IStorageService,
      useClass: StorageService,
    },
  ],
  exports: [
    LocalStorageProvider,
    StorageService,
    UploadTokenService,
    IStorageProvider,
    IStorageService,
  ],
})
export class StorageModule {}
