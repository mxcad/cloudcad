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
import { SvnLogPathDto } from './svn-log-path.dto';

/**
 * SVN 提交记录条目 DTO
 */
export class SvnLogEntryDto {
  @ApiProperty({
    description: '修订版本号',
    example: 123,
  })
  revision: number;

  @ApiProperty({
    description: '提交作者',
    example: 'user@example.com',
  })
  author: string;

  @ApiProperty({
    description: '提交日期',
    type: 'string',
    format: 'date-time',
    example: '2026-03-03T10:30:00.000Z',
  })
  date: Date;

  @ApiProperty({
    description: '提交消息',
    example: 'Update drawing file',
  })
  message: string;

  @ApiPropertyOptional({
    description: '提交用户名称（从提交信息中解析）',
    example: '张三',
  })
  userName?: string;

  @ApiPropertyOptional({
    description: '变更路径列表',
    type: [SvnLogPathDto],
  })
  paths?: SvnLogPathDto[];
}
