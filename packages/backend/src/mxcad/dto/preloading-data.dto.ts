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
import { IsString, IsBoolean, IsArray, IsNumber } from 'class-validator';

export class PreloadingFileInfoDto {
  @ApiProperty({ description: '文件名' })
  @IsString()
  name: string;

  @ApiProperty({ description: '文件大小（字节），文件不存在时为 0' })
  @IsNumber()
  size: number;

  @ApiProperty({ description: '文件类型：dwg / image' })
  @IsString()
  type: 'dwg' | 'image';
}

export class PreloadingDataDto {
  @ApiProperty({ description: '是否为图纸' })
  @IsBoolean()
  tz: boolean;

  @ApiProperty({ description: '源文件哈希值' })
  @IsString()
  src_file_md5: string;

  @ApiProperty({ description: '图片列表', type: [PreloadingFileInfoDto] })
  @IsArray()
  images: PreloadingFileInfoDto[];

  @ApiProperty({ description: '外部参照列表', type: [PreloadingFileInfoDto] })
  @IsArray()
  externalReference: PreloadingFileInfoDto[];
}
