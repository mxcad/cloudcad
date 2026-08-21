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
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DatabaseService } from '../database/database.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SystemPermission } from '../common/enums/permissions.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserMembershipDto } from './dto/update-user-membership.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UploadAvatarDto } from './dto/upload-avatar.dto';
import { UsersService } from './users.service';
import {
  UserResponseDto,
  UserListResponseDto,
  UserSearchResultDto,
  UserProfileResponseDto,
  UserDashboardStatsDto,
} from './dto/user-response.dto';
import {
  DeactivateAccountDto,
  DeactivateAccountApiResponseDto,
} from './dto/deactivate-account.dto';
import {
  RestoreAccountDto,
  RestoreAccountResponseDto,
} from './dto/restore-account.dto';
import {
  ChangePasswordDto,
  ChangePasswordResponseDto,
  ChangePasswordApiResponseDto,
} from '../auth/dto/password-reset.dto';
import type { AuthenticatedRequest } from '../common/types/request.types';

import { I18nContext } from 'nestjs-i18n';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import type { Request as ExpressRequest, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('users')
@UseGuards(RolesGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @RequirePermissions([SystemPermission.SYSTEM_USER_CREATE])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建用户' })
  @ApiResponse({
    status: 201,
    description: '用户创建成功',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 409, description: '用户已存在' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
  @ApiOperation({ summary: '获取用户列表' })
  @ApiResponse({
    status: 200,
    description: '获取用户列表成功',
    type: UserListResponseDto,
  })
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get('search/by-email')
  @ApiOperation({ summary: '根据邮箱搜索用户' })
  @ApiResponse({
    status: 200,
    description: '搜索成功',
    type: UserSearchResultDto,
  })
  @ApiResponse({ status: 404, description: '用户不存在' })
  @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
  @HttpCode(HttpStatus.OK)
  searchByEmail(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('search')
  @ApiOperation({ summary: '搜索用户（用于添加项目成员）' })
  @ApiResponse({
    status: 200,
    description: '搜索成功',
    type: UserListResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  searchUsers(
    @Query() query: QueryUsersDto,
    @Request() req: AuthenticatedRequest
  ) {
    return this.usersService.findAll(query, req.user.id);
  }

  @Get('profile/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiResponse({
    status: 200,
    description: '获取用户信息成功',
    type: UserProfileResponseDto,
  })
  getProfile(@Request() req: AuthenticatedRequest) {
    return this.usersService.findOne(req.user.id);
  }

  @Get('stats/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取当前用户仪表盘统计数据' })
  @ApiResponse({
    status: 200,
    description: '获取统计数据成功',
    type: UserDashboardStatsDto,
  })
  getDashboardStats(@Request() req: AuthenticatedRequest) {
    return this.usersService.getDashboardStats(req.user.id);
  }

  @Patch('profile/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新当前用户信息' })
  @ApiResponse({
    status: 200,
    description: '更新用户信息成功',
    type: UserProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateUserDto: UpdateUserDto
  ) {
    // 用户只能更新自己的信息，排除角色ID和状态字段
    const { roleId, status, ...profileData } = updateUserDto;

    // 检查用户名修改限制（一月最多3次）
    if (updateUserDto.username) {
      const existingUser = await this.usersService.findOne(req.user.id);

      // 检查用户名是否有变化
      if (updateUserDto.username !== existingUser.username) {
        // 获取用户的修改次数和时间
        const userWithCount = await this.databaseService.user.findUnique({
          where: { id: req.user.id },
          select: {
            usernameChangeCount: true,
            lastUsernameChangeAt: true,
          },
        });

        const now = new Date();
        const oneMonthAgo = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          now.getDate()
        );

        // 如果上次修改时间超过一个月，重置修改次数
        if (
          !userWithCount?.lastUsernameChangeAt ||
          userWithCount.lastUsernameChangeAt < oneMonthAgo
        ) {
          await this.databaseService.user.update({
            where: { id: req.user.id },
            data: {
              usernameChangeCount: 0,
              lastUsernameChangeAt: null,
            },
          });
        }

        // 检查修改次数是否超过限制
        const updatedUserWithCount = await this.databaseService.user.findUnique(
          {
            where: { id: req.user.id },
            select: {
              usernameChangeCount: true,
            },
          }
        );

        if (
          updatedUserWithCount &&
          updatedUserWithCount.usernameChangeCount >= 3
        ) {
          throw new BadRequestException(I18nContext.current()?.t('error.user.username_change_limit') ?? '用户名一月内只能修改3次');
        }

        // 更新用户名时增加修改次数和时间
        await this.databaseService.user.update({
          where: { id: req.user.id },
          data: {
            usernameChangeCount: {
              increment: 1,
            },
            lastUsernameChangeAt: new Date(),
          },
        });
      }
    }

    return this.usersService.update(req.user.id, profileData);
  }

  @Post('profile/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '上传当前用户头像' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadAvatarDto })
  @ApiResponse({
    status: 200,
    description: '头像上传成功',
    type: UserProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: '文件类型或大小不符合要求' })
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), defParamCharset: 'utf8' })
  )
  async uploadAvatar(
    @Request() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(I18nContext.current()?.t('error.user.avatar_required') ?? '请上传头像文件');
    }

    return this.usersService.uploadAvatar(req.user.id, file.buffer, path.extname(file.originalname), file.mimetype);
  }

  @Post(':id/avatar')
  @RequirePermissions([SystemPermission.SYSTEM_USER_UPDATE])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '上传指定用户头像（管理员）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadAvatarDto })
  @ApiResponse({
    status: 200,
    description: '头像上传成功',
    type: UserProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: '文件类型或大小不符合要求' })
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), defParamCharset: 'utf8' })
  )
  async uploadUserAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(I18nContext.current()?.t('error.user.avatar_required') ?? '请上传头像文件');
    }

    return this.usersService.uploadAvatar(id, file.buffer, path.extname(file.originalname), file.mimetype);
  }

  @Get('avatar/:id')
  @Public()
  @ApiOperation({ summary: '获取用户头像文件' })
  @ApiResponse({ status: 200, description: '返回头像图片' })
  @ApiResponse({ status: 304, description: '头像未变化，使用缓存' })
  @ApiResponse({ status: 404, description: '头像文件不存在' })
  async serveAvatar(
    @Param('id') id: string,
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ) {
    const avatarDir = this.configService.get('avatarPath', { infer: true });
    const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    for (const ext of extensions) {
      const filePath = path.join(avatarDir, `${id}${ext}`);
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        const stats = await fs.promises.stat(filePath);
        // 基于文件 mtime + size 生成 ETag：头像更换后文件被重写，mtime/size 变化 → ETag 变化 → 浏览器重新拉取
        const etag = `"${Math.floor(stats.mtimeMs)}-${stats.size}"`;
        const lastModified = stats.mtime.toUTCString();
        const cacheControl = 'no-cache';

        const ifNoneMatch = req.headers['if-none-match'];
        const etagMatches =
          ifNoneMatch
            ?.split(',')
            .map((tag) => tag.trim().replace(/^W\//, ''))
            .includes(etag) ?? false;
        const ifModifiedSince = Date.parse(req.headers['if-modified-since'] || '');
        const lastModifiedMs = Math.floor(stats.mtimeMs / 1000) * 1000;
        const notModified =
          etagMatches || (!ifNoneMatch && !Number.isNaN(ifModifiedSince) && ifModifiedSince >= lastModifiedMs);

        if (notModified) {
          res.status(304);
          res.setHeader('ETag', etag);
          res.setHeader('Last-Modified', lastModified);
          res.setHeader('Cache-Control', cacheControl);
          res.end();
          return;
        }

        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Last-Modified', lastModified);
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', cacheControl);
        const stream = fs.createReadStream(filePath);
        stream.on('error', () => {
          if (!res.headersSent) {
            res.status(500).end();
          }
        });
        stream.pipe(res);
        return;
      } catch {
        continue;
      }
    }

    throw new NotFoundException(I18nContext.current()?.t('error.user.avatar_not_found') ?? '头像文件不存在');
  }

  @Get(':id')
  @RequirePermissions([SystemPermission.SYSTEM_USER_READ])
  @ApiOperation({ summary: '根据 ID 获取用户' })
  @ApiResponse({
    status: 200,
    description: '获取用户成功',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: '用户不存在' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions([SystemPermission.SYSTEM_USER_UPDATE])
  @ApiOperation({ summary: '更新用户' })
  @ApiResponse({
    status: 200,
    description: '更新用户成功',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: '用户不存在' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @RequirePermissions([SystemPermission.SYSTEM_USER_DELETE])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注销用户账户（软删除）' })
  @ApiResponse({ status: 200, description: '账户注销成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    // 审计（USER_DEACTIVATE）在 UserStatusService.softDelete 内埋点（操作者=req.user.id）
    return this.usersService.softDelete(id, req.user.id);
  }

  @Post(':id/restore')
  @RequirePermissions([SystemPermission.SYSTEM_USER_DELETE])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复已注销的用户账户' })
  @ApiResponse({ status: 200, description: '账户恢复成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  restore(@Param('id') id: string) {
    return this.usersService.restore(id);
  }

  @Patch(':id/status')
  @RequirePermissions([SystemPermission.SYSTEM_USER_UPDATE])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新用户状态' })
  @ApiResponse({
    status: 200,
    description: '更新用户状态成功',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: '用户不存在' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto
  ) {
    return this.usersService.updateStatus(id, updateUserStatusDto.status);
  }

  @Patch(':id/membership')
  @RequirePermissions([SystemPermission.SYSTEM_USER_MEMBERSHIP_MANAGE])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理用户 VIP 会员（等级/时长）' })
  @ApiResponse({
    status: 200,
    description: '用户会员更新成功',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: '用户不存在' })
  updateMembership(
    @Param('id') id: string,
    @Body() dto: UpdateUserMembershipDto,
  ) {
    return this.usersService.updateMembership(id, dto);
  }

  @Post(':id/delete-immediately')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '立即注销指定用户账户（彻底删除账号及其所有数据）' })
  @ApiResponse({ status: 200, description: '账户立即注销成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  @ApiResponse({ status: 403, description: '权限不足' })
  @RequirePermissions([SystemPermission.SYSTEM_USER_DELETE])
  deleteImmediately(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest
  ) {
    // 审计（USER_DEACTIVATE）在 UserStatusService.deleteImmediately 内埋点（操作者=req.user.id）
    return this.usersService.deleteImmediately(id, req.user.id);
  }

  @Post('deactivate-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注销用户账户' })
  @ApiResponse({
    status: 200,
    description: '账户注销成功',
    type: DeactivateAccountApiResponseDto,
  })
  @ApiResponse({ status: 400, description: '账户已注销或验证失败' })
  @ApiResponse({ status: 401, description: '未授权' })
  async deactivateAccount(
    @Request() req: AuthenticatedRequest,
    @Body() dto: DeactivateAccountDto
  ) {
    return this.usersService.deactivate(
      req.user.id,
      dto.password,
      dto.phoneCode,
      dto.emailCode,
      dto.wechatCode
    );
  }

  @Post('me/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复已注销账户（冷静期内）' })
  @ApiResponse({
    status: 200,
    description: '账户恢复成功',
    type: RestoreAccountResponseDto,
  })
  @ApiResponse({ status: 400, description: '账户未注销或已过冷静期' })
  @ApiResponse({ status: 401, description: '验证失败' })
  async restoreAccount(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RestoreAccountDto
  ) {
    return this.usersService.restoreAccount(
      req.user.id,
      dto.verificationMethod,
      dto.code
    );
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
