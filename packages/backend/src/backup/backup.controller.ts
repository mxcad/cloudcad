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
/////////////////////////////////////////////////////////////////////////////

import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
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
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SystemPermission } from '../common/enums/permissions.enum';
import { BackupScheduler } from './backup.scheduler';
import { BackupService } from './backup.service';
import {
  BackupDeleteResultDto,
  BackupFileInfoDto,
  BackupListResponseDto,
  BackupTriggerResultDto,
} from './dto/backup.dto';

/**
 * 数据库备份管理（#318）
 *
 * 全部端点 SYSTEM_ADMIN：备份涉及数据库全量导出与磁盘写入，仅管理员可操作
 */
@ApiTags('数据库备份')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RolesGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_ADMIN])
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(
    private readonly backupService: BackupService,
    private readonly backupScheduler: BackupScheduler
  ) {}

  @Post('backup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发一次全量备份（SYSTEM_ADMIN）' })
  @ApiResponse({
    status: 200,
    description: '备份成功',
    type: BackupTriggerResultDto,
  })
  @ApiResponse({ status: 500, description: '备份失败' })
  async triggerBackup(@Req() req: Request): Promise<BackupTriggerResultDto> {
    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';

    const result = await this.backupScheduler.runManualBackup(operatorId);

    this.logger.log(
      {
        action: 'BACKUP_TRIGGER',
        resourceType: 'SYSTEM',
        resourceId: result.filename,
        userId: operatorId,
      },
      'audit'
    );

    return {
      success: true,
      filename: result.filename,
      sizeBytes: result.sizeBytes,
      durationMs: result.durationMs,
      deletedCount: result.deletedCount,
    };
  }

  @Get('backups')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '列出本地备份文件（名称 + 大小 + 时间）' })
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: BackupListResponseDto,
  })
  async listBackups(): Promise<BackupListResponseDto> {
    const data = await this.backupService.listBackups();
    const list: BackupFileInfoDto[] = data.map((item) => ({
      name: item.name,
      sizeBytes: item.sizeBytes,
      modifiedAt: item.modifiedAt,
    }));
    return { data: list, total: list.length };
  }

  @Delete('backups/:name')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动删除指定备份文件（SYSTEM_ADMIN）' })
  @ApiResponse({
    status: 200,
    description: '删除成功',
    type: BackupDeleteResultDto,
  })
  @ApiResponse({ status: 400, description: '非法文件名或删除失败' })
  async deleteBackup(
    @Param('name') name: string
  ): Promise<BackupDeleteResultDto> {
    try {
      await this.backupService.deleteBackup(name);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error)
      );
    }
    return { success: true, name };
  }
}
