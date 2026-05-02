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
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class PermissionsDto {
  @ApiProperty({
    description: '权限 ID 列表',
    example: ['PROJECT_UPDATE', 'PROJECT_DELETE', 'FILE_CREATE'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  permissions!: string[];
}
