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
import { IsString, IsOptional, IsIn } from 'class-validator';

/**
 * CAD 文件下载格式枚举
 */
export enum CadDownloadFormat {
  /** DWG 格式（通过 mxweb 转换） */
  DWG = 'dwg',
  /** DXF 格式（通过 mxweb 转换） */
  DXF = 'dxf',
  /** MXWEB 格式（直接下载） */
  MXWEB = 'mxweb',
  /** PDF 格式（通过 mxweb 转换） */
  PDF = 'pdf',
}

/**
 * PDF 转换参数
 */
export class PdfConversionParams {
  @ApiProperty({
    description: '输出宽度（像素）',
    required: false,
    default: '2000',
  })
  @IsOptional()
  @IsString()
  width?: string;

  @ApiProperty({
    description: '输出高度（像素）',
    required: false,
    default: '2000',
  })
  @IsOptional()
  @IsString()
  height?: string;

  @ApiProperty({
    description: '颜色策略：mono（单色）、color（彩色）',
    required: false,
    default: 'mono',
  })
  @IsOptional()
  @IsString()
  colorPolicy?: string;
}

/**
 * 节点下载查询参数 DTO
 */
export class DownloadNodeQueryDto {
  @ApiProperty({
    description: '下载格式（仅 CAD 文件有效）',
    enum: Object.values(CadDownloadFormat),
    enumName: 'CadDownloadFormat',
    required: false,
    default: CadDownloadFormat.MXWEB,
  })
  @IsOptional()
  @IsIn(Object.values(CadDownloadFormat))
  format?: CadDownloadFormat;

  @ApiProperty({
    description: 'PDF 输出宽度（像素），仅当 format=pdf 时有效',
    required: false,
    default: '2000',
  })
  @IsOptional()
  @IsString()
  width?: string;

  @ApiProperty({
    description: 'PDF 输出高度（像素），仅当 format=pdf 时有效',
    required: false,
    default: '2000',
  })
  @IsOptional()
  @IsString()
  height?: string;

  @ApiProperty({
    description: 'PDF 颜色策略（mono/color），仅当 format=pdf 时有效',
    required: false,
    default: 'mono',
  })
  @IsOptional()
  @IsString()
  colorPolicy?: string;
}
