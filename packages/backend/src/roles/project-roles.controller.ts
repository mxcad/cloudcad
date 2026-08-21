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

import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { I18nContext } from 'nestjs-i18n';
import { ProjectRolesService } from './project-roles.service';
import { CreateProjectRoleDto } from './dto/create-project-role.dto';
import { UpdateProjectRoleDto } from './dto/update-project-role.dto';
import { ProjectRoleDto } from './dto/role.dto';
import { PermissionsDto } from './dto/permissions.dto';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { AuthenticatedRequest } from '../common/types/request.types';

/**
 * 项目角色管理 Controller（项目权限域）
 *
 * 与 RolesController 的分工：
 * - 本 Controller 处理「项目内自定义角色」管理，权限由项目权限
 *   PROJECT_ROLE_MANAGE / PROJECT_ROLE_PERMISSION_MANAGE 控制，
 *   项目所有者与项目管理员（含默认 ADMIN 角色）可操作。
 * - RolesController 保留系统级项目角色管理（system 角色 CRUD 等），
 *   权限由系统权限 SYSTEM_ROLE_* 控制（#262）。
 *
 * projectId 一律取自 URL 路径（body 中的 projectId 被忽略），
 * 防止跨项目越权；角色归属校验由 ProjectRolesService 完成。
 */
@ApiTags('projects')
@Controller('projects')
@UseGuards(RequireProjectPermissionGuard)
@ApiBearerAuth()
export class ProjectRolesController {
  constructor(private readonly projectRolesService: ProjectRolesService) {}

  @Post(':projectId/project-roles')
  @RequireProjectPermission(ProjectPermission.PROJECT_ROLE_MANAGE)
  @ApiOperation({ summary: '创建项目自定义角色' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建项目角色',
    type: ProjectRoleDto,
  })
  async createProjectRole(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectRoleDto,
    @Request() req: AuthenticatedRequest
  ) {
    return await this.projectRolesService.create(
      { ...dto, projectId },
      req.user?.id
    );
  }

  @Patch(':projectId/project-roles/:id')
  // body 支持 permissions 全量替换 → 需同时具备角色管理与权限配置权限（#262 review 修复）
  @RequireProjectPermission([
    ProjectPermission.PROJECT_ROLE_MANAGE,
    ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
  ])
  @ApiOperation({ summary: '更新项目自定义角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新项目角色',
    type: ProjectRoleDto,
  })
  async updateProjectRole(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectRoleDto,
    @Request() req: AuthenticatedRequest
  ) {
    return await this.projectRolesService.update(
      id,
      dto,
      req.user?.id,
      projectId
    );
  }

  @Delete(':projectId/project-roles/:id')
  @RequireProjectPermission(ProjectPermission.PROJECT_ROLE_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除项目自定义角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功删除项目角色',
  })
  async deleteProjectRole(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest
  ) {
    await this.projectRolesService.delete(id, req.user?.id, projectId);
    return {
      message:
        I18nContext.current()?.t('success.project_role_deleted') ??
        '项目角色已删除',
    };
  }

  @Post(':projectId/project-roles/:id/permissions')
  @RequireProjectPermission(ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE)
  @ApiOperation({ summary: '为项目自定义角色分配权限' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功分配权限',
    type: ProjectRoleDto,
  })
  async addProjectRolePermissions(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: PermissionsDto,
    @Request() req: AuthenticatedRequest
  ) {
    await this.projectRolesService.assignPermissions(
      id,
      body.permissions,
      req.user?.id,
      projectId
    );
    return await this.projectRolesService.findOne(id);
  }

  @Delete(':projectId/project-roles/:id/permissions')
  @RequireProjectPermission(ProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE)
  @ApiOperation({ summary: '从项目自定义角色移除权限' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功移除权限',
    type: ProjectRoleDto,
  })
  async removeProjectRolePermissions(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() body: PermissionsDto,
    @Request() req: AuthenticatedRequest
  ) {
    await this.projectRolesService.removePermissions(
      id,
      body.permissions,
      req.user?.id,
      projectId
    );
    return await this.projectRolesService.findOne(id);
  }
}
