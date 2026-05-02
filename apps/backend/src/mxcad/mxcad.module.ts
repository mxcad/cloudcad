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
import { MxCadController } from './mxcad.controller';
import { MxCadService } from './mxcad.service';
import { MxcadInfraModule } from './infra/mxcad-infra.module';
import { MxcadConversionModule } from './conversion/mxcad-conversion.module';
import { MxcadChunkModule } from './chunk/mxcad-chunk.module';
import { MxcadNodeModule } from './node/mxcad-node.module';
import { MxcadExternalRefModule } from './external-ref/mxcad-external-ref.module';
import { MxcadFacadeModule } from './facade/mxcad-facade.module';
import { MxcadSaveModule } from './save/mxcad-save.module';
import { MxcadUploadModule } from './upload/mxcad-upload.module';
import { FileUploadManagerFacadeService } from './facade/file-upload-manager-facade.service';
import { MxcadFileHandlerService } from './services/mxcad-file-handler.service';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import * as fs from 'fs';
import { DatabaseModule } from '../database/database.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FileSystemModule } from '../file-system/file-system.module';
import { FileSystemService as MainFileSystemService } from '../file-system/file-system.service';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { VersionControlModule } from '../version-control/version-control.module';
import { RolesModule } from '../roles/roles.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { AppConfig } from '../config/app.config';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    ConfigModule,
    RuntimeConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService<AppConfig>) => ({
        secret: configService.get('jwt.secret', { infer: true }),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn', { infer: true }),
        },
      }),
      inject: [ConfigService],
    }),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService<AppConfig>) => {
        const config = configService.get('mxcadUploadPath', { infer: true });
        const tempPath = configService.get('mxcadTempPath', { infer: true });
        // Multer 层使用固定上限值 500MB
        // 业务层的精确限制由 FileValidationService 使用运行时配置 maxFileSize 实现
        const maxFileSize = 500 * 1024 * 1024; // 500MB

        return {
          storage: diskStorage({
            destination: (req, file, cb) => {
              if (req.body.chunk !== undefined) {
                // 分片文件存放位置
                const fileMd5 = req.body.hash;
                const tmpDir = join(tempPath, `chunk_${fileMd5}`);
                fs.mkdirSync(tmpDir, { recursive: true });
                cb(null, tmpDir);
              } else {
                // 完整文件存放位置
                fs.mkdirSync(config, { recursive: true });
                cb(null, config);
              }
            },
            filename: (req, file, cb) => {
              const fileMd5 = req.body.hash;
              if (req.body.chunk !== undefined) {
                // 分片文件名: {chunkIndex}_{fileHash}
                cb(null, `${req.body.chunk}_${fileMd5}`);
              } else if (fileMd5) {
                // 完整文件名: {fileHash}.{ext}
                const ext = file.originalname.split('.').pop();
                cb(null, `${fileMd5}.${ext}`);
              } else {
                // 没有 hash 参数时，使用原始文件名
                cb(null, file.originalname);
              }
            },
          }),
          // 确保所有字段都被解析，包括非文件字段
          limits: {
            fileSize: maxFileSize,
            fields: 20, // 允许最多20个字段
            fieldSize: 1024 * 1024, // 每个字段最大1MB
          },
        };
      },
      inject: [ConfigService],
    }),
    MxcadInfraModule,
    MxcadConversionModule,
    MxcadChunkModule,
    MxcadNodeModule,
    MxcadExternalRefModule,
    MxcadFacadeModule,
    MxcadSaveModule,
    MxcadUploadModule,
    forwardRef(() => FileSystemModule),
    forwardRef(() => StorageModule),
    VersionControlModule,
    RolesModule,
  ],
  controllers: [MxCadController],
  providers: [
    MxcadService,
    FileUploadManagerFacadeService,
    MxcadFileHandlerService,
    // 来自 FileSystemModule 的 FileSystemService 别名
    {
      provide: 'FileSystemServiceMain',
      useExisting: MainFileSystemService,
    },
    // 权限守卫
    RequireProjectPermissionGuard,
    // 注意：异常过滤器统一使用全局 GlobalExceptionFilter，不再单独注册 MxcadExceptionFilter
  ],
  exports: [
    MxCadService,
    FileUploadManagerFacadeService,
    MxcadFileHandlerService,
  ],
})
export class MxCadModule {}
