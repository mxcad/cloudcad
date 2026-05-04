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

export class SaveMxwebAsResponseDto {
  @ApiProperty({
    description: '是否成功',
  })
  success: boolean;

  @ApiProperty({
    description: '消息',
  })
  message: string;

  @ApiProperty({
    description: '新文件节点ID',
  })
  nodeId: string;

  @ApiProperty({
    description: '文件名',
  })
  fileName: string;

  @ApiProperty({
    description: '文件路径',
  })
  path: string;

  @ApiProperty({
    description: '项目ID',
    required: false,
  })
  projectId?: string;

  @ApiProperty({
    description: '父节点ID',
  })
  parentId: string;
}
