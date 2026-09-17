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

/**
 * 通知中心 HTTP DTO。
 *
 * 更新接口刻意只开放 level / title / body：v1 禁止 PATCH startAt / endAt / userId，
 * 否则「改到窗口外」的公告既不会撤回、也不会重新推送，状态机难以穷举。
 * 需要改时间窗请直接下线后重新发布。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  NOTICE_KINDS,
  NOTICE_LEVELS,
  type NoticeKind,
  type NoticeLevel,
} from '../notice.types';

export class CreateNoticeDto {
  @ApiProperty({
    enum: NOTICE_KINDS,
    description: '通知类型',
    example: 'system',
  })
  @IsIn(NOTICE_KINDS)
  kind!: NoticeKind;

  @ApiProperty({
    enum: NOTICE_LEVELS,
    description: '通知级别，驱动弹框配色与队列优先级',
    default: 'info',
  })
  @IsOptional()
  @IsIn(NOTICE_LEVELS)
  level?: NoticeLevel;

  @ApiProperty({
    description: '标题，按管理员填写的原文渲染，不走 i18n',
    example: '系统将于 30 分钟后停机维护',
  })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: '正文纯文本，支持换行，按原文渲染，不走 i18n',
    example: '本次维护涉及转换服务升级，届时文件转换与格式导出会中断。',
  })
  @IsString()
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({
    description: '定向用户 ID；为空表示广播给所有用户',
    example: 'usr_abc123',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: '生效开始时间；为空表示发布即生效。未来的 startAt 不会立即推送，由定时任务到点处理',
  })
  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: '失效时间；为空表示手动下线',
  })
  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @ApiPropertyOptional({
    description: '到期自动下线（依赖 endAt）',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoExpire?: boolean;

  @ApiPropertyOptional({
    description: 'false = 保存为草稿（不发布、不推送）',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}

/** v1 只允许改文案与级别；时间窗与受众冻结（见文件头注释） */
export class UpdateNoticeDto {
  @ApiPropertyOptional({ enum: NOTICE_LEVELS, description: '通知级别' })
  @IsOptional()
  @IsIn(NOTICE_LEVELS)
  level?: NoticeLevel;

  @ApiPropertyOptional({ description: '标题（后端原文）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '正文（后端原文，支持换行）' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

export class NoticeResponseDto {
  @ApiProperty({ description: '通知 ID' })
  id!: string;

  @ApiProperty({ description: '通知类型' })
  kind!: string;

  @ApiProperty({ description: '通知级别' })
  level!: string;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '正文' })
  body!: string;

  @ApiPropertyOptional({ description: '定向用户 ID，null 表示广播' })
  userId!: string | null;

  @ApiPropertyOptional({ description: '生效开始时间' })
  startAt!: Date | null;

  @ApiPropertyOptional({ description: '自动失效时间' })
  endAt!: Date | null;

  @ApiProperty({ description: '到期自动下线' })
  autoExpire!: boolean;

  @ApiPropertyOptional({ description: '发布时间，null 表示草稿' })
  publishedAt!: Date | null;

  @ApiPropertyOptional({ description: '已推送时间（null 表示待定时任务推送）' })
  notifiedAt!: Date | null;

  @ApiPropertyOptional({ description: '下线时间，null 表示未下线' })
  retractedAt!: Date | null;

  @ApiPropertyOptional({ description: '发布人 ID' })
  publishedById!: string | null;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export class NoticeTicketDto {
  @ApiProperty({
    description: '一次性连接票据，5 分钟内有效，连接时立即失效',
  })
  ticket!: string;
}
