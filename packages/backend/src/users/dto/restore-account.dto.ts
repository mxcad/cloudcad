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
import { IsString } from 'class-validator';

export class RestoreAccountDto {
  @ApiProperty({
    description: '恢复验证方式：password | phoneCode | emailCode',
    example: 'password',
  })
  @IsString()
  verificationMethod: 'password' | 'phoneCode' | 'emailCode';

  @ApiProperty({ description: '密码或验证码', example: 'UserPassword123!' })
  @IsString()
  code: string;
}

export class RestoreAccountResponseDto {
  @ApiProperty({ description: '消息' })
  message: string;
}
