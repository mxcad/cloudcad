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

/**
 * 上传缩略图响应数据 DTO
 */
export class UploadThumbnailDataDto {
  @ApiProperty({
    description: '文件名',
    type: String,
  })
  fileName: string;
}

/**
 * 上传缩略图响应 DTO
 */
export class UploadThumbnailResponseDto {
  @ApiProperty({
    description: '响应状态码',
    example: 0,
    type: Number,
  })
  code: number;

  @ApiProperty({
    description: '响应消息',
    example: '缩略图上传成功',
    type: String,
  })
  message: string;

  @ApiProperty({
    description: '响应数据',
    type: UploadThumbnailDataDto,
  })
  data: UploadThumbnailDataDto;
}
