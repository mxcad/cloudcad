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
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class InitiateMultipartUploadDto {
  @ApiProperty({ description: '文件名' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '文件大小（字节）' })
  @IsNumber()
  fileSize: number;

  @ApiProperty({ description: '父节点ID', required: false })
  @IsString()
  @IsOptional()
  parentId?: string;
}

export class UploadChunkDto {
  @ApiProperty({ description: '上传会话ID' })
  @IsString()
  uploadId: string;

  @ApiProperty({ description: '分片索引（从0开始）' })
  @IsNumber()
  chunkIndex: number;

  @ApiProperty({ description: '分片数据（base64编码）' })
  @IsString()
  chunkData: string;
}

export class CompleteMultipartUploadDto {
  @ApiProperty({ description: '上传会话ID' })
  @IsString()
  uploadId: string;

  @ApiProperty({
    description: '分片信息',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        partNumber: { type: 'number' },
        etag: { type: 'string' },
      },
    },
  })
  parts: Array<{
    partNumber: number;
    etag: string;
  }>;
}

export class UploadProgressDto {
  @ApiProperty({ description: '上传会话ID' })
  @IsString()
  uploadId: string;
}
