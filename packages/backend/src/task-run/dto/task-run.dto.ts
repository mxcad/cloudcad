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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TaskRunStatus, TaskRunTrigger } from '../enums/task-run.enum';

export class QueryTaskRunsDto {
  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: '任务名精确过滤，如 storage-cleanup:expired-storage',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  taskName?: string;

  @ApiPropertyOptional({
    description: '按执行结果过滤：SUCCESS | FAILED',
    enum: TaskRunStatus,
  })
  @IsOptional()
  @IsEnum(TaskRunStatus)
  status?: TaskRunStatus;

  @ApiPropertyOptional({
    description: '按触发方式过滤：SCHEDULED | MANUAL',
    enum: TaskRunTrigger,
  })
  @IsOptional()
  @IsEnum(TaskRunTrigger)
  trigger?: TaskRunTrigger;
}

export class RunTaskDto {
  @ApiProperty({
    description:
      '任务名（调度器注册的任务 key，如 storage-cleanup:expired-storage）',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  taskName: string;
}

export class TaskRunDto {
  @ApiProperty({ description: '执行记录 ID' })
  id: string;

  @ApiProperty({ description: '任务名' })
  taskName: string;

  @ApiProperty({ description: '执行结果', enum: TaskRunStatus })
  status: TaskRunStatus;

  @ApiProperty({ description: '开始时间' })
  startedAt: Date;

  @ApiPropertyOptional({
    description: '结束时间；未结束为 null',
    nullable: true,
  })
  finishedAt: Date | null;

  @ApiPropertyOptional({
    description: '耗时（毫秒）',
    nullable: true,
  })
  durationMs: number | null;

  @ApiPropertyOptional({
    description: '错误摘要（失败时）',
    nullable: true,
  })
  errorSummary: string | null;

  @ApiProperty({ description: '触发方式', enum: TaskRunTrigger })
  trigger: TaskRunTrigger;

  @ApiPropertyOptional({
    description: '手动触发操作人用户 ID',
    nullable: true,
  })
  triggeredBy: string | null;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;
}

export class TaskRunListResponseDto {
  @ApiProperty({ type: [TaskRunDto], description: '任务执行记录列表' })
  data: TaskRunDto[];

  @ApiProperty({
    description: '分页信息',
    example: { page: 1, limit: 20, total: 0, totalPages: 0 },
  })
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class TaskRunTriggerResultDto {
  @ApiProperty({ description: '是否触发成功' })
  success: boolean;

  @ApiProperty({ description: '任务名' })
  taskName: string;

  @ApiProperty({ description: '触发时间' })
  triggeredAt: Date;
}
