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
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import {
  AuditLogService,
  AuditLogListItem,
  parseAuditQuery,
} from './audit-log.service';
import { ProjectAuditGuard } from './project-audit.guard';

/**
 * 项目维度审计查询（#207 阶段 4 后端部分）
 *
 * 与 AuditLogController（SYSTEM_ADMIN 专属）不同，本项目成员（owner/admin/普通成员）
 * 可查询**自己项目**的审计记录：ProjectAuditGuard 校验请求者是该项目成员
 * （owner 或 projectMember 记录），非成员一律 403。只读接口：不提供任何写操作。
 */
@ApiTags('audit')
@Controller('audit')
@ApiBearerAuth()
@UseGuards(ProjectAuditGuard)
export class ProjectAuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('project/:projectId')
  @ApiOperation({ summary: '查询项目审计记录（项目成员只读）' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取项目审计记录',
  })
  @ApiQuery({ name: 'action', required: false, description: '操作类型' })
  @ApiQuery({ name: 'resourceType', required: false, description: '资源类型' })
  @ApiQuery({ name: 'userId', required: false, description: '操作用户 ID' })
  @ApiQuery({ name: 'search', required: false, description: '资源名称关键词' })
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
  async findByProject(
    @Param('projectId') projectId: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('userId') userId?: string,
    @Query('search') search?: string,
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
    const { filters, pagination } = parseAuditQuery({
      action,
      resourceType,
      userId,
      search,
      startDate,
      endDate,
      success,
      page,
      limit,
    });

    return await this.auditLogService.findAll(
      { ...filters, projectId },
      pagination
    );
  }
}
