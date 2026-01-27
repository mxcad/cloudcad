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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleDto } from './dto/role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permission } from '../common/enums/permissions.enum';

@ApiTags('roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: '获取所有角色' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取角色列表',
    type: [RoleDto],
  })
  @RequirePermissions([Permission.USER_READ])
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
  @RequirePermissions([Permission.USER_READ])
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
  @RequirePermissions([Permission.USER_READ])
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
  @RequirePermissions([Permission.USER_READ])
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
  @RequirePermissions([Permission.USER_ADMIN])
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
  @RequirePermissions([Permission.USER_ADMIN])
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
  @RequirePermissions([Permission.USER_ADMIN])
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
  @RequirePermissions([Permission.USER_ADMIN])
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
  @RequirePermissions([Permission.USER_ADMIN])
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.rolesService.remove(id);
    return { message: '角色已删除' };
  }
}
