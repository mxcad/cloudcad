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
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

/**
 * 检查分片是否存在请求 DTO
 */
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

  @ApiProperty({
    description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）',
    example: 'clx1234567890',
  })
  @IsString()
  @IsNotEmpty()
  nodeId: string;

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
