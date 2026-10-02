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
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { PublicFileController } from './public-file.controller';
import { PublicFileService } from './public-file.service';
import { PublicFileUploadService } from './services/public-file-upload.service';
import { CommonModule } from '../common/common.module';
import { StorageManagementModule } from '../storage-management/storage-management.module';
import { MxcadCoreModule } from '../mxcad/core/mxcad-core.module';
import { MxcadConversionModule } from '../mxcad/conversion/mxcad-conversion.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { buildMulterUploadLimits } from '../common/utils/multer-upload-limits';

@Module({
  imports: [
    CommonModule,
    StorageManagementModule,
    MxcadCoreModule,
    MxcadConversionModule,
    RuntimeConfigModule,
    MulterModule.registerAsync({
      imports: [ConfigModule, RuntimeConfigModule],
      inject: [ConfigService, RuntimeConfigService],
      useFactory: async (configService: ConfigService, runtimeConfigService: RuntimeConfigService) => {
        return {
          storage: memoryStorage(),
          limits: {
            ...(await buildMulterUploadLimits(runtimeConfigService)),
            fields: 20,
            fieldSize: 1024 * 1024,
          },
        };
      },
    }),
  ],
  controllers: [PublicFileController],
  providers: [PublicFileService, PublicFileUploadService],
  exports: [PublicFileService, PublicFileUploadService],
})
export class PublicFileModule {}
