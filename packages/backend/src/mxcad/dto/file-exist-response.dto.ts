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
 * 文件存在检查响应 DTO
 */
export class FileExistResponseDto {
  @ApiProperty({
    description: '文件是否已存在（秒传）',
    type: Boolean,
  })
  exists: boolean;

  @ApiProperty({
    description: '已存在文件的节点 ID（秒传时返回）',
    type: String,
    required: false,
  })
  nodeId?: string;
}
