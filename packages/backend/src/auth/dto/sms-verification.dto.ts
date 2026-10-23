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
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export type SmsCodeScene = 'login' | 'register' | 'bind';

/**
 * 发送短信验证码 DTO
 */
export class SendSmsCodeDto {
  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
    pattern: '^(\\+86)?1[3-9]\\d{9}$',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.phone_required') ?? '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: () => I18nContext.current()?.t('validation.phone_invalid') ?? '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiPropertyOptional({
    description:
      '验证码场景：login（登录）/ register（注册）/ bind（绑定或换绑手机号，发送前会校验手机号是否已被绑定）',
    example: 'login',
    default: 'login',
    enum: ['login', 'register', 'bind'],
  })
  @IsOptional()
  @IsIn(['login', 'register', 'bind'], { message: () => I18nContext.current()?.t('validation.sms_scene_invalid') ?? '无效的验证码场景' })
  scene?: SmsCodeScene;
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
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.phone_required') ?? '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: () => I18nContext.current()?.t('validation.phone_invalid') ?? '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  @MinLength(6, { message: () => I18nContext.current()?.t('validation.code_length') ?? '验证码必须是6位' })
  @MaxLength(6, { message: () => I18nContext.current()?.t('validation.code_length') ?? '验证码必须是6位' })
  @Matches(/^\d{6}$/, { message: () => I18nContext.current()?.t('validation.code_digit') ?? '验证码必须是6位数字' })
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
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.phone_required') ?? '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: () => I18nContext.current()?.t('validation.phone_invalid') ?? '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  @MinLength(6, { message: () => I18nContext.current()?.t('validation.code_length') ?? '验证码必须是6位' })
  @MaxLength(6, { message: () => I18nContext.current()?.t('validation.code_length') ?? '验证码必须是6位' })
  @Matches(/^\d{6}$/, { message: () => I18nContext.current()?.t('validation.code_digit') ?? '验证码必须是6位数字' })
  code: string;

  @ApiProperty({
    type: String,
    description: '用户名',
    example: 'username',
    minLength: 3,
    maxLength: 20,
    pattern: '^[a-zA-Z0-9_]+$',
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
    type: String,
    description: '密码',
    example: 'password123',
    maxLength: 50,
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.password_must_be_string') ?? '密码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.password_required') ?? '密码不能为空' })
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
 * 手机号登录 DTO
 */
export class LoginByPhoneDto {
  @ApiProperty({
    description: '手机号（中国大陆，可带 +86 前缀）',
    example: '13800138000',
    pattern: '^(\\+86)?1[3-9]\\d{9}$',
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.phone_required') ?? '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: () => I18nContext.current()?.t('validation.phone_invalid') ?? '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  @MinLength(6, { message: () => I18nContext.current()?.t('validation.code_length') ?? '验证码必须是6位' })
  @MaxLength(6, { message: () => I18nContext.current()?.t('validation.code_length') ?? '验证码必须是6位' })
  @Matches(/^\d{6}$/, { message: () => I18nContext.current()?.t('validation.code_digit') ?? '验证码必须是6位数字' })
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
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.phone_required') ?? '手机号不能为空' })
  @Matches(/^(\+86)?1[3-9]\d{9}$/, { message: () => I18nContext.current()?.t('validation.phone_invalid') ?? '请输入有效的中国大陆手机号' })
  phone: string;

  @ApiProperty({
    description: '验证码（6位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.code_must_be_string') ?? '验证码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.code_required') ?? '验证码不能为空' })
  @MinLength(6, { message: () => I18nContext.current()?.t('validation.code_length') ?? '验证码必须是6位' })
  @MaxLength(6, { message: () => I18nContext.current()?.t('validation.code_length') ?? '验证码必须是6位' })
  @Matches(/^\d{6}$/, { message: () => I18nContext.current()?.t('validation.code_digit') ?? '验证码必须是6位数字' })
  code: string;
}
