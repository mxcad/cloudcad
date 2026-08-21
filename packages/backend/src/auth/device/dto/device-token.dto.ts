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
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * 轮询获取 Token — 请求
 */
export class DeviceTokenRequestDto {
  @ApiProperty({
    description: '授权类型',
    example: 'urn:ietf:params:oauth:grant-type:device_code',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['urn:ietf:params:oauth:grant-type:device_code'])
  grant_type: string;

  @ApiProperty({ description: '设备码', example: 'GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9e' })
  @IsString()
  @IsNotEmpty()
  device_code: string;

  @ApiProperty({ description: '客户端标识', example: 'mx_cad_viewer' })
  @IsString()
  @IsNotEmpty()
  client_id: string;
}

/**
 * 轮询获取 Token — 成功响应
 */
export class DeviceTokenResponseDto {
  @ApiProperty({ description: '访问令牌', example: 'eyJhbGciOiJSUzI1NiIs...' })
  access_token: string;

  @ApiProperty({ description: '令牌类型', example: 'Bearer' })
  token_type: string;

  @ApiProperty({ description: '过期时间（秒）', example: 604800 })
  expires_in: number;

  @ApiPropertyOptional({ description: '刷新令牌', example: 'eyJhbGciOiJIUzI1NiIs...' })
  refresh_token?: string;

  @ApiPropertyOptional({ description: '作用域', example: 'vip' })
  scope?: string;

  constructor(partial: Partial<DeviceTokenResponseDto>) {
    Object.assign(this, partial);
  }
}
