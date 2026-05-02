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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserCleanupStatsResponseDto {
  @ApiProperty({ description: '待清理用户数', example: 15 })
  pendingCleanup: number;

  @ApiProperty({
    description: '过期截止日期',
    example: '2026-03-11T00:00:00.000Z',
  })
  expiryDate: Date;

  @ApiProperty({ description: '延迟天数', example: 30 })
  delayDays: number;
}

export class UserCleanupTriggerDto {
  @ApiPropertyOptional({
    description: '自定义延迟天数（覆盖默认值）',
    example: 7,
  })
  delayDays?: number;
}

export class UserCleanupTriggerResponseDto {
  @ApiProperty({ description: '消息', example: '清理完成: 处理 0 个用户' })
  message: string;

  @ApiProperty({ description: '是否成功', example: true })
  success: boolean;

  @ApiProperty({ description: '处理的用户数', example: 0 })
  processedUsers: number;

  @ApiProperty({ description: '删除的成员关系数', example: 0 })
  deletedMembers: number;

  @ApiProperty({ description: '删除的项目数', example: 0 })
  deletedProjects: number;

  @ApiProperty({ description: '删除的审计日志数', example: 0 })
  deletedAuditLogs: number;

  @ApiProperty({ description: '标记待清理的存储数', example: 0 })
  markedForStorageCleanup: number;

  @ApiProperty({ description: '错误列表', example: [] })
  errors: Array<{ userId: string; message: string }>;
}
