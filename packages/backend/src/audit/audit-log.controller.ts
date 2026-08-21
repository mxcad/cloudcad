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
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditLogService, AuditLogDetailItem, AuditLogListItem, parseLocalDate, splitQueryValues } from './audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { AuthenticatedRequest } from '../common/types/request.types';
import { AuditExportDto } from './dto/audit-export.dto';

@ApiTags('audit')
@Controller('audit')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_ADMIN])
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('logs')
  @ApiOperation({ summary: '查询审计日志' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取审计日志',
  })
  @ApiQuery({ name: 'userId', required: false, description: '用户 ID' })
  @ApiQuery({ name: 'action', required: false, description: '操作类型' })
  @ApiQuery({ name: 'resourceType', required: false, description: '资源类型' })
  @ApiQuery({ name: 'resourceId', required: false, description: '资源 ID' })
  @ApiQuery({ name: 'projectId', required: false, description: '项目 ID（项目维度过滤）' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期' })
  @ApiQuery({ name: 'success', required: false, description: '是否成功' })
  @ApiQuery({ name: 'page', required: false, description: '页码', example: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页数量',
    example: 20,
  })
  async findAll(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('success') success?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ): Promise<{
    logs: AuditLogListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const filters: Record<string, unknown> = {};
    if (userId) filters.userId = userId;
    // 多选筛选：action / resourceType 支持逗号分隔多值（如 action=A,B → in 查询）
    const actionValues = splitQueryValues(action);
    if (actionValues?.length) filters.action = actionValues as AuditAction[];
    const resourceTypeValues = splitQueryValues(resourceType);
    if (resourceTypeValues?.length) {
      filters.resourceType = resourceTypeValues as ResourceType[];
    }
    if (resourceId) filters.resourceId = resourceId;
    if (projectId) filters.projectId = projectId;
    // 日期按本地时区解析（parseLocalDate），endDate 语义为"包含当天"（service 内闭合到次日零点）
    if (startDate) filters.startDate = parseLocalDate(startDate);
    if (endDate) filters.endDate = parseLocalDate(endDate);
    if (success !== undefined) filters.success = success === 'true';

    const pagination = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    };

    return await this.auditLogService.findAll(filters, pagination);
  }

  @Get('logs/:id')
  @ApiOperation({ summary: '获取审计日志详情' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取审计日志详情',
  })
  async findOne(@Param('id') id: string): Promise<AuditLogDetailItem> {
    return await this.auditLogService.findOne(id);
  }

  @Get('statistics')
  @ApiOperation({ summary: '获取审计统计信息' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取审计统计信息',
  })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期' })
  @ApiQuery({ name: 'userId', required: false, description: '用户 ID' })
  async getStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string
  ) {
    const filters: Record<string, unknown> = {};
    if (startDate) filters.startDate = parseLocalDate(startDate);
    if (endDate) filters.endDate = parseLocalDate(endDate);
    if (userId) filters.userId = userId;

    return await this.auditLogService.getStatistics(filters);
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '导出审计日志（CSV/Excel）' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功导出审计日志（文件流下载）',
  })
  async exportLogs(
    @Body() dto: AuditExportDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response
  ): Promise<void> {
    const filters: Record<string, unknown> = {};
    if (dto.action) filters.action = [dto.action];
    if (dto.projectId) filters.projectId = dto.projectId;
    if (dto.startDate) filters.startDate = parseLocalDate(dto.startDate);
    if (dto.endDate) filters.endDate = parseLocalDate(dto.endDate);
    if (dto.success !== undefined) filters.success = dto.success;

    const { buffer, filename, mimeType } = await this.auditLogService.exportLogs(
      filters,
      dto.format ?? 'csv'
    );

    // 导出动作本身记录审计日志（#207 阶段 2）
    const userId = req.user?.id ?? 'unknown';
    await this.auditLogService.log(
      AuditAction.AUDIT_EXPORT,
      ResourceType.SYSTEM,
      undefined,
      userId,
      true,
      undefined,
      undefined,
      dto.projectId,
      undefined,
      {
        format: dto.format ?? 'csv',
        action: dto.action ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        success: dto.success ?? null,
      }
    );

    const encodedFilename = encodeURIComponent(filename);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.send(buffer);
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清理旧审计日志' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功清理旧审计日志',
  })
  async cleanupOldLogs(@Request() req: AuthenticatedRequest, @Body() body: { daysToKeep: number }) {
    const userId = req.user?.id || 'unknown';
    const deletedCount = await this.auditLogService.cleanupOldLogs(
      body.daysToKeep,
      userId
    );
    return {
      message: `成功清理了 ${deletedCount} 条审计日志`,
      deletedCount,
    };
  }
}
