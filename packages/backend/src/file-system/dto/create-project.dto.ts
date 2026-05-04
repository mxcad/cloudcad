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
import { IsString, IsOptional, Length } from 'class-validator';

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
}
