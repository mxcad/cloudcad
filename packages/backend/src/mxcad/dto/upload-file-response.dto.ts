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
 * 上传文件响应 DTO
 */
export class UploadFileResponseDto {
  @ApiProperty({
    description: '上传文件的节点 ID',
    type: String,
    required: false,
  })
  nodeId?: string;

  @ApiProperty({
    description: '是否为图纸文件',
    type: Boolean,
    required: false,
  })
  tz?: boolean;
}
