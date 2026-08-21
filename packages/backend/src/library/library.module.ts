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
import { diskStorage } from 'multer';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from '../config/app.config';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { MxcadCoreModule } from '../mxcad/core/mxcad-core.module';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { CommonModule } from '../common/common.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageManagementModule } from '../storage-management/storage-management.module';
import { DatabaseModule } from '../database/database.module';
import { FileOperationsModule } from '../file-operations/file-operations.module';
import { NodeTrashService } from '../file-operations/node-trash.service';
import { ProjectCrudService } from '../file-operations/project-crud.service';
import { FileTreeModule } from '../file-system/file-tree/file-tree.module';
import { FileDownloadModule } from '../file-system/file-download/file-download.module';
import { StorageQuotaModule } from '../file-system/storage-quota/storage-quota.module';
import { DatabaseService } from '../database/database.service';
import {
  createDrawingLibraryProvider,
  createBlockLibraryProvider,
  PUBLIC_LIBRARY_PROVIDER_DRAWING,
  PUBLIC_LIBRARY_PROVIDER_BLOCK,
} from './services/public-library.service';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    RuntimeConfigModule,
    FileOperationsModule,
    FileTreeModule,
    FileDownloadModule,
    StorageQuotaModule,
    MxcadCoreModule,
    PermissionModule,
    StorageManagementModule,
    // library 上传文件可能达数百 MB（CAD 图纸），必须 diskStorage 落盘，
    // 否则默认 memoryStorage 将文件全量载入 file.buffer，并发上传会导致 OOM。
    // 临时文件由 LibraryService 处理后删除（saveLibraryAs / saveLibraryNode）。
    MulterModule.registerAsync({
      imports: [ConfigModule, RuntimeConfigModule],
      inject: [ConfigService, RuntimeConfigService],
      useFactory: async (
        configService: ConfigService<AppConfig>,
        runtimeConfigService: RuntimeConfigService
      ) => {
        const tempPath =
          (configService.get('mxcadTempPath', { infer: true }) as string) ||
          path.join(process.cwd(), 'data', 'temp');

        // multer 的 fileSize 是 HTTP 层粗粒度防护网，业务层精确限制由运行时配置 maxFileSize
        // 实时校验（LibraryService 等）。此处上限 = max(运行时 maxFileSize, 固定安全下限)，
        // 确保 multer 永不收紧到配置之下，调大 maxFileSize 即可放行。
        const runtimeMaxFileSizeMB = await runtimeConfigService.getValue<number>('maxFileSize', 500);
        const runtimeMaxBytes = runtimeMaxFileSizeMB * 1024 * 1024;
        const safetyCeilingBytes = 512 * 1024 * 1024; // 固定兜底，防错误配置导致 multer 成为更紧的限制
        const maxFileSize = Math.max(runtimeMaxBytes, safetyCeilingBytes);

        return {
          storage: diskStorage({
            destination: (_req, _file, cb) => {
              fs.mkdirSync(tempPath, { recursive: true });
              cb(null, tempPath);
            },
            filename: (_req, file, cb) => {
              const ext =
                path.extname(file.originalname).toLowerCase() || '.mxweb';
              cb(null, `library_${Date.now()}_${randomBytes(8).toString('hex')}${ext}`);
            },
          }),
          limits: {
            fileSize: maxFileSize,
            fields: 20,
            fieldSize: 10 * 1024 * 1024,
          },
        };
      },
    }),
  ],
  controllers: [LibraryController],
  providers: [
    LibraryService,
    {
      provide: PUBLIC_LIBRARY_PROVIDER_DRAWING,
      useFactory: (prisma, projectCrudService, nodeTrashService) =>
        createDrawingLibraryProvider(prisma, projectCrudService, nodeTrashService),
      inject: [DatabaseService, ProjectCrudService, NodeTrashService],
    },
    {
      provide: PUBLIC_LIBRARY_PROVIDER_BLOCK,
      useFactory: (prisma, projectCrudService, nodeTrashService) =>
        createBlockLibraryProvider(prisma, projectCrudService, nodeTrashService),
      inject: [DatabaseService, ProjectCrudService, NodeTrashService],
    },
  ],
  exports: [LibraryService],
})
export class LibraryModule {}
