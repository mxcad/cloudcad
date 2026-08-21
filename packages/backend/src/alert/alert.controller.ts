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
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  Controller,
  Get,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { I18nContext } from 'nestjs-i18n';
import type { AlertRecord } from '@cloudcad/db';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { AlertService } from './alert.service';
import { getAuditLoggerInstance } from '../audit/audit-logger.service';
import {
  AlertListResponseDto,
  AlertRecordDto,
  QueryAlertDto,
} from './dto/alert.dto';

@ApiTags('alert')
@ApiBearerAuth()
@Controller('alert')
@UseGuards(PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_MONITOR])
export class AlertController {
  private readonly logger = new Logger(AlertController.name);

  constructor(private readonly alertService: AlertService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOperation({ summary: '分页查询告警（SYSTEM_MONITOR）' })
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: AlertListResponseDto,
  })
  @ApiResponse({ status: 403, description: '无 SYSTEM_MONITOR 权限' })
  async list(@Query() query: QueryAlertDto) {
    return this.alertService.findAll(
      {
        level: query.level,
        status: query.status,
        source: query.source,
      },
      { page: query.page ?? 1, limit: query.limit ?? 20 }
    );
  }

  @Patch(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动解决单条告警（SYSTEM_MONITOR）' })
  @ApiResponse({
    status: 200,
    description: '解决成功，返回更新后的告警记录',
    type: AlertRecordDto,
  })
  @ApiResponse({ status: 403, description: '无 SYSTEM_MONITOR 权限' })
  @ApiResponse({ status: 404, description: '告警不存在' })
  async resolve(
    @Param('id') id: string,
    @Req() req: Request
  ): Promise<AlertRecord | null> {
    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';
    const resolved = await this.alertService.resolveById(id);
    if (!resolved) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.alert.not_found') ?? '告警不存在'
      );
    }
    // 安全审计：解决告警（原为 logger 输出未落库；经 AuditLogModule 注册的全局单例
    // 真实写入，避免 AlertModule → AuditLogModule 模块环；单例未注册时跳过，fail-open）
    const auditLogger = getAuditLoggerInstance();
    if (auditLogger) {
      await auditLogger.audit({
        action: AuditAction.ALERT_RESOLVE,
        resourceType: ResourceType.ALERT,
        resourceId: id,
        userId: operatorId,
        success: true,
      });
    }
    return resolved;
  }
}
