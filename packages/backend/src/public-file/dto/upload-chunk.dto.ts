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
import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';

/**
 * 上传分片 DTO
 */
export class UploadChunkDto {
  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  @IsNotEmpty()
  hash: string;

  @ApiProperty({ description: '原始文件名' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '文件总大小（字节）' })
  @IsNumber()
  @Min(1)
  size: number;

  @ApiProperty({ description: '当前分片索引（从 0 开始）' })
  @IsNumber()
  @Min(0)
  chunk: number;

  @ApiProperty({ description: '总分片数量' })
  @IsNumber()
  @Min(1)
  chunks: number;
}

/**
 * 合并分片 DTO
 */
export class MergeChunksDto {
  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  @IsNotEmpty()
  hash: string;

  @ApiProperty({ description: '原始文件名' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '文件总大小（字节）' })
  @IsNumber()
  @Min(1)
  size: number;

  @ApiProperty({ description: '总分片数量' })
  @IsNumber()
  @Min(1)
  chunks: number;
}
