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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, Length } from 'class-validator';
import { CrossProjectTransferMode } from '@cloudcad/db';

const TRANSFER_MODES = Object.values(CrossProjectTransferMode);

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称', example: 'CAD图纸项目' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ description: '项目描述', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  // 跨项目转移 6 域（全部可选：省略字段回落 Prisma schema 默认值，
  // 与 UpdateTransferSettingsDto 同构，创建时即可设定转移策略）
  @ApiPropertyOptional({
    description: '出向：本项目文件 → 其他项目',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferOutToProject?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '出向：本项目文件 → 个人空间（默认禁止，防图纸私有化）',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferOutToPersonalSpace?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '出向：本项目文件 → 公共资源库（发布，默认仅复制）',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferOutToLibrary?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '入向：其他项目文件 → 本项目',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferInFromProject?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '入向：个人空间文件 → 本项目',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferInFromPersonalSpace?: CrossProjectTransferMode;

  @ApiPropertyOptional({
    description: '入向：公共资源库文件 → 本项目',
    enum: TRANSFER_MODES,
    enumName: 'CrossProjectTransferModeEnum',
  })
  @IsOptional()
  @IsIn(TRANSFER_MODES)
  transferInFromLibrary?: CrossProjectTransferMode;
}
