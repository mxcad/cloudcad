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
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../../common/common.module';
import { StorageManagementModule } from '../../storage-management/storage-management.module';
import { FileTreeModule } from '../../file-system/file-tree/file-tree.module';
import { FilePermissionModule } from '../../file-system/file-permission/file-permission.module';
import { FileOperationsModule } from '../../file-operations/file-operations.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { RolesModule } from '../../roles/roles.module';
import { PermissionModule } from '../../permission/permission.module';
import { MXCAD_SAVE_SERVICE } from '../interfaces/mxcad-service-tokens';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { StorageModule } from '../../storage/storage.module';
import { AuditLogModule } from '../../audit/audit-log.module';
import { StorageQuotaModule } from '../../file-system/storage-quota/storage-quota.module';
import { SaveAsService } from './save-as.service';
import { MxcadSaveService } from './mxcad-save.service';
import { SaveController } from './save.controller';

/**
 * Mxcad 保存子模块
 *
 * 职责: 提供 CAD 文件的保存和另存为功能。
 * 包括文件覆盖保存、版本控制提交和另存为新文件。
 *
 * 包含的服务:
 * - MxcadSaveService: CAD 文件覆盖保存服务
 * - SaveAsService: CAD 另存为主服务
 */
@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    CommonModule,
    StorageManagementModule,
    FileTreeModule,
    FilePermissionModule,
    FileOperationsModule,
    VersionControlModule,
    RolesModule,
    PermissionModule,
    MxcadNodeModule,
    MxcadConversionModule,
    MxcadExternalRefModule,
    StorageModule,
    AuditLogModule,
    StorageQuotaModule,
  ],
  controllers: [SaveController],
  providers: [
    SaveAsService,
    MxcadSaveService,
    { provide: MXCAD_SAVE_SERVICE, useExisting: MxcadSaveService },
  ],
  exports: [SaveAsService, MxcadSaveService],
})
export class MxcadSaveModule {}
