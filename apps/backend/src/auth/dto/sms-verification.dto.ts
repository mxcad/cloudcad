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
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 发送短信验证码 DTO
 */
export class SendSmsCodeDto {
  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
    pattern: '^(\\+86)?1[3-9]\\d{9}$',
  })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })
  phone: string;
}

/**
 * 验证短信验证码 DTO
 */
export class VerifySmsCodeDto {
  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
    pattern: '^(\\+86)?1[3-9]\\d{9}$',
  })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  @MinLength(6, { message: '验证码必须是6位' })
  @MaxLength(6, { message: '验证码必须是6位' })
  @Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })
  code: string;
}

/**
 * 手机号注册 DTO
 */
export class RegisterByPhoneDto {
  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
    pattern: '^(\\+86)?1[3-9]\\d{9}$',
  })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  @MinLength(6, { message: '验证码必须是6位' })
  @MaxLength(6, { message: '验证码必须是6位' })
  @Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })
  code: string;

  @ApiProperty({
    type: String,
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
    type: String,
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

  @ApiPropertyOptional({
    description: '昵称',
    example: '用户昵称',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @MaxLength(50, { message: '昵称最多50个字符' })
  nickname?: string;
}

/**
 * 手机号登录 DTO
 */
export class LoginByPhoneDto {
  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
    pattern: '^(\\+86)?1[3-9]\\d{9}$',
  })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  @MinLength(6, { message: '验证码必须是6位' })
  @MaxLength(6, { message: '验证码必须是6位' })
  @Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })
  code: string;
}

/**
 * 绑定手机号 DTO
 */
export class BindPhoneDto {
  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
    pattern: '^(\\+86)?1[3-9]\\d{9}$',
  })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  @MinLength(6, { message: '验证码必须是6位' })
  @MaxLength(6, { message: '验证码必须是6位' })
  @Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })
  code: string;
}
