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
import { IsString, IsOptional } from 'class-validator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

export class DeactivateAccountDto {
  @ApiPropertyOptional({
    description: '用户密码（密码登录用户必填）',
    example: 'UserPassword123!',
  })
  @IsString({ message: '密码必须是字符串' })
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({
    description: '手机验证码（绑定手机的用户必填）',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsOptional()
  phoneCode?: string;

  @ApiPropertyOptional({
    description: '邮箱验证码（邮箱注册用户必填）',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsOptional()
  emailCode?: string;

  @ApiPropertyOptional({
    description:
      '微信扫码验证（微信登录用户必填，值为 \"confirmed\" 表示已确认）',
    example: 'confirmed',
  })
  @IsString({ message: '微信验证必须是字符串' })
  @IsOptional()
  wechatConfirm?: string;
}

export class DeactivateAccountResponseDto {
  @ApiProperty({ description: '消息' })
  message: string;
}

export class DeactivateAccountApiResponseDto extends ApiResponseDto<DeactivateAccountResponseDto> {
  @ApiProperty({ type: () => DeactivateAccountResponseDto })
  declare data: DeactivateAccountResponseDto;
}
