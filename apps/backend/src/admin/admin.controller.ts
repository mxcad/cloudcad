///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { StorageCleanupService } from '../common/services/storage-cleanup.service';
import { SystemPermission } from '../common/enums/permissions.enum';
import {
  AdminStatsResponseDto,
  CacheStatsResponseDto,
  CacheCleanupResponseDto,
  UserPermissionsResponseDto,
  UserCacheClearResponseDto,
} from './dto/admin-response.dto';

@ApiTags('管理员')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_ADMIN])
export class AdminController {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly cacheService: PermissionCacheService,
    private readonly storageCleanupService: StorageCleanupService
  ) {}

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取管理员统计信息' })
  @ApiResponse({
    status: 200,
    description: '获取管理员统计信息成功',
    type: AdminStatsResponseDto,
  })
  async getAdminStats() {
    return {
      message: '管理员统计信息',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('storage/cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发存储清理' })
  @ApiResponse({
    status: 200,
    description: '存储清理完成',
  })
  @ApiQuery({
    name: 'delayDays',
    required: false,
    type: Number,
    description: '清理延迟天数（覆盖默认值）',
  })
  async cleanupStorage(@Query('delayDays') delayDays?: number) {
    const result = await this.storageCleanupService.manualCleanup(delayDays);
    return {
      message: '存储清理完成',
      data: {
        deletedNodes: result.deletedNodes,
        deletedDirectories: result.deletedDirectories,
        freedSpace: result.freedSpace,
        errors: result.errors,
      },
    };
  }

  @Get('storage/cleanup/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取待清理存储统计' })
  @ApiResponse({
    status: 200,
    description: '获取待清理存储统计成功',
  })
  async getCleanupStats() {
    const stats = await this.storageCleanupService.getPendingCleanupStats();
    return {
      message: '待清理存储统计',
      data: stats,
    };
  }
}
