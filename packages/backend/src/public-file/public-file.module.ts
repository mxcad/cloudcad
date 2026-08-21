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
        // multer 的 fileSize 是 HTTP 层粗粒度防护网，业务层精确限制由运行时配置 maxFileSize
        // 实时校验（public-file.controller 等）。此处上限 = max(运行时 maxFileSize, 固定安全下限)，
        // 确保 multer 永不收紧到配置之下，调大 maxFileSize 即可放行。
        const runtimeMaxFileSizeMB = await runtimeConfigService.getValue<number>('maxFileSize', 500);
        const runtimeMaxBytes = runtimeMaxFileSizeMB * 1024 * 1024;
        const safetyCeilingBytes = 512 * 1024 * 1024; // 固定兜底，防错误配置导致 multer 成为更紧的限制
        const fileSize = Math.max(runtimeMaxBytes, safetyCeilingBytes);
        return {
          storage: memoryStorage(),
          limits: {
            fileSize,
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
