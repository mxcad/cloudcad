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
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SystemPermission } from '../common/enums/permissions.enum';
import { SecurityAccessAttemptService } from './security-access-attempt.service';
import { IpWhitelistService } from '../ip-whitelist/ip-whitelist.service';
import { IpBlacklistService } from '../ip-blacklist/ip-blacklist.service';
import {
  ListSecurityAccessAttemptQueryDto,
  SecurityAccessAttemptListResponseDto,
  SecurityIpActionDto,
} from './dto/security-access-attempt.dto';
import { I18nContext } from 'nestjs-i18n';

/**
 * 高危接口访问尝试管理
 *
 * 复用 SYSTEM_IP_WHITELIST_MANAGE 权限（能管理管理员 IP 白名单的人，
 * 也应对"高危尝试记录 + 一键拉白/拉黑"拥有治理权，保持 IP 安全治理语义一致）。
 * 加白 / 拉黑分别复用 IpWhitelistService.addEntry / IpBlacklistService.addEntry
 * （内部已做安全审计留痕，operator 已认证，有合法 userId）。
 */
@ApiTags('高危访问尝试管理')
@ApiBearerAuth()
@Controller('admin/security-attempts')
@UseGuards(RolesGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_IP_WHITELIST_MANAGE])
export class SecurityAccessAttemptController {
  constructor(
    private readonly securityAccessAttemptService: SecurityAccessAttemptService,
    private readonly ipWhitelistService: IpWhitelistService,
    private readonly ipBlacklistService: IpBlacklistService
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '分页查询高危接口访问尝试（按 IP 聚合：次数/时序/原因分布，标注是否已在白/黑名单）',
  })
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: SecurityAccessAttemptListResponseDto,
  })
  async list(@Query() query: ListSecurityAccessAttemptQueryDto) {
    return this.securityAccessAttemptService.listAggregated(
      query.page ?? 1,
      query.pageSize ?? 20,
      query.keyword
    );
  }

  @Post('whitelist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '将指定 IP 加入管理员白名单（永久）' })
  @ApiResponse({ status: 200, description: '已加入白名单' })
  @ApiResponse({ status: 400, description: 'IP 格式非法' })
  @ApiResponse({ status: 409, description: '该 IP 已在白名单中' })
  async whitelist(@Body() dto: SecurityIpActionDto, @Req() req: Request) {
    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';
    return this.ipWhitelistService.addEntry(
      {
        ip: dto.ip,
        reason:
          I18nContext.current()?.t(
            'security_attempt.whitelist_reason'
          ) ?? '由高危访问尝试记录加入白名单',
      },
      operatorId
    );
  }

  @Post('blacklist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '将指定 IP 加入黑名单（永久）' })
  @ApiResponse({ status: 200, description: '已加入黑名单' })
  @ApiResponse({ status: 400, description: 'IP 格式非法' })
  @ApiResponse({ status: 409, description: '该 IP 已在黑名单中' })
  async blacklist(@Body() dto: SecurityIpActionDto, @Req() req: Request) {
    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';
    return this.ipBlacklistService.addEntry(
      {
        ip: dto.ip,
        reason:
          I18nContext.current()?.t(
            'security_attempt.blacklist_reason'
          ) ?? '由高危访问尝试记录加入黑名单',
      },
      operatorId
    );
  }
}
