///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RolesModule } from '../../roles/roles.module';
import { FileTreeModule } from '../file-tree/file-tree.module';
import { FileSystemPermissionService } from './file-system-permission.service';

/**
 * 文件权限子模块
 *
 * 职责: 文件系统节点权限检查、项目成员角色管理。
 * 依赖: DatabaseModule, RolesModule (ProjectPermissionService), FileTreeModule
 */
@Module({
  imports: [DatabaseModule, RolesModule, FileTreeModule],
  providers: [FileSystemPermissionService],
  exports: [FileSystemPermissionService],
})
export class FilePermissionModule {}
