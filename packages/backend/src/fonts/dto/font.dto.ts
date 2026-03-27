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
