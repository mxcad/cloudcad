///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { FileSystemController } from './file-system.controller';
import { FileSystemService } from './file-system.service';
import { FileHashModule } from './file-hash/file-hash.module';
import { FileValidationModule } from './file-validation/file-validation.module';
import { StorageQuotaModule } from './storage-quota/storage-quota.module';
import { FileTreeModule } from './file-tree/file-tree.module';
import { FilePermissionModule } from './file-permission/file-permission.module';
import { FileDownloadHandlerService } from './file-download-handler.service';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { RolesModule } from '../roles/roles.module';
import { VersionControlModule } from '../version-control/version-control.module';
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';
import { PersonalSpaceModule } from '../personal-space/personal-space.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import {
  FileDownloadExportService,
  ProjectMemberService,
  SearchService,
} from './services';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    StorageModule,
    AuditLogModule,
    RolesModule,
    VersionControlModule,
    RuntimeConfigModule,
    PersonalSpaceModule,
    FileHashModule,
    FileValidationModule,
    StorageQuotaModule,
    FileTreeModule,
    FilePermissionModule,
  ],
  controllers: [FileSystemController],
  providers: [
    FileSystemService,
    FileDownloadHandlerService,
    RequireProjectPermissionGuard,
    FileDownloadExportService,
    ProjectMemberService,
    SearchService,
  ],
  exports: [
    FileSystemService,
    FileHashModule,
    FileValidationModule,
    StorageQuotaModule,
    FileTreeModule,
    FilePermissionModule,
    FileDownloadHandlerService,
    FileDownloadExportService,
    ProjectMemberService,
    SearchService,
  ],
})
export class FileSystemModule {}
