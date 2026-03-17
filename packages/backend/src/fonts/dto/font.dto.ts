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
import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * 字体上传目标枚举
 */
export enum FontUploadTarget {
  /** 仅上传到后端转换程序目录 */
  BACKEND = 'backend',
  /** 仅上传到前端资源目录 */
  FRONTEND = 'frontend',
  /** 同时上传到两个目录 */
  BOTH = 'both',
}

/**
 * 字体上传 DTO
 */
export class UploadFontDto {
  @ApiProperty({
    description: '上传目标',
    enum: FontUploadTarget,
    default: FontUploadTarget.BOTH,
  })
  @IsEnum(FontUploadTarget)
  @IsOptional()
  target?: FontUploadTarget;
}

/**
 * 字体删除 DTO
 */
export class DeleteFontDto {
  @ApiProperty({
    description: '删除目标',
    enum: FontUploadTarget,
    default: FontUploadTarget.BOTH,
  })
  @IsEnum(FontUploadTarget)
  @IsOptional()
  target?: FontUploadTarget;
}

/**
 * 字体信息响应 DTO
 */
export class FontInfoDto {
  @ApiProperty({ description: '字体文件名' })
  @IsString()
  name: string;

  @ApiProperty({ description: '文件大小（字节）' })
  size: number;

  @ApiProperty({ description: '文件扩展名' })
  extension: string;

  @ApiProperty({ description: '后端目录是否存在' })
  existsInBackend: boolean;

  @ApiProperty({ description: '前端目录是否存在' })
  existsInFrontend: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiProperty({ description: '创建者' })
  creator?: string;
}
