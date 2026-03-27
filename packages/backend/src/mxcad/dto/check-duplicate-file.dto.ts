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
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * 检查目录中是否存在重复文件请求 DTO
 */
export class CheckDuplicateFileDto {
  @ApiProperty({
    description: '文件 MD5 哈希值',
    example: '25e89b5adf19984330f4e68b0f99db64',
  })
  @IsString()
  @IsNotEmpty()
  fileHash: string;

  @ApiProperty({
    description: '原始文件名',
    example: 'drawing.dwg',
  })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({
    description: '目标目录节点 ID',
    example: 'clx1234567890',
  })
  @IsString()
  @IsNotEmpty()
  nodeId: string;

  @ApiPropertyOptional({
    description: '当前打开的文件节点 ID（可选，用于排除当前文件）',
    example: 'clx9876543210',
  })
  @IsString()
  @IsOptional()
  currentFileId?: string;
}
