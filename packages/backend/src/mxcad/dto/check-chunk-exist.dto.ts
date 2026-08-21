///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CheckChunkExistDto {
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

  @ApiPropertyOptional({
    description: '节点ID（可选，匿名用户可为空）',
    example: 'clx1234567890',
  })
  @IsString()
  @IsOptional()
  nodeId?: string;

  @ApiProperty({
    description: '分片索引',
    example: 0,
  })
  @IsNumber()
  @IsNotEmpty()
  chunk: number;

  @ApiProperty({
    description: '总分片数量',
    example: 10,
  })
  @IsNumber()
  @IsNotEmpty()
  chunks: number;

  @ApiProperty({
    description: '分片大小（字节）',
    example: 1048576,
  })
  @IsNumber()
  @IsNotEmpty()
  size: number;
}

export class CheckChunkExistResponseDto {
  @ApiProperty({
    description: '分片是否存在',
    example: true,
  })
  @IsBoolean()
  exists: boolean;
}