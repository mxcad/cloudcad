///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { ProjectPermissionService } from './project-permission.service';
import { ProjectRolesService } from './project-roles.service';
import { CommonModule } from '../common/common.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';

@Module({
  imports: [CommonModule, AuditLogModule],
  controllers: [RolesController],
  providers: [
    RolesService,
    ProjectPermissionService,
    ProjectRolesService,
    RequireProjectPermissionGuard,
  ],
  exports: [
    RolesService,
    ProjectPermissionService,
    ProjectRolesService,
    RequireProjectPermissionGuard,
  ],
})
export class RolesModule {}
