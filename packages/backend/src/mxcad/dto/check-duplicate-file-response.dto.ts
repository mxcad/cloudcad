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

import { ApiProperty } from '@nestjs/swagger';

/**
 * 检查目录中是否存在重复文件响应 DTO
 */
export class CheckDuplicateFileResponseDto {
  @ApiProperty({
    description: '是否存在重复文件',
    example: false,
  })
  isDuplicate: boolean;

  @ApiProperty({
    description: '重复文件节点 ID（如果存在）',
    example: 'clx1234567890',
    nullable: true,
  })
  existingNodeId?: string;

  @ApiProperty({
    description: '重复文件名称（如果存在）',
    example: 'drawing.dwg',
    nullable: true,
  })
  existingFileName?: string;
}
