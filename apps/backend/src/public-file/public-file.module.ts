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
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { join } from 'path';
import { PublicFileController } from './public-file.controller';
import { PublicFileService } from './public-file.service';
import { PublicFileUploadService } from './services/public-file-upload.service';
import { CommonModule } from '../common/common.module';
import { MxCadModule } from '../mxcad/mxcad.module';
import { AppConfig } from '../config/app.config';

@Module({
  imports: [
    CommonModule,
    MxCadModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService<AppConfig>) => {
        const tempPath = configService.get('mxcadTempPath', { infer: true });
        const maxFileSize = 500 * 1024 * 1024; // 500MB

        return {
          storage: diskStorage({
            destination: (req, file, cb) => {
              // 使用 chunk_{hash} 格式，与 FileSystemService.getChunkTempDirPath 保持一致
              const fileMd5 = req.body.hash;
              const tmpDir = join(tempPath, `chunk_${fileMd5}`);
              fs.mkdirSync(tmpDir, { recursive: true });
              cb(null, tmpDir);
            },
            filename: (req, file, cb) => {
              const fileMd5 = req.body.hash;
              // 分片文件名: {chunkIndex}_{fileHash}
              cb(null, `${req.body.chunk}_${fileMd5}`);
            },
          }),
          limits: {
            fileSize: maxFileSize,
            fields: 20,
            fieldSize: 1024 * 1024,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [PublicFileController],
  providers: [PublicFileService, PublicFileUploadService],
  exports: [PublicFileService, PublicFileUploadService],
})
export class PublicFileModule {}
