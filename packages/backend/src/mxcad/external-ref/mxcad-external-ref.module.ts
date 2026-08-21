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
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { StorageManagementModule } from '../../storage-management/storage-management.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FileOperationsModule } from '../../file-operations/file-operations.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { AppConfig } from '../../config/app.config';
import { RuntimeConfigModule } from '../../runtime-config/runtime-config.module';
import { ExternalRefService } from './external-ref.service';
import { ExternalReferenceHandler } from './external-reference-handler.service';
import { ExternalReferenceUpdateService } from './external-reference-update.service';
import { ExtRefPreloadingService } from './ext-ref-preloading.service';
import { ExtRefValidatorService } from './ext-ref-validator.service';
import { ExternalRefFacadeService } from './external-ref-facade.service';
import { I_EXTERNAL_REF_FACADE } from './interfaces/ext-ref-facade.interface';

/**
 * Mxcad 外部参照子模块
 *
 * 职责: 提供外部参照文件的处理、访问和更新服务。
 * 对外暴露 IExternalRefFacade 单一 token，内部 4 个服务对模块外不可见。
 *
 * 包含的服务:
 * - ExternalRefService: 外部参照目录名称解析、文件拷贝
 * - ExternalReferenceHandler: 外部参照文件 HTTP 请求处理与流式传输
 * - ExternalReferenceUpdateService: 上传后外部参照信息更新
 */
@Module({
  imports: [
    ConfigModule,
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
    DatabaseModule,
    CommonModule,
    StorageManagementModule,
    FileSystemModule,
    FileOperationsModule,
    MxcadInfraModule,
    MxcadNodeModule,
    RuntimeConfigModule,
  ],
  providers: [
    ExternalReferenceUpdateService,
    ExternalRefService,
    ExternalReferenceHandler,
    ExtRefPreloadingService,
    ExtRefValidatorService,
    ExternalRefFacadeService,
    {
      provide: I_EXTERNAL_REF_FACADE,
      useExisting: ExternalRefFacadeService,
    },
  ],
  exports: [
    I_EXTERNAL_REF_FACADE,
  ],
})
export class MxcadExternalRefModule {}
