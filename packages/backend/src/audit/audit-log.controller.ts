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
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  AuditLogService,
  AuditLogDetailItem,
  AuditLogListItem,
  parseLocalDate,
  splitQueryValues,
  computeRetentionCutoff,
} from './audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  RequirePermissions,
  PermissionCheckMode,
} from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { AuthenticatedRequest } from '../common/types/request.types';
import { AuditExportDto } from './dto/audit-export.dto';
import { AuditCleanupDto } from './dto/audit-cleanup.dto';
import { AuditArchiveService } from './audit-archive.service';

/**
 * 审计日志管理员视图
 *
 * 权限模型（#321 三权分立，等保 8.5.2）：
 * - 类级兜底（ANY）：AUDIT_ADMIN 或 SYSTEM_ADMIN 任一即可（fail-safe，
 *   新增端点漏声明时不会裸奔）
 * - 清理（写操作）方法级覆盖：仅 AUDIT_ADMIN（从 SYSTEM_ADMIN 收窄）
 *
 * 受限删除（#323，等保 8.4.3.3 防未授权删除）：cleanup 前置"已归档"门禁
 * （未归档/产物不完整 409 拒删）+ `confirm: true` 二次确认 + 动作本身留痕
 */
@ApiTags('audit')
@Controller('audit')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequirePermissions(
  [SystemPermission.AUDIT_ADMIN, SystemPermission.SYSTEM_ADMIN],
  PermissionCheckMode.ANY
)
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly auditArchiveService: AuditArchiveService,
    private readonly configService: ConfigService
  ) {}

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
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: '项目 ID（项目维度过滤）',
  })
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

    const { buffer, filename, mimeType } =
      await this.auditLogService.exportLogs(filters, dto.format ?? 'csv');

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
  // 三权分立：清理权仅归审计管理员（AUDIT_ADMIN），系统管理员不再持有
  @RequirePermissions([SystemPermission.AUDIT_ADMIN])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '清理旧审计日志（#323 受限删除：已归档校验 + 二次确认）',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功清理旧审计日志',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      '目标时间段记录未归档或归档产物不完整（CSV/清单缺失、哈希不一致），拒绝删除',
  })
  async cleanupOldLogs(
    @Request() req: AuthenticatedRequest,
    @Body() dto: AuditCleanupDto
  ) {
    const userId = req.user?.id || 'unknown';
    // 保留期下限：仅允许删除超保留期记录（默认 183 天，AUDIT_LOG_RETENTION_DAYS）
    const retentionDays = this.configService.get<number>(
      'audit.retentionDays',
      183
    );
    const days = dto.daysToKeep ?? retentionDays;

    if (days < retentionDays) {
      await this.writeCleanupTrail(userId, false, {
        confirm: dto.confirm,
        requestedDaysToKeep: dto.daysToKeep ?? null,
        effectiveDaysToKeep: days,
        retentionDays,
        reason: 'BELOW_RETENTION_FLOOR',
        deletedCount: 0,
      });
      throw new BadRequestException(
        `daysToKeep=${days} 低于系统保留期下限 ${retentionDays} 天，仅允许清理超保留期记录`
      );
    }

    // 删除前置门禁（fail-closed）：目标时间段的每个月度分片必须已归档且完整，
    // 未归档/清单缺失/哈希不一致一律 409 拒绝，不产生任何删除
    const cutoff = computeRetentionCutoff(new Date(), days);
    const violations =
      await this.auditArchiveService.verifyArchivedForCutoff(cutoff);
    if (violations.length > 0) {
      await this.writeCleanupTrail(userId, false, {
        confirm: dto.confirm,
        requestedDaysToKeep: dto.daysToKeep ?? null,
        effectiveDaysToKeep: days,
        retentionDays,
        cutoff: cutoff.toISOString(),
        reason: 'NOT_ARCHIVED',
        violations,
        deletedCount: 0,
      });
      throw new ConflictException({
        code: 'AUDIT_NOT_ARCHIVED',
        message: '目标时间段审计记录未归档或归档产物不完整，拒绝删除',
        violations,
      });
    }

    const deletedCount = await this.auditLogService.cleanupOldLogs(
      days,
      userId
    );

    // 留痕（#323）：清理动作本身记审计，覆盖操作者/确认参数/范围/结果
    await this.writeCleanupTrail(userId, true, {
      confirm: dto.confirm,
      requestedDaysToKeep: dto.daysToKeep ?? null,
      effectiveDaysToKeep: days,
      retentionDays,
      cutoff: cutoff.toISOString(),
      deletedCount,
    });

    return {
      message: `成功清理了 ${deletedCount} 条审计日志`,
      deletedCount,
    };
  }

  /**
   * 清理动作审计留痕（#323）：成功与被拒尝试均记录（等保审查关注未授权删除尝试）。
   * AuditLogService.log 内部 fail-open（写库失败告警但不抛出），不影响主流程。
   */
  private async writeCleanupTrail(
    userId: string,
    success: boolean,
    params: Record<string, unknown>
  ): Promise<void> {
    await this.auditLogService.log(
      AuditAction.AUDIT_CLEANUP,
      ResourceType.SYSTEM,
      undefined,
      userId,
      success,
      success ? undefined : String(params.reason ?? 'CLEANUP_REJECTED'),
      undefined,
      undefined,
      undefined,
      params
    );
  }
}
