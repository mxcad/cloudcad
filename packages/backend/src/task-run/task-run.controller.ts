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
  Logger,
  NotFoundException,
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
import { I18nContext } from 'nestjs-i18n';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SystemPermission } from '../common/enums/permissions.enum';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from './task-run.service';
import { TaskRunTrigger } from './enums/task-run.enum';
import {
  QueryTaskRunsDto,
  RunTaskDto,
  TaskRunListResponseDto,
  TaskRunTriggerResultDto,
} from './dto/task-run.dto';

/**
 * 后台任务执行记录与控制（#210）
 *
 * 权限模型（沿用 cache-monitor.controller #217 先例）：
 * - 类级默认 SYSTEM_MONITOR（查询端点继承）
 * - 手动触发端点方法级覆盖为 SYSTEM_ADMIN
 */
@ApiTags('任务执行控制')
@ApiBearerAuth()
@Controller('admin/tasks')
@UseGuards(RolesGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.SYSTEM_MONITOR])
export class TaskRunController {
  private readonly logger = new Logger(TaskRunController.name);

  constructor(
    private readonly taskRunService: TaskRunService,
    private readonly alertService: AlertService
  ) {}

  @Get('runs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查询后台任务最近执行记录（SYSTEM_MONITOR）' })
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: TaskRunListResponseDto,
  })
  @ApiResponse({ status: 403, description: '无 SYSTEM_MONITOR 权限' })
  async listRuns(@Query() query: QueryTaskRunsDto) {
    return this.taskRunService.findRecent(
      {
        taskName: query.taskName,
        status: query.status,
        trigger: query.trigger,
      },
      { page: query.page ?? 1, limit: query.limit ?? 20 }
    );
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions([SystemPermission.SYSTEM_ADMIN])
  @ApiOperation({ summary: '手动触发后台任务（SYSTEM_ADMIN）' })
  @ApiResponse({
    status: 200,
    description: '触发成功，任务已执行',
    type: TaskRunTriggerResultDto,
  })
  @ApiResponse({ status: 403, description: '无 SYSTEM_ADMIN 权限' })
  @ApiResponse({ status: 404, description: '任务不存在或未注册' })
  async runTask(
    @Body() dto: RunTaskDto,
    @Req() req: Request
  ): Promise<TaskRunTriggerResultDto> {
    const runner = this.taskRunService.getRunner(dto.taskName);
    if (!runner) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.task_run.not_found') ??
          `任务 ${dto.taskName} 不存在或未注册`
      );
    }

    const operatorId = (req.user as { id?: string })?.id ?? 'unknown';
    try {
      await this.taskRunService.run(dto.taskName, () => runner.execute(), {
        trigger: TaskRunTrigger.MANUAL,
        triggeredBy: operatorId,
      });
    } catch (error) {
      this.logger.error(
        `手动触发任务 ${dto.taskName} 失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      await this.raiseTaskFailed(dto.taskName, operatorId, error);
      throw error;
    }

    this.logger.log(
      {
        action: 'TASK_RUN_TRIGGER',
        resourceType: 'SYSTEM',
        resourceId: dto.taskName,
        userId: operatorId,
      },
      'audit'
    );

    return {
      success: true,
      taskName: dto.taskName,
      triggeredAt: new Date(),
    };
  }

  /**
   * 手动触发失败钩子（#245 模式）：task_run_failed 告警，source = task-run:manual
   */
  private async raiseTaskFailed(
    taskName: string,
    operatorId: string,
    error: unknown
  ): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'task-run:manual',
        messageKey: 'task_run_failed',
        level: AlertLevel.CRITICAL,
        message: `手动触发任务 ${taskName} 失败: ${error instanceof Error ? error.message : String(error)}`,
        detail: {
          task: taskName,
          triggeredBy: operatorId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (alertError) {
      this.logger.error(
        `任务失败告警上报失败: ${alertError.message}`,
        alertError.stack
      );
    }
  }
}
