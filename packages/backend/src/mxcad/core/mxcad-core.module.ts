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
import { ConfigModule } from '@nestjs/config';
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
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadFacadeModule } from '../facade/mxcad-facade.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { MxCadService } from './mxcad.service';
import { MxcadFileHandlerService } from './mxcad-file-handler.service';
import { MxCadController } from './mxcad.controller';

/**
 * Mxcad 核心子模块
 *
 * 职责: 提供 MxCAD 模块的核心服务和 API 控制器。
 * 依赖所有下层子模块。
 *
 * 包含的服务:
 * - MxCadService: CAD 文件操作主入口
 * - MxcadFileHandlerService: 文件流式传输服务
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
    MxcadInfraModule,
    MxcadConversionModule,
    MxcadNodeModule,
    MxcadExternalRefModule,
    MxcadFacadeModule,
    MxcadSaveModule,
  ],
  controllers: [MxCadController],
  providers: [
    MxCadService,
    MxcadFileHandlerService,
  ],
  exports: [
    MxCadService,
    MxcadFileHandlerService,
  ],
})
export class MxcadCoreModule {}
