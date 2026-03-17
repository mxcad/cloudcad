///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: '6位数字验证码',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class SendVerificationDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;
}

// 响应DTO
export class VerifyEmailResponseDto {
  @ApiProperty({
    description: '操作结果',
    example: '邮箱验证成功',
  })
  message: string;
}

export class SendVerificationResponseDto {
  @ApiProperty({
    description: '操作结果',
    example: '验证邮件已发送',
  })
  message: string;
}

// Swagger响应DTO
export class VerifyEmailApiResponseDto {
  @ApiProperty({ type: () => VerifyEmailResponseDto })
  code: string;
  @ApiProperty()
  message: string;
  @ApiProperty({ type: () => VerifyEmailResponseDto })
  data: VerifyEmailResponseDto;
  @ApiProperty()
  timestamp: string;
}

export class SendVerificationApiResponseDto {
  @ApiProperty({ type: () => SendVerificationResponseDto })
  code: string;
  @ApiProperty()
  message: string;
  @ApiProperty({ type: () => SendVerificationResponseDto })
  data: SendVerificationResponseDto;
  @ApiProperty()
  timestamp: string;
}
