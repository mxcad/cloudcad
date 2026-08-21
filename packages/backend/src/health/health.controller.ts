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
  HttpStatus,
  Inject,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
  Version,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
} from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';
import { IStorageService } from '../storage/interfaces/storage-service.interface';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { Public } from '../auth/decorators/public.decorator';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { I18nContext } from 'nestjs-i18n';

@ApiTags('健康检查')
@Controller('health')
@UseGuards(PermissionsGuard)
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private databaseService: DatabaseService,
    @Inject(IStorageService) private storageService: IStorageService,
    @InjectRedis() private readonly redis: Redis
  ) {}

  @Get('live')
  @Version(VERSION_NEUTRAL)
  @Public()
  @ApiOperation({ summary: '存活检查（Docker 健康检查）' })
  @ApiResponse({ status: 200, description: '服务存活' })
  async liveness() {
    const memUsage = process.memoryUsage();

    let databaseStatus = 'unknown';
    let redisStatus = 'unknown';

    try {
      const dbResult = await this.databaseService.healthCheck();
      databaseStatus = dbResult.status === 'healthy' ? 'ok' : 'error';
    } catch {
      databaseStatus = 'error';
    }

    try {
      await this.redis.ping();
      redisStatus = 'ok';
    } catch {
      redisStatus = 'error';
    }

    const overallStatus =
      databaseStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()) + 's',
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      },
      checks: {
        database: databaseStatus,
        redis: redisStatus,
      },
    };
  }

  @Get('public')
  @Version(VERSION_NEUTRAL)
  @Public()
  @ApiOperation({ summary: '公开健康检查（轻量级）' })
  @ApiResponse({ status: 200, description: '服务正常运行' })
  @ApiResponse({ status: 503, description: '数据库或存储服务不可用' })
  async publicHealth(@Res({ passthrough: true }) res: Response) {
    let databaseStatus: 'up' | 'down' = 'up';
    let databaseMessage: string | undefined;
    let storageStatus: 'up' | 'down' = 'up';
    let storageMessage: string | undefined;

    try {
      const dbResult = await this.databaseService.healthCheck();
      databaseStatus = dbResult.status === 'healthy' ? 'up' : 'down';
      databaseMessage = dbResult.message;
    } catch {
      databaseStatus = 'down';
      databaseMessage =
        I18nContext.current()?.t('error.database_extra.connection_error') ??
        '数据库连接异常';
    }

    try {
      const storageResult = await this.storageService.healthCheck();
      storageStatus = storageResult.status === 'healthy' ? 'up' : 'down';
      storageMessage = storageResult.message;
    } catch {
      storageStatus = 'down';
      storageMessage =
        I18nContext.current()?.t('error.storage_extra.service_error') ??
        '存储服务异常';
    }

    const overallStatus =
      databaseStatus === 'up' && storageStatus === 'up' ? 'ok' : 'error';

    // K8s readinessProbe 依赖 HTTP 状态码判断就绪；依赖不可用时返回 503
    if (overallStatus === 'error') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: overallStatus,
      info: {
        database: {
          status: databaseStatus,
          message: databaseMessage,
        },
        storage: {
          status: storageStatus,
          message: storageMessage,
        },
      },
      error: {},
      details: {},
    };
  }

  @Get()
  @Version(VERSION_NEUTRAL)
  @HealthCheck()
  @ApiOperation({ summary: '系统健康检查（详细）' })
  @ApiResponse({ status: 200, description: '系统正常运行' })
  @ApiResponse({ status: 503, description: '服务不可用' })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  async checkFull(): Promise<HealthCheckResult> {
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

  @Get('full')
  @Version(VERSION_NEUTRAL)
  @HealthCheck()
  @ApiOperation({ summary: '系统健康检查（详细）' })
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
  @Version(VERSION_NEUTRAL)
  @ApiOperation({ summary: '数据库健康检查' })
  @ApiResponse({ status: 200, description: '数据库连接正常' })
  @ApiResponse({ status: 503, description: '数据库连接失败' })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  async checkDatabase() {
    return this.databaseService.healthCheck();
  }

  @Get('storage')
  @Version(VERSION_NEUTRAL)
  @ApiOperation({ summary: '存储服务健康检查' })
  @ApiResponse({ status: 200, description: '存储服务正常' })
  @ApiResponse({ status: 503, description: '存储服务不可用' })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  async checkStorage() {
    return this.storageService.healthCheck();
  }
}
