///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * 上传外部参照文件 DTO
 */
export class UploadExtReferenceDto {
  @ApiProperty({
    description: '上传的文件',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  file: any;

  @ApiProperty({
    description: '文件哈希值（用于 Multer 文件名生成）',
    example: '25e89b5adf19984330f4e68b0f99db64',
    required: false,
  })
  @IsString()
  @IsOptional()
  hash?: string;

  @ApiProperty({
    description: '源图纸文件的节点 ID（FileSystemNode ID）',
    example: 'cml8t8wg60004ucufd7pb3sq6',
  })
  @IsString()
  @IsNotEmpty()
  nodeId: string;

  @ApiProperty({
    description: '外部参照文件名（含扩展名）',
    example: 'ref1.dwg',
  })
  @IsString()
  @IsNotEmpty()
  ext_ref_file: string;
}
