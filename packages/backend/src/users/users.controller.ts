import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permission } from '../common/enums/permissions.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import {
  ChangePasswordDto,
  ChangePasswordResponseDto,
  ChangePasswordApiResponseDto,
} from '../auth/dto/password-reset.dto';
import type { AuthenticatedRequest } from '../common/types/request.types';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions([Permission.USER_WRITE])
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @RequirePermissions([Permission.USER_READ])
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('search/by-email')
  @ApiOperation({ summary: '根据邮箱搜索用户' })
  @ApiResponse({ status: 200, description: '搜索成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  @RequirePermissions([Permission.USER_READ])
  @HttpCode(HttpStatus.OK)
  searchByEmail(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索用户（用于添加项目成员）' })
  @ApiResponse({ status: 200, description: '搜索成功' })
  @RequirePermissions([Permission.USER_READ])
  @HttpCode(HttpStatus.OK)
  searchUsers(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('profile/me')
  @HttpCode(HttpStatus.OK)
  getProfile(@Request() req: AuthenticatedRequest) {
    return this.usersService.findOne(req.user.id);
  }

  @Patch('profile/me')
  @HttpCode(HttpStatus.OK)
  updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateUserDto: UpdateUserDto
  ) {
    // 用户只能更新自己的信息，排除角色ID和状态字段
    const { roleId, status, ...profileData } = updateUserDto;
    return this.usersService.update(req.user.id, profileData);
  }

  @Get(':id')
  @RequirePermissions([Permission.USER_READ])
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions([Permission.USER_WRITE])
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @RequirePermissions([Permission.USER_DELETE])
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Patch(':id/status')
  @RequirePermissions([Permission.USER_WRITE])
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  ) {
    return this.usersService.updateStatus(id, status);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修改密码' })
  @ApiResponse({
    status: 200,
    description: '密码修改成功',
    type: ChangePasswordApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权或旧密码不正确' })
  @ApiResponse({ status: 409, description: '旧密码不正确' })
  async changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto
  ): Promise<ChangePasswordResponseDto> {
    return this.usersService.changePassword(
      req.user.id,
      dto.oldPassword,
      dto.newPassword
    );
  }
}
