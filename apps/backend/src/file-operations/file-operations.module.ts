///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { VersionControlModule } from '../version-control/version-control.module';
import { PersonalSpaceModule } from '../personal-space/personal-space.module';
import { FileSystemModule } from '../file-system/file-system.module';
import { FileOperationsService } from './file-operations.service';
import { ProjectCrudService } from './project-crud.service';

/**
 * 文件操作子模块
 *
 * 职责: 文件移动/复制/删除/重命名/批量操作，项目/文件夹 CRUD。
 * 依赖: FileTreeService, StorageInfoService, FileSystemPermissionService
 */
@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    VersionControlModule,
    PersonalSpaceModule,
    FileSystemModule,
  ],
  providers: [FileOperationsService, ProjectCrudService],
  exports: [FileOperationsService, ProjectCrudService],
})
export class FileOperationsModule {}