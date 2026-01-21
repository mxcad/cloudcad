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
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/permissions.enum';

@ApiTags('roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
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
  async findOne(@Param('id') id: string): Promise<RoleDto> {
    return await this.rolesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '创建新角色' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建角色',
    type: RoleDto,
  })
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
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.rolesService.remove(id);
    return { message: '角色已删除' };
  }
}
