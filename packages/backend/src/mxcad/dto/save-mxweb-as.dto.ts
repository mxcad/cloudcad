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
    description: '保存类型: personal-我的图纸, project-项目',
    enum: ['personal', 'project'],
  })
  @IsIn(['personal', 'project'])
  targetType: 'personal' | 'project';

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
    description: '保存格式: dwg, dxf',
    enum: ['dwg', 'dxf'],
    default: 'dwg',
  })
  @IsIn(['dwg', 'dxf'])
  @IsOptional()
  format?: 'dwg' | 'dxf' = 'dwg';

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
}
