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

export class ApiResponseDto<T> {
  @ApiProperty({
    description: '响应状态码',
    example: 'SUCCESS',
    enum: ['SUCCESS', 'ERROR'],
  })
  code: string;

  @ApiProperty({
    description: '响应消息',
    example: '操作成功',
  })
  message: string;

  @ApiProperty({
    description: '响应数据',
  })
  data: T;

  @ApiProperty({
    description: '响应时间戳',
    example: '2025-12-12T03:34:55.801Z',
  })
  timestamp: string;
}
