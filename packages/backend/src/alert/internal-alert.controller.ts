///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
  Version,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { AlertRecord } from '@cloudcad/db';
import type { Prisma as PrismaRuntime } from '@cloudcad/db';
import { Public } from '../auth/decorators/public.decorator';
import { InternalSecretGuard } from '../common/guards/internal-secret.guard';
import { AlertService } from './alert.service';
import { RaiseInternalAlertDto } from './dto/internal-alert.dto';

/**
 * 内部告警上报端点（#421 宿主机侧 ClamAV 扫描告警接入）
 *
 * 供宿主机运维脚本（runtime/scripts/antivirus/scan-malware.sh）检出恶意文件后
 * 将告警接入既有告警链路：raise → AlertNotificationService → P1 聚合邮件
 * （ALERT_EMAIL_ENABLED=true + ALERT_EMAIL_TO 时）。
 *
 * 鉴权：@Public() 仅绕过 JWT/CSRF 全局 Guard（宿主机 curl 无用户身份），
 * 端点实际由 InternalSecretGuard 校验 X-Internal-Service-Secret 共享密钥
 * （服务端未配置密钥时 fail-close 拒绝），并非开放端点。
 * 不入 API SDK（@ApiExcludeEndpoint）——宿主机脚本直接 curl。
 *
 * 路径：POST /api/internal/alert/raise（VERSION_NEUTRAL 不带 /v1）
 */
@Public()
@UseGuards(InternalSecretGuard)
@Controller('internal/alert')
export class InternalAlertController {
  private readonly logger = new Logger(InternalAlertController.name);

  constructor(private readonly alertService: AlertService) {}

  /**
   * 上报内部告警（宿主机侧脚本调用）。
   * 返回告警记录（ResponseInterceptor 统一包装 { code, message, data, timestamp }）。
   * 方法级 @Version(VERSION_NEUTRAL)：路径不带 /v1（与 webhook/health 先例一致）。
   * 方法级 @ApiExcludeEndpoint()：不入 Swagger/API SDK（与 webhook 先例一致）。
   */
  @Post('raise')
  @HttpCode(HttpStatus.OK)
  @Version(VERSION_NEUTRAL)
  @ApiExcludeEndpoint()
  async raise(
    @Body() body: RaiseInternalAlertDto
  ): Promise<AlertRecord> {
    const { source, messageKey, level, message, detail } = body;
    const record = await this.alertService.raise({
      source,
      messageKey,
      level,
      message,
      detail: detail as PrismaRuntime.InputJsonValue | undefined,
    });
    this.logger.log(
      `内部告警已上报: source=${source} messageKey=${messageKey} level=${level}`
    );
    return record;
  }
}
