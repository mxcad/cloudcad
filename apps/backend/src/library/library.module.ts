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

import { Module, forwardRef } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import * as fs from 'fs';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { FileSystemModule } from '../file-system/file-system.module';
import { CommonModule } from '../common/common.module';
import { RolesModule } from '../roles/roles.module';
import { DatabaseModule } from '../database/database.module';
import { MxCadModule } from '../mxcad/mxcad.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';

/**
 * 公共资源库模块
 *
 * 复用文件系统的实现，提供图纸库和图块库功能
 * - 图纸库：libraryKey = 'drawing'
 * - 图块库：libraryKey = 'block'
 */
@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    FileSystemModule,
    RolesModule,
    RuntimeConfigModule,
    forwardRef(() => MxCadModule),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const config = configService.get('mxcadUploadPath', { infer: true });
        // 确保目录存在
        if (config && !fs.existsSync(config)) {
          fs.mkdirSync(config, { recursive: true });
        }
        return {
          storage: diskStorage({
            destination: config,
            filename: (req, file, cb) => {
              const fileMd5 = req.body.hash;
              if (fileMd5) {
                const ext = file.originalname.split('.').pop();
                cb(null, `${fileMd5}.${ext}`);
              } else {
                cb(null, file.originalname);
              }
            },
          }),
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
