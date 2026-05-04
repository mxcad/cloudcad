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
 * SVN 提交记录中的变更路径 DTO
 */
export class SvnLogPathDto {
  @ApiProperty({
    description: '变更动作类型',
    enum: ['A', 'M', 'D', 'R'],
    example: 'A',
  })
  action: 'A' | 'M' | 'D' | 'R';

  @ApiProperty({
    description: '路径类型',
    enum: ['file', 'dir'],
    example: 'file',
  })
  kind: 'file' | 'dir';

  @ApiProperty({
    description: '变更路径',
    example: '/path/to/file.dwg',
  })
  path: string;
}
