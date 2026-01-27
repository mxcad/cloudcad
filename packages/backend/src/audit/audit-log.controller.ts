import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { AuditAction, ResourceType } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Permission } from '../common/enums/permissions.enum';

@ApiTags('audit')
@Controller('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions([Permission.SYSTEM_ADMIN])
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
    @Query('action') action?: AuditAction,
    @Query('resourceType') resourceType?: ResourceType,
    @Query('resourceId') resourceId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('success') success?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: Request
  ) {
    const currentUserId = (req as any).user?.id;

    const filters: any = {};
    if (userId) filters.userId = userId;
    if (action) filters.action = action;
    if (resourceType) filters.resourceType = resourceType;
    if (resourceId) filters.resourceId = resourceId;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (success !== undefined) filters.success = success === 'true';

    const pagination: any = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    };

    return await this.auditLogService.findAll(
      filters,
      pagination,
      currentUserId
    );
  }

  @Get('logs/:id')
  @ApiOperation({ summary: '获取审计日志详情' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取审计日志详情',
  })
  async findOne(@Param('id') id: string, @Req() req?: Request) {
    const currentUserId = (req as any).user?.id;
    return await this.auditLogService.findOne(id, currentUserId);
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
    @Query('userId') userId?: string,
    @Req() req?: Request
  ) {
    const currentUserId = (req as any).user?.id;

    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (userId) filters.userId = userId;

    return await this.auditLogService.getStatistics(filters, currentUserId);
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清理旧审计日志' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功清理旧审计日志',
  })
  async cleanupOldLogs(
    @Body() body: { daysToKeep: number },
    @Req() req?: Request
  ) {
    const currentUserId = (req as any).user?.id;
    const deletedCount = await this.auditLogService.cleanupOldLogs(
      body.daysToKeep,
      currentUserId
    );
    return {
      message: `成功清理了 ${deletedCount} 条审计日志`,
      deletedCount,
    };
  }
}
