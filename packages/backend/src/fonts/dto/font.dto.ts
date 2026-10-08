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
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

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
    enum: Object.values(FontUploadTarget),
    enumName: 'FontUploadTarget',
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
    enum: Object.values(FontUploadTarget),
    enumName: 'FontUploadTarget',
    default: FontUploadTarget.BOTH,
  })
  @IsEnum(FontUploadTarget)
  @IsOptional()
  target?: FontUploadTarget;
}

/**
 * 批量删除字体 DTO
 */
export class BatchDeleteFontDto {
  @ApiProperty({ description: '要删除的字体文件名列表' })
  @IsArray()
  @IsString({ each: true })
  fileNames: string[];

  @ApiProperty({
    description: '删除目标',
    enum: Object.values(FontUploadTarget),
    enumName: 'FontUploadTarget',
    default: FontUploadTarget.BOTH,
    required: false,
  })
  @IsEnum(FontUploadTarget)
  @IsOptional()
  target?: FontUploadTarget;
}
