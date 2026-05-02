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
import { IsString, IsOptional } from 'class-validator';

export class UpdateProjectMemberDto {
  @ApiProperty({ description: '项目角色ID', required: false })
  @IsString()
  @IsOptional()
  projectRoleId?: string;

  @ApiProperty({
    description: '角色ID（兼容字段，与 projectRoleId 相同）',
    required: false,
  })
  @IsString()
  @IsOptional()
  roleId?: string;
}
