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
 * 检查缩略图响应 DTO
 */
export class CheckThumbnailResponseDto {
  @ApiProperty({
    description: '响应状态码',
    example: 0,
    type: Number,
  })
  code: number;

  @ApiProperty({
    description: '响应消息',
    example: 'ok',
    type: String,
  })
  message: string;

  @ApiProperty({
    description: '缩略图是否存在',
    type: Boolean,
  })
  exists: boolean;
}
