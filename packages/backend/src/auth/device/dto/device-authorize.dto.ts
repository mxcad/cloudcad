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
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 用户确认授权 — 请求
 */
export class DeviceAuthorizeRequestDto {
  @ApiProperty({ description: '用户码', example: 'HDKF-QLMD' })
  @IsString()
  @IsNotEmpty()
  user_code: string;
}

/**
 * 用户确认授权 — 响应
 */
export class DeviceAuthorizeResponseDto {
  @ApiProperty({ description: '授权结果', example: true })
  success: boolean;

  constructor(success: boolean) {
    this.success = success;
  }
}
