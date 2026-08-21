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
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { ProjectRolesService } from './project-roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleDto, ProjectRoleDto } from './dto/role.dto';
import { CreateProjectRoleDto } from './dto/create-project-role.dto';
import { UpdateProjectRoleDto } from './dto/update-project-role.dto';
import { PermissionsDto } from './dto/permissions.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import {
  ProjectPermission,
  SystemPermission,
} from '../common/enums/permissions.enum';
import { AuthenticatedRequest } from '../common/types/request.types';

import { I18nContext } from 'nestjs-i18n';
@ApiTags('roles')
@Controller('roles')
@UseGuards(RolesGuard, RequireProjectPermissionGuard, PermissionsGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly projectRolesService: ProjectRolesService
  ) {}

  @Get()
  @ApiOperation({ summary: '获取所有角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取角色列表',
    type: [RoleDto],
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  async findAll(): Promise<RoleDto[]> {
    return await this.rolesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '根据 ID 获取角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取角色',
    type: RoleDto,
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  async findOne(@Param('id') id: string): Promise<RoleDto> {
    return await this.rolesService.findOne(id);
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: '获取角色的所有权限' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取角色权限',
    type: [String],
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  async getRolePermissions(@Param('id') id: string): Promise<string[]> {
    return await this.rolesService.getRolePermissions(id);
  }

  @Post(':id/permissions')
  @ApiOperation({ summary: '为角色分配权限' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功分配权限',
    type: RoleDto,
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  async addPermissions(
    @Param('id') id: string,
    @Body() body: { permissions: string[] },
    @Request() req: AuthenticatedRequest
  ): Promise<RoleDto> {
    return await this.rolesService.addPermissions(
      id,
      body.permissions,
      req.user?.id
    );
  }

  @Delete(':id/permissions')
  @ApiOperation({ summary: '从角色移除权限' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功移除权限',
    type: RoleDto,
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  async removePermissions(
    @Param('id') id: string,
    @Body() body: { permissions: string[] },
    @Request() req: AuthenticatedRequest
  ): Promise<RoleDto> {
    return await this.rolesService.removePermissions(
      id,
      body.permissions,
      req.user?.id
    );
  }

  @Post()
  @ApiOperation({ summary: '创建新角色' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建角色',
    type: RoleDto,
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_CREATE])
  async create(
    @Body() createRoleDto: CreateRoleDto,
    @Request() req: AuthenticatedRequest
  ): Promise<RoleDto> {
    return await this.rolesService.create(createRoleDto, req.user?.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新角色',
    type: RoleDto,
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_UPDATE])
  async update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @Request() req: AuthenticatedRequest
  ): Promise<RoleDto> {
    return await this.rolesService.update(id, updateRoleDto, req.user?.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功删除角色',
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_DELETE])
  async remove(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest
  ): Promise<{ message: string }> {
    await this.rolesService.remove(id, req.user?.id);
    return {
      message: I18nContext.current()?.t('success.role_deleted') ?? '角色已删除',
    };
  }

  @Get('project-roles/system')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: '获取系统默认项目角色（模板）' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取系统默认项目角色列表（仅返回 isSystem=true 的全局模板，创建项目时共享）',
    type: [ProjectRoleDto],
  })
  async getSystemProjectRoles() {
    return await this.projectRolesService.findSystemRoles();
  }

  @Get('project-roles/project/:projectId')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiOperation({ summary: '获取特定项目的角色列表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取项目角色列表（包含系统角色和项目自定义角色）',
    type: [ProjectRoleDto],
  })
  async getProjectRolesByProject(@Param('projectId') projectId: string) {
    return await this.projectRolesService.findByProject(projectId);
  }

  @Post('project-roles')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_CREATE])
  @ApiOperation({ summary: '创建项目角色' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建项目角色',
    type: ProjectRoleDto,
  })
  async createProjectRole(
    @Body() dto: CreateProjectRoleDto,
    @Request() req: AuthenticatedRequest
  ) {
    // #298 方案 A：旧端点仅允许创建系统角色（projectId 为空），
    // 自定义角色（projectId 非空）只能经项目端点管理。
    // 显式非空判断：空串 "" 与未提供等价（@IsOptional @IsString 不拒空串），
    // 避免空串被误判为自定义角色或静默生成伪系统角色
    if (dto.projectId != null && dto.projectId !== '') {
      throw new ForbiddenException(
        I18nContext.current()?.t('error.auth.permission_denied') ??
          '您没有权限执行此操作'
      );
    }
    // ADR-00XX 模板化：系统端点创建的 projectId=null 角色即"项目角色模板"，
    // isSystem 必须为 true（否则不会被项目创建复制，成为不可用的死模板）
    return await this.projectRolesService.create(dto, req.user?.id, true);
  }

  @Patch('project-roles/:id')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_UPDATE])
  @ApiOperation({ summary: '更新项目角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新项目角色',
    type: ProjectRoleDto,
  })
  async updateProjectRole(
    @Param('id') id: string,
    @Body() dto: UpdateProjectRoleDto,
    @Request() req: AuthenticatedRequest
  ) {
    return await this.projectRolesService.update(id, dto, req.user?.id);
  }

  @Delete('project-roles/:id')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_DELETE])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除项目角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功删除项目角色',
  })
  async deleteProjectRole(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest
  ) {
    await this.projectRolesService.delete(id, req.user?.id);
    return {
      message:
        I18nContext.current()?.t('success.project_role_deleted') ??
        '项目角色已删除',
    };
  }

  @Post('project-roles/:id/permissions')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: '为项目角色分配权限' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功分配权限',
  })
  async addProjectRolePermissions(
    @Param('id') id: string,
    @Body() body: PermissionsDto,
    @Request() req: AuthenticatedRequest
  ) {
    await this.projectRolesService.assignPermissions(
      id,
      body.permissions,
      req.user?.id
    );
    return await this.projectRolesService.findOne(id);
  }

  @Delete('project-roles/:id/permissions')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_PERMISSION_MANAGE])
  @ApiOperation({ summary: '从项目角色移除权限' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功移除权限',
  })
  async removeProjectRolePermissions(
    @Param('id') id: string,
    @Body() body: PermissionsDto,
    @Request() req: AuthenticatedRequest
  ) {
    await this.projectRolesService.removePermissions(
      id,
      body.permissions,
      req.user?.id
    );
    return await this.projectRolesService.findOne(id);
  }
}
