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
import { AlertLevel, AlertStatus } from '../enums/alert.enum';

export class QueryAlertDto {
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
    description: '按告警级别过滤：WARNING | CRITICAL',
    enum: AlertLevel,
  })
  @IsOptional()
  @IsEnum(AlertLevel)
  level?: AlertLevel;

  @ApiPropertyOptional({
    description: '按告警状态过滤：OPEN | RESOLVED',
    enum: AlertStatus,
  })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({
    description: '按告警来源过滤（精确匹配，如 disk-monitor / cache-monitor）',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}

export class AlertRecordDto {
  @ApiProperty({ description: '告警 ID' })
  id: string;

  @ApiProperty({ description: '告警来源（触发源标识）' })
  source: string;

  @ApiProperty({ description: '告警消息键（模板 key）' })
  messageKey: string;

  @ApiProperty({ description: '告警级别', enum: AlertLevel })
  level: AlertLevel;

  @ApiProperty({ description: '告警消息' })
  message: string;

  @ApiPropertyOptional({
    description: '动态详情（JSON 对象）',
    nullable: true,
  })
  detail?: Record<string, unknown> | null;

  @ApiProperty({ description: '告警状态', enum: AlertStatus })
  status: AlertStatus;

  @ApiPropertyOptional({
    description: '解决时间；未解决为 null',
    nullable: true,
  })
  resolvedAt: Date | null;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

export class AlertListResponseDto {
  @ApiProperty({ type: [AlertRecordDto], description: '告警列表' })
  data: AlertRecordDto[];

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
