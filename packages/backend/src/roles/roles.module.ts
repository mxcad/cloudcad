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

import { Module, forwardRef } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { ProjectPermissionService } from './project-permission.service';
import { ProjectRolesService } from './project-roles.service';
import { CommonModule } from '../common/common.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { FileSystemModule } from '../file-system/file-system.module';

@Module({
  imports: [
    CommonModule,
    AuditLogModule,
    forwardRef(() => FileSystemModule),
  ],
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
