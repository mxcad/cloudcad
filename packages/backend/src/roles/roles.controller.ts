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
import { RoleDto } from './dto/role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SystemPermission } from '../common/enums/permissions.enum';

@ApiTags('roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
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

  @Get('category/:category')
  @ApiOperation({ summary: '根据类别获取角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取角色列表',
    type: [RoleDto],
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  async findByCategory(
    @Param('category') category: string
  ): Promise<RoleDto[]> {
    return await this.rolesService.findByCategory(category as any);
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
    @Body() body: { permissions: string[] }
  ): Promise<RoleDto> {
    return await this.rolesService.addPermissions(id, body.permissions);
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
    @Body() body: { permissions: string[] }
  ): Promise<RoleDto> {
    return await this.rolesService.removePermissions(id, body.permissions);
  }

  @Post()
  @ApiOperation({ summary: '创建新角色' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建角色',
    type: RoleDto,
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_CREATE])
  async create(@Body() createRoleDto: CreateRoleDto): Promise<RoleDto> {
    return await this.rolesService.create(createRoleDto);
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
    @Body() updateRoleDto: UpdateRoleDto
  ): Promise<RoleDto> {
    return await this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功删除角色',
  })
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_DELETE])
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.rolesService.remove(id);
    return { message: '角色已删除' };
  }

  @Get('project-roles/all')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: '获取所有项目角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取所有项目角色列表',
  })
  async getAllProjectRoles() {
    return await this.projectRolesService.findAll();
  }

  @Get('project-roles/system')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: '获取系统默认项目角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取系统默认项目角色列表（仅返回 isSystem=true 的角色）',
  })
  async getSystemProjectRoles() {
    return await this.projectRolesService.findSystemRoles();
  }

  @Get('project-roles/project/:projectId')
  @ApiOperation({ summary: '获取特定项目的角色列表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取项目角色列表（包含系统角色和项目自定义角色）',
  })
  async getProjectRolesByProject(@Param('projectId') projectId: string) {
    return await this.projectRolesService.findByProject(projectId);
  }

  @Get('project-roles/:id')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: '获取项目角色详情' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取项目角色',
  })
  async getProjectRole(@Param('id') id: string) {
    return await this.projectRolesService.findOne(id);
  }

  @Get('project-roles/:id/permissions')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_READ])
  @ApiOperation({ summary: '获取项目角色的所有权限' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取角色权限',
    type: [String],
  })
  async getProjectRolePermissions(@Param('id') id: string) {
    return await this.projectRolesService.getRolePermissions(id);
  }

  @Post('project-roles')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_CREATE])
  @ApiOperation({ summary: '创建项目角色' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建项目角色',
  })
  async createProjectRole(@Body() dto: any, @Request() req) {
    return await this.projectRolesService.create(dto, req.user?.id);
  }

  @Patch('project-roles/:id')
  @RequirePermissions([SystemPermission.SYSTEM_ROLE_UPDATE])
  @ApiOperation({ summary: '更新项目角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新项目角色',
  })
  async updateProjectRole(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req
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
  async deleteProjectRole(@Param('id') id: string, @Request() req) {
    await this.projectRolesService.delete(id, req.user?.id);
    return { message: '项目角色已删除' };
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
    @Body() body: { permissions: string[] },
    @Request() req
  ) {
    await this.projectRolesService.assignPermissions(
      id,
      body.permissions as any,
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
    @Body() body: { permissions: string[] },
    @Request() req
  ) {
    await this.projectRolesService.removePermissions(
      id,
      body.permissions as any,
      req.user?.id
    );
    return await this.projectRolesService.findOne(id);
  }
}
