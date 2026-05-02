///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogModule } from '../../audit/audit-log.module';
import { FilePermissionModule } from '../file-permission/file-permission.module';
import { ProjectMemberService } from './project-member.service';

/**
 * 项目成员子模块
 *
 * 职责: 项目成员增删改查、角色管理。
 * 依赖: DatabaseModule, AuditLogModule, FilePermissionModule
 */
@Module({
  imports: [DatabaseModule, AuditLogModule, FilePermissionModule],
  providers: [ProjectMemberService],
  exports: [ProjectMemberService],
})
export class ProjectMemberModule {}
