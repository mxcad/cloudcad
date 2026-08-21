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
 * 申请设备码 — 请求
 */
export class DeviceCodeRequestDto {
  @ApiProperty({
    description: '客户端标识',
    example: 'mx_cad_viewer',
  })
  @IsString()
  @IsNotEmpty()
  client_id: string;
}

/**
 * 申请设备码 — 响应
 */
export class DeviceCodeResponseDto {
  @ApiProperty({ description: '设备码（用于轮询）' })
  device_code: string;

  @ApiProperty({ description: '用户码（人类可读，格式 XXXX-XXXX）', example: 'HDKF-QLMD' })
  user_code: string;

  @ApiProperty({ description: '验证 URI（不含 user_code）', example: 'https://example.com/device' })
  verification_uri: string;

  @ApiProperty({ description: '完整验证 URI（含 user_code，浏览器直接打开）', example: 'https://example.com/device?user_code=HDKF-QLMD' })
  verification_uri_complete: string;

  @ApiProperty({ description: '设备码过期时间（秒）', example: 300 })
  expires_in: number;

  @ApiProperty({ description: '轮询间隔建议（秒）', example: 5 })
  interval: number;

  constructor(partial: Partial<DeviceCodeResponseDto>) {
    Object.assign(this, partial);
  }
}
