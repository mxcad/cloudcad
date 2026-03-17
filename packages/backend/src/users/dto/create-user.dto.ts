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
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: '用户邮箱（可选，当 mailEnabled=true 时建议填写）',
    example: 'user@example.com',
    format: 'email',
    required: false,
  })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email?: string;

  @ApiProperty({
    description: '用户名',
    example: 'username',
    minLength: 3,
    maxLength: 20,
    pattern: '^[a-zA-Z0-9_]+$',
  })
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(3, { message: '用户名至少3个字符' })
  @MaxLength(20, { message: '用户名最多20个字符' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: '用户名只能包含字母、数字和下划线',
  })
  username: string;

  @ApiProperty({
    description: '密码',
    example: 'password123',
    minLength: 8,
    maxLength: 50,
  })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(50, { message: '密码最多50个字符' })
  password: string;

  @ApiProperty({ description: '昵称', required: false, maxLength: 50 })
  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @MaxLength(50, { message: '昵称最多50个字符' })
  nickname?: string;

  @ApiProperty({ description: '头像URL', required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({
    description: '角色ID',
    example: 'clh8x9y0z1a2b3c4d5e6f7g8h9',
    required: false,
  })
  @IsOptional()
  @IsString({ message: '角色ID必须是字符串' })
  roleId?: string;
}
