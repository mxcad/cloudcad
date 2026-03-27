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
  Param,
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
import { RedisCacheService } from '../services/redis-cache.service';
import { CacheWarmupService } from '../services/cache-warmup.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { SystemPermission } from '../enums/permissions.enum';

@ApiTags('cache')
@Controller('cache')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_ADMIN])
@ApiBearerAuth()
export class CacheMonitorController {
  constructor(
    private readonly redisCacheService: RedisCacheService,
    private readonly cacheWarmupService: CacheWarmupService
  ) {}

  @Get('stats')
  @ApiOperation({ summary: '获取缓存统计信息' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取缓存统计信息',
  })
  async getStats() {
    return await this.redisCacheService.getStats();
  }

  @Post('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清理所有缓存' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功清理所有缓存',
  })
  async clearAll() {
    await this.redisCacheService.clearAll();
    return {
      message: '所有缓存已清理',
    };
  }

  @Post('warmup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发缓存预热' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '缓存预热完成',
  })
  async manualWarmup() {
    return await this.cacheWarmupService.manualWarmup();
  }

  @Post('warmup/user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '预热指定用户的缓存' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '用户缓存预热完成',
  })
  async warmupUser(@Param('userId') userId: string) {
    await this.cacheWarmupService.warmupUser(userId);
    return {
      message: `用户 ${userId} 的缓存预热完成`,
    };
  }

  @Post('warmup/project/:projectId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '预热指定项目的缓存' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '项目缓存预热完成',
  })
  async warmupProject(@Param('projectId') projectId: string) {
    await this.cacheWarmupService.warmupProject(projectId);
    return {
      message: `项目 ${projectId} 的缓存预热完成`,
    };
  }
}
