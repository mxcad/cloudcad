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
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import * as fs from 'fs';
import { DatabaseModule } from '../../database/database.module';
import { AppConfig } from '../../config/app.config';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FilePermissionModule } from '../../file-system/file-permission/file-permission.module';
import { StorageQuotaModule } from '../../file-system/storage-quota/storage-quota.module';
import { StorageModule } from '../../storage/storage.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { RolesModule } from '../../roles/roles.module';
import { RuntimeConfigModule } from '../../runtime-config/runtime-config.module';
import { ShareModule } from '../../share/share.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { MxcadUploadModule } from '../upload/mxcad-upload.module';
import { MxCadService } from './mxcad.service';
import { MxcadFileHandlerService } from './mxcad-file-handler.service';
import { MxCadController } from './mxcad.controller';
import { MxCadRequestContextBuilder } from './mxcad-request-context-builder';
import { ThumbnailController } from '../infra/thumbnail.controller';
import { SaveController } from '../save/save.controller';

/**
 * Mxcad 核心子模块
 *
 * 职责: 提供 MxCAD 模块的核心服务和 API 控制器。
 * 依赖所有下层子模块。
 *
 * 包含的服务:
 * - MxCadService: CAD 文件操作主入口
 * - MxcadFileHandlerService: 文件流式传输服务
 * - MxCadRequestContextBuilder: 请求上下文构建（共享给子控制器）
 * - MxCadController: 所有上传/下载/转换 API
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CommonModule,
    RuntimeConfigModule,
    FileSystemModule,
    FilePermissionModule,
    StorageQuotaModule,
    StorageModule,
    VersionControlModule,
    RolesModule,
    JwtModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService<AppConfig>) => {
        const config = configService.get('mxcadUploadPath', { infer: true });
        const tempPath = configService.get('mxcadTempPath', { infer: true });
        const maxFileSize = 500 * 1024 * 1024; // 500MB

        return {
          storage: diskStorage({
            destination: (req, file, cb) => {
              if (req.body.chunk !== undefined) {
                const fileMd5 = req.body.hash;
                const tmpDir = join(tempPath, `chunk_${fileMd5}`);
                fs.mkdirSync(tmpDir, { recursive: true });
                cb(null, tmpDir);
              } else {
                fs.mkdirSync(config, { recursive: true });
                cb(null, config);
              }
            },
            filename: (req, file, cb) => {
              const fileMd5 = req.body.hash;
              if (req.body.chunk !== undefined) {
                cb(null, `${req.body.chunk}_${fileMd5}`);
              } else if (fileMd5) {
                const ext = file.originalname.split('.').pop();
                cb(null, `${fileMd5}.${ext}`);
              } else {
                cb(null, file.originalname);
              }
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
    ShareModule,
    MxcadInfraModule,
    MxcadConversionModule,
    MxcadNodeModule,
    MxcadExternalRefModule,
    MxcadSaveModule,
    MxcadUploadModule,
  ],
  controllers: [MxCadController, ThumbnailController, SaveController],
  providers: [
    MxCadService,
    MxcadFileHandlerService,
    MxCadRequestContextBuilder,
  ],
  exports: [
    MxCadService,
    MxcadFileHandlerService,
    MxCadRequestContextBuilder,
  ],
})
export class MxcadCoreModule {}
