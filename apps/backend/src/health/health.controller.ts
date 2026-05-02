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

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
} from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('健康检查')
@Controller('health')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private databaseService: DatabaseService,
    private storageService: StorageService
  ) {}

  @Get('live')
  @Public()
  @ApiOperation({ summary: '存活检查（Docker 健康检查）' })
  @ApiResponse({ status: 200, description: '服务存活' })
  async liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: '系统健康检查' })
  @ApiResponse({ status: 200, description: '系统正常运行' })
  @ApiResponse({ status: 503, description: '服务不可用' })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => {
        const result = await this.databaseService.healthCheck();
        return {
          database: {
            status: result.status === 'healthy' ? 'up' : 'down',
            message: result.message,
          },
        };
      },
      async () => {
        const result = await this.storageService.healthCheck();
        return {
          storage: {
            status: result.status === 'healthy' ? 'up' : 'down',
            message: result.message,
          },
        };
      },
    ]);
  }

  @Get('db')
  @ApiOperation({ summary: '数据库健康检查' })
  @ApiResponse({ status: 200, description: '数据库连接正常' })
  @ApiResponse({ status: 503, description: '数据库连接失败' })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  async checkDatabase() {
    return this.databaseService.healthCheck();
  }

  @Get('storage')
  @ApiOperation({ summary: '存储服务健康检查' })
  @ApiResponse({ status: 200, description: '存储服务正常' })
  @ApiResponse({ status: 503, description: '存储服务不可用' })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  async checkStorage() {
    return this.storageService.healthCheck();
  }
}
