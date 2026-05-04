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

import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 检查文件是否存在的 DTO（秒传检查）
 */
export class CheckFileDto {
  /** 文件名 */
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: '文件名' })
  filename: string;

  /** 文件 MD5 哈希 */
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: '文件 MD5 哈希' })
  fileHash: string;
}

/**
 * 文件存在检查响应 DTO
 */
export class CheckFileResponseDto {
  /** 文件是否已存在 */
  @ApiProperty({ description: '文件是否已存在' })
  exist: boolean;

  /** 如果存在，返回文件哈希 */
  @ApiPropertyOptional({ description: '文件哈希' })
  hash?: string;

  /** 原始文件名 */
  @ApiPropertyOptional({ description: '原始文件名' })
  fileName?: string;
}
