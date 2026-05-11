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
import { IsString, IsIn, IsOptional } from 'class-validator';

export class SaveMxwebAsDto {
  @ApiProperty({
    description: 'mxweb 文件',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  file?: Express.Multer.File;

  @ApiProperty({
    description: '保存类型: personal-我的图纸, project-项目, library-资源库',
    enum: ['personal', 'project', 'library'],
  })
  @IsIn(['personal', 'project', 'library'])
  targetType: 'personal' | 'project' | 'library';

  @ApiProperty({
    description: '目标父节点ID',
  })
  @IsString()
  targetParentId: string;

  @ApiProperty({
    description: '项目ID（targetType为project时必填）',
    required: false,
  })
  @IsString()
  @IsOptional()
  projectId?: string;

  @ApiProperty({
    description: '保存格式: dwg, dxf, mxweb（磁盘始终存为 .mxweb，此后缀仅用于数据库文件名）',
    enum: ['dwg', 'dxf', 'mxweb'],
    default: 'dwg',
  })
  @IsIn(['dwg', 'dxf', 'mxweb'])
  @IsOptional()
  format?: 'dwg' | 'dxf' | 'mxweb' = 'dwg';

  @ApiProperty({
    description: '提交信息',
    required: false,
  })
  @IsString()
  @IsOptional()
  commitMessage?: string;

  @ApiProperty({
    description: '文件名（不含扩展名）',
    required: false,
  })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiProperty({
    description: '资源库类型（targetType为library时必填）',
    enum: ['drawing', 'block'],
    required: false,
  })
  @IsIn(['drawing', 'block'])
  @IsOptional()
  libraryType?: 'drawing' | 'block';
}
