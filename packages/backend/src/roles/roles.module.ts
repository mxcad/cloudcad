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
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { ProjectRolesController } from './project-roles.controller';
import { ProjectPermissionService } from './project-permission.service';
import { ProjectRolesService } from './project-roles.service';
import { CommonModule } from '../common/common.module';
import { PermissionModule } from '../permission/permission.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { FileTreeModule } from '../file-system/file-tree/file-tree.module';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { NodeContextResolver } from '../common/node-context/node-context-resolver';
import { PrismaPermissionStore } from './providers/prisma-permission-store';
import { IPERMISSION_STORE } from '../common/interfaces/permission-store.interface';
import { IPROJECT_PERMISSION_SERVICE } from './interfaces/project-permission-service.interface';

const PERMISSION_STORE_TOKEN = {
  prisma: PrismaPermissionStore,
};

@Module({
  imports: [CommonModule, AuditLogModule, ConfigModule, FileTreeModule, PermissionModule],
  controllers: [RolesController, ProjectRolesController],
  providers: [
    RolesService,
    ProjectPermissionService,
    {
      provide: IPROJECT_PERMISSION_SERVICE,
      useClass: ProjectPermissionService,
    },
    ProjectRolesService,
    RequireProjectPermissionGuard,
    NodeContextResolver,
    PrismaPermissionStore,
    {
      provide: IPERMISSION_STORE,
      useClass: PERMISSION_STORE_TOKEN[process.env.PERMISSION_STORE || 'prisma'] || PrismaPermissionStore,
    },
  ],
  exports: [
    RolesService,
    ProjectPermissionService,
    IPROJECT_PERMISSION_SERVICE,
    ProjectRolesService,
    RequireProjectPermissionGuard,
    IPERMISSION_STORE,
    NodeContextResolver,
  ],
})
export class RolesModule {}
