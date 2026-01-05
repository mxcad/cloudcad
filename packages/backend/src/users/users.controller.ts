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
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/permissions.enum';
import { RolesGuard } from '../common/guards/roles.guard';
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
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('search/by-email')
  @ApiOperation({ summary: '根据邮箱搜索用户' })
  @ApiResponse({ status: 200, description: '搜索成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  @HttpCode(HttpStatus.OK)
  searchByEmail(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索用户（用于添加项目成员）' })
  @ApiResponse({ status: 200, description: '搜索成功' })
  @HttpCode(HttpStatus.OK)
  searchUsers(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  ) {
    return this.usersService.updateStatus(id, status);
  }

  @Get('profile/me')
  @HttpCode(HttpStatus.OK)
  getProfile(@Param('id') id: string) {
    // 这里应该从JWT token中获取用户ID
    // 暂时使用参数，实际实现中需要从request.user获取
    return this.usersService.findOne(id);
  }

  @Patch('profile/me')
  @HttpCode(HttpStatus.OK)
  updateProfile(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    // 用户只能更新自己的信息，排除角色和状态字段
    const { role, status, ...profileData } = updateUserDto;
    return this.usersService.update(id, profileData);
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
