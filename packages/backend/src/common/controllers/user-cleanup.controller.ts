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
/////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserCleanupService } from '../services/user-cleanup.service';
import {
  UserCleanupStatsResponseDto,
  UserCleanupTriggerDto,
  UserCleanupTriggerResponseDto,
} from './dto/user-cleanup.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { SystemPermission } from '../enums/permissions.enum';

@ApiTags('user-cleanup')
@Controller('user-cleanup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_USER_DELETE])
@ApiBearerAuth()
export class UserCleanupController {
  constructor(private readonly userCleanupService: UserCleanupService) {}

  @Get('stats')
  @ApiOperation({ summary: '获取待清理用户统计' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取待清理用户统计',
    type: UserCleanupStatsResponseDto,
  })
  async getStats(): Promise<UserCleanupStatsResponseDto> {
    return await this.userCleanupService.getPendingCleanupStats();
  }

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发用户数据清理' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功触发用户数据清理',
    type: UserCleanupTriggerResponseDto,
  })
  async triggerCleanup(
    @Body() body: UserCleanupTriggerDto
  ): Promise<UserCleanupTriggerResponseDto> {
    const result = await this.userCleanupService.manualCleanup(body.delayDays);
    return {
      message: `清理完成: 处理 ${result.processedUsers} 个用户`,
      success: result.success,
      processedUsers: result.processedUsers,
      deletedMembers: result.deletedMembers,
      deletedProjects: result.deletedProjects,
      deletedAuditLogs: result.deletedAuditLogs,
      markedForStorageCleanup: result.markedForStorageCleanup,
      errors: result.errors,
    };
  }
}
