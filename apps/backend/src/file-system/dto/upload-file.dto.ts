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
 * 文件上传 DTO
 */
export class UploadFileDto {
  @ApiProperty({ description: '文件名称' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '文件内容（base64编码）', required: false })
  @IsString()
  @IsOptional()
  fileContent?: string;

  @ApiProperty({ description: '父节点ID' })
  @IsString()
  parentId: string;
}
