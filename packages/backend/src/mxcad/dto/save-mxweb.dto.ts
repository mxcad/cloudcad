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
import { IsString, IsOptional } from 'class-validator';

/**
 * 保存 mxweb 文件请求体 DTO
 */
export class SaveMxwebDto {
  @ApiProperty({
    description: 'mxweb 文件',
    type: 'string',
    format: 'binary',
  })
  file: any;

  @ApiProperty({
    description: '提交信息',
    required: false,
    example: '保存图纸修改',
  })
  @IsString()
  @IsOptional()
  commitMessage?: string;
}
