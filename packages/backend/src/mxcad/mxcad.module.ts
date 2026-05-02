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
import { FileConversionService } from './services/file-conversion.service';
import { FileSystemService } from './services/file-system.service';
import { CacheManagerService } from './services/cache-manager.service';
import { FileSystemNodeService } from './services/filesystem-node.service';
import { FileUploadManagerFacadeService } from './services/file-upload-manager-facade.service';
import { ChunkUploadService } from './services/chunk-upload.service';
import { ChunkUploadManagerService } from './services/chunk-upload-manager.service';
import { FileMergeService } from './services/file-merge.service';
import { ExternalRefService } from './services/external-ref.service';
import { UploadUtilityService } from './services/upload-utility.service';
import { FileConversionUploadService } from './services/file-conversion-upload.service';
import { FileCheckService } from './services/file-check.service';
import { NodeCreationService } from './services/node-creation.service';
import { SaveAsService } from './services/save-as.service';
import { ExternalReferenceHandler } from './services/external-reference-handler.service';
import { MxcadFileHandlerService } from './services/mxcad-file-handler.service';
import { ThumbnailGenerationService } from './services/thumbnail-generation.service';
import { ExternalReferenceUpdateService } from './services/external-reference-update.service';
import { UploadOrchestrator } from './orchestrators/upload.orchestrator';
import { ConcurrencyManager } from '../common/concurrency/concurrency-manager';
import { StorageCheckService } from '../storage/storage-check.service';
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
    forwardRef(() => FileSystemModule),
    forwardRef(() => StorageModule),
    VersionControlModule,
    RolesModule,
  ],
  controllers: [MxCadController],
  providers: [
    MxCadService,
    FileConversionService,
    FileSystemService,
    CacheManagerService,
    FileSystemNodeService,
    FileUploadManagerFacadeService,
    ExternalReferenceHandler,
    MxcadFileHandlerService,
    ExternalReferenceUpdateService,
    // 新服务
    ConcurrencyManager,
    StorageCheckService,
    ChunkUploadService,
    ChunkUploadManagerService,
    FileMergeService,
    ExternalRefService,
    UploadUtilityService,
    FileConversionUploadService,
    FileCheckService,
    NodeCreationService,
    SaveAsService,
    UploadOrchestrator,
    ThumbnailGenerationService,
    // 来自 FileSystemModule 的 FileSystemService 别名
    {
      provide: 'FileSystemServiceMain',
      useExisting: MainFileSystemService,
    },
    // 权限守卫
    RequireProjectPermissionGuard,
    // 注意：异常过滤器统一使用全局 GlobalExceptionFilter，不再单独注册 MxCadExceptionFilter
  ],
  exports: [
    MxCadService,
    FileUploadManagerFacadeService,
    UploadOrchestrator,
    FileConversionService,
    FileSystemService,
    ExternalReferenceHandler,
    MxcadFileHandlerService,
    ThumbnailGenerationService,
    ExternalReferenceUpdateService,
  ],
})
export class MxCadModule {}
