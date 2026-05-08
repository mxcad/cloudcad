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
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 验证邮箱并完成手机号注册 DTO
 */
export class VerifyEmailAndRegisterPhoneDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @ApiProperty({
    description: '邮箱验证码（6位数字）',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;

  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
  })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  phone: string;

  @ApiProperty({
    description: '手机验证码（6位数字）',
    example: '123456',
  })
  @IsString({ message: '手机验证码必须是字符串' })
  @IsNotEmpty({ message: '手机验证码不能为空' })
  phoneCode: string;

  @ApiProperty({
    description: '用户名',
    example: 'username',
    minLength: 3,
    maxLength: 20,
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
    example: 'Password123!',
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
 * 绑定邮箱并登录 DTO（用于已注册但没有邮箱的用户）
 */
export class BindEmailAndLoginDto {
  @ApiProperty({
    description: '临时令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: '临时令牌必须是字符串' })
  @IsNotEmpty({ message: '临时令牌不能为空' })
  tempToken: string;

  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @ApiProperty({
    description: '邮箱验证码',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;
}

/**
 * 绑定手机号并登录 DTO（用于已注册但没有手机号的用户）
 */
export class BindPhoneAndLoginDto {
  @ApiProperty({
    description: '临时令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: '临时令牌必须是字符串' })
  @IsNotEmpty({ message: '临时令牌不能为空' })
  tempToken: string;

  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
  })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  phone: string;

  @ApiProperty({
    description: '验证码',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;
}

/**
 * 验证解绑验证码 DTO（邮箱/手机号通用）
 */
export class VerifyUnbindCodeDto {
  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;
}

/**
 * 换绑邮箱 DTO
 */
export class RebindEmailDto {
  @ApiProperty({
    description: '新邮箱地址',
    example: 'newuser@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @ApiProperty({
    description: '新邮箱验证码',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;

  @ApiProperty({
    description: '解绑原邮箱的验证令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: '令牌必须是字符串' })
  @IsNotEmpty({ message: '令牌不能为空' })
  token: string;
}

/**
 * 换绑手机号 DTO
 */
export class RebindPhoneDto {
  @ApiProperty({
    description: '新手机号（中国大陆，可带 +86 前缀）',
    example: '13900139000',
  })
  @IsString({ message: '手机号必须是字符串' })
  @IsNotEmpty({ message: '手机号不能为空' })
  phone: string;

  @ApiProperty({
    description: '新手机号验证码',
    example: '123456',
  })
  @IsString({ message: '验证码必须是字符串' })
  @IsNotEmpty({ message: '验证码不能为空' })
  code: string;

  @ApiProperty({
    description: '解绑原手机号的验证令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: '令牌必须是字符串' })
  @IsNotEmpty({ message: '令牌不能为空' })
  token: string;
}
