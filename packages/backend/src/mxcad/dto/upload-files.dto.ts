///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';

export class UploadFilesDto {
  @ApiProperty({
    description: '上传的文件',
    type: 'string',
    format: 'binary',
    required: false,
  })
  @IsOptional()
  file?: Express.Multer.File;

  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  hash: string;

  @ApiProperty({ description: '原始文件名' })
  @IsString()
  name: string;

  @ApiProperty({ description: '文件总大小（字节）' })
  @IsNumber()
  size: number;

  @ApiProperty({
    description: '分片索引（分片上传时必填）',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  chunk?: number;

  @ApiProperty({
    description: '总分片数量（分片上传时必填）',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  chunks?: number;

  @ApiProperty({
    description: '节点ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiProperty({
    description: '源图纸节点 ID（外部参照上传时使用）',
    required: false,
  })
  @IsOptional()
  @IsString()
  srcDwgNodeId?: string;

  @ApiProperty({
    description: '文件ID（前端传递的标识符）',
    required: false,
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: '文件类型（如 dwg、dxf）',
    required: false,
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({
    description: '文件最后修改日期',
    required: false,
  })
  @IsOptional()
  @IsString()
  lastModifiedDate?: string;

  @ApiProperty({
    description: '冲突策略',
    required: false,
    enum: ['skip', 'overwrite', 'rename'],
  })
  @IsOptional()
  @IsIn(['skip', 'overwrite', 'rename'])
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';

  @ApiProperty({
    description: '跳过 DB/转换/MX 等后续操作，仅上传文件到 uploads 目录',
    required: false,
  })
  @IsOptional()
  skipDb?: boolean;
}
