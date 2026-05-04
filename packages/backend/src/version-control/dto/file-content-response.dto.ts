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

/**
 * 文件内容响应 DTO
 */
export class FileContentResponseDto {
  @ApiProperty({
    description: '操作是否成功',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: '响应消息',
    example: '获取成功',
  })
  message: string;

  @ApiPropertyOptional({
    description: '文件内容（Base64 编码）',
    example: 'base64encodedcontent...',
  })
  content?: string;
}
