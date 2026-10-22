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
import { I18nContext } from 'nestjs-i18n';
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
  @IsEmail({}, { message: () => I18nContext.current()?.t('validation.email_invalid') ?? '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.email_required') ?? '邮箱不能为空' })
  email: string;

  @ApiProperty({
    description: '邮箱验证码（6位数字）',
    example: '123456',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  code: string;

  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.phone_required') ?? '手机号不能为空' })
  phone: string;

  @ApiProperty({
    description: '手机验证码（6位数字）',
    example: '123456',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.sms_code_must_be_string') ?? '手机验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.sms_code_required') ?? '手机验证码不能为空' })
  phoneCode: string;

  @ApiProperty({
    description: '用户名',
    example: 'username',
    minLength: 3,
    maxLength: 20,
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.username_must_be_string') ?? '用户名必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.username_required') ?? '用户名不能为空' })
  @MinLength(3, { message: () => I18nContext.current()?.t('validation.username_min_length') ?? '用户名至少3个字符' })
  @MaxLength(20, { message: () => I18nContext.current()?.t('validation.username_max_length') ?? '用户名最多20个字符' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: () => I18nContext.current()?.t('validation.username_pattern') ?? '用户名只能包含字母、数字和下划线',
  })
  username: string;

  @ApiProperty({
    description: '密码',
    example: 'Password123!',
    minLength: 8,
    maxLength: 50,
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.password_must_be_string') ?? '密码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.password_required') ?? '密码不能为空' })
  @MinLength(8, { message: () => I18nContext.current()?.t('validation.password_min_length') ?? '密码至少8个字符' })
  @MaxLength(50, { message: () => I18nContext.current()?.t('validation.password_max_length') ?? '密码最多50个字符' })
  password: string;

  @ApiPropertyOptional({
    description: '昵称',
    example: '用户昵称',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: () => I18nContext.current()?.t('validation.nickname_must_be_string') ?? '昵称必须是字符串' })
  @MaxLength(50, { message: () => I18nContext.current()?.t('validation.nickname_max_length') ?? '昵称最多50个字符' })
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
  @IsString({ message: () => I18nContext.current()?.t('validation.temp_token_must_be_string') ?? '临时令牌必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.temp_token_required') ?? '临时令牌不能为空' })
  tempToken: string;

  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: () => I18nContext.current()?.t('validation.email_invalid') ?? '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.email_required') ?? '邮箱不能为空' })
  email: string;

  @ApiProperty({
    description: '邮箱验证码',
    example: '123456',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
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
  @IsString({ message: () => I18nContext.current()?.t('validation.temp_token_must_be_string') ?? '临时令牌必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.temp_token_required') ?? '临时令牌不能为空' })
  tempToken: string;

  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.phone_required') ?? '手机号不能为空' })
  phone: string;

  @ApiProperty({
    description: '验证码',
    example: '123456',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
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
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
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
  @IsEmail({}, { message: () => I18nContext.current()?.t('validation.email_invalid') ?? '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.email_required') ?? '邮箱不能为空' })
  email: string;

  @ApiProperty({
    description: '新邮箱验证码',
    example: '123456',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  code: string;

  @ApiProperty({
    description: '解绑原邮箱的验证令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.token_must_be_string') ?? '令牌必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.token_required') ?? '令牌不能为空' })
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
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.phone_required') ?? '手机号不能为空' })
  phone: string;

  @ApiProperty({
    description: '新手机号验证码',
    example: '123456',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  code: string;

  @ApiProperty({
    description: '解绑原手机号的验证令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.token_must_be_string') ?? '令牌必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.token_required') ?? '令牌不能为空' })
  token: string;
}
