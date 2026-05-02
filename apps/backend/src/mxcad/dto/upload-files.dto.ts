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
import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';

/**
 * 上传文件请求体 DTO
 */
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
    description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）',
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
    description: '冲突策略：skip（跳过）/ overwrite（覆盖）/ rename（重命名，默认）',
    required: false,
    enum: ['skip', 'overwrite', 'rename'],
  })
  @IsOptional()
  @IsIn(['skip', 'overwrite', 'rename'])
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';
}
