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
import {
  MXCAD_CONVERSION_SERVICE,
  MXCAD_SAVE_SERVICE,
} from '../interfaces/mxcad-service-tokens';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { AppConfig } from '../../config/app.config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FilePermissionModule } from '../../file-system/file-permission/file-permission.module';
import { StorageQuotaModule } from '../../file-system/storage-quota/storage-quota.module';
import { StorageModule } from '../../storage/storage.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { RolesModule } from '../../roles/roles.module';
import { RuntimeConfigModule } from '../../runtime-config/runtime-config.module';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { ShareModule } from '../../share/share.module';
import { PermissionModule } from '../../permission/permission.module';
import { AuditLogModule } from '../../audit/audit-log.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { MxcadUploadModule } from '../upload/mxcad-upload.module';
import { FileConversionService } from '../conversion/file-conversion.service';
import { MxcadSaveService } from '../save/mxcad-save.service';
import { MxcadFileAccessController } from '../infra/mxcad-file-access.controller';
import { MxcadExternalRefController } from '../external-ref/external-ref.controller';
import { MxcadUploadController } from '../upload/mxcad-upload.controller';
import { MxcadFileHandlerService } from './mxcad-file-handler.service';
import { MxcadVersionHistoryService } from './mxcad-version-history.service';
import { MxCadRequestContextBuilder } from './mxcad-request-context-builder';
import { buildMulterChunkDir, buildMulterFilename } from './multer-path.utils';

/**
 * Mxcad 核心子模块
 *
 * 职责: 提供 MxCAD 模块的核心服务和 API 控制器。
 * 依赖所有下层子模块。
 *
 * 包含的服务:
 * - MxcadFileHandlerService: 文件流式传输服务
 * - MxCadRequestContextBuilder: 请求上下文构建（共享给子控制器）
 */

@Module({
  imports: [
    ConfigModule,
    MulterModule.registerAsync({
      imports: [ConfigModule, RuntimeConfigModule],
      inject: [ConfigService, RuntimeConfigService],
      useFactory: async (
        configService: ConfigService<AppConfig>,
        runtimeConfigService: RuntimeConfigService
      ) => {
        const config = configService.get('mxcadUploadPath', { infer: true });
        const tempPath = configService.get('mxcadTempPath', { infer: true });

        // multer 的 fileSize 是 HTTP 层的粗粒度防护网，业务层精确限制由运行时配置
        // maxFileSize 实时校验（checkChunkExist 等）。此处上限 = max(运行时 maxFileSize, 固定安全下限)，
        // 确保上限始终不低于配置，调大 maxFileSize 即可放行，multer 永不收紧到配置之下。
        const runtimeMaxFileSizeMB = await runtimeConfigService.getValue<number>('maxFileSize', 500);
        const runtimeMaxBytes = runtimeMaxFileSizeMB * 1024 * 1024;
        const safetyCeilingBytes = 512 * 1024 * 1024; // 固定兜底，防错误配置导致 multer 成为更紧的限制
        const maxFileSize = Math.max(runtimeMaxBytes, safetyCeilingBytes);

        return {
          storage: diskStorage({
            destination: (req, file, cb) => {
              if (req.body.chunk !== undefined) {
                // 路径遍历防护：hash 来自客户端（DTO 校验晚于本回调），basename 剥离路径段
                const tmpDir = buildMulterChunkDir(tempPath, req.body.hash);
                fs.mkdirSync(tmpDir, { recursive: true });
                cb(null, tmpDir);
              } else {
                fs.mkdirSync(config, { recursive: true });
                cb(null, config);
              }
            },
            filename: (req, file, cb) => {
              // 路径遍历防护：hash/chunk/originalname 均经 basename 剥离路径段
              cb(null, buildMulterFilename(req.body, file.originalname));
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
    DatabaseModule,
    CommonModule,
    RuntimeConfigModule,
    FileSystemModule,
    FilePermissionModule,
    StorageQuotaModule,
    StorageModule,
    VersionControlModule,
    RolesModule,
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
    ShareModule,
    PermissionModule,
    AuditLogModule,
    MxcadInfraModule,
    MxcadConversionModule,
    MxcadNodeModule,
    MxcadExternalRefModule,
    MxcadSaveModule,
    MxcadUploadModule,
  ],
  controllers: [MxcadFileAccessController, MxcadExternalRefController, MxcadUploadController],
  providers: [
    MxcadFileHandlerService,
    MxcadVersionHistoryService,
    MxCadRequestContextBuilder,
    { provide: MXCAD_CONVERSION_SERVICE, useExisting: FileConversionService },
    { provide: MXCAD_SAVE_SERVICE, useExisting: MxcadSaveService },
  ],
  exports: [
    MxcadFileHandlerService,
    MxCadRequestContextBuilder,
    MXCAD_CONVERSION_SERVICE,
    MXCAD_SAVE_SERVICE,
  ],
})
export class MxcadCoreModule {}
