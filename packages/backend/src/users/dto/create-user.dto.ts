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
import { Transform } from 'class-transformer';
import { I18nContext } from 'nestjs-i18n';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsBoolean,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: '用户邮箱（可选，当 mailEnabled=true 时建议填写）',
    example: 'user@example.com',
    format: 'email',
    required: false,
  })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsEmail({}, { message: () => I18nContext.current()?.t('validation.email_invalid') ?? '请输入有效的邮箱地址' })
  email?: string;

  @ApiProperty({
    description: '手机号（中国大陆）',
    example: '13800138000',
    required: false,
  })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString({ message: () => I18nContext.current()?.t('validation.phone_must_be_string') ?? '手机号必须是字符串' })
  @Matches(/^1[3-9]\d{9}$/, { message: () => I18nContext.current()?.t('validation.phone_invalid') ?? '请输入有效的中国大陆手机号' })
  phone?: string;

  @ApiProperty({
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
    description: '密码',
    example: 'password123',
    maxLength: 50,
  })
  @IsString({ message: () => I18nContext.current()?.t('validation.password_must_be_string') ?? '密码必须是字符串' })
  @IsNotEmpty({ message: () => I18nContext.current()?.t('validation.password_required') ?? '密码不能为空' })
  @MaxLength(50, { message: () => I18nContext.current()?.t('validation.password_max_length') ?? '密码最多50个字符' })
  password: string;

  @ApiProperty({ description: '昵称', required: false, maxLength: 50 })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString({ message: () => I18nContext.current()?.t('validation.nickname_must_be_string') ?? '昵称必须是字符串' })
  @MaxLength(50, { message: () => I18nContext.current()?.t('validation.nickname_max_length') ?? '昵称最多50个字符' })
  nickname?: string;

  @ApiProperty({ description: '头像URL', required: false })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({
    description: '角色ID',
    example: 'clh8x9y0z1a2b3c4d5e6f7g8h9',
    required: false,
  })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString({ message: () => I18nContext.current()?.t('validation.role_id_must_be_string') ?? '角色ID必须是字符串' })
  roleId?: string;

  @ApiProperty({
    description: '手机号是否已验证',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: () => I18nContext.current()?.t('validation.phone_verified_must_be_boolean') ?? 'phoneVerified 必须是布尔值' })
  phoneVerified?: boolean;

  @ApiProperty({
    description: '邮箱是否已验证',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: () => I18nContext.current()?.t('validation.email_verified_must_be_boolean') ?? 'emailVerified 必须是布尔值' })
  emailVerified?: boolean;

  @ApiProperty({ description: '微信 OpenID', required: false })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  wechatId?: string;

  @ApiProperty({
    description: '登录方式 (LOCAL | WECHAT)',
    required: false,
    default: 'LOCAL',
  })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  provider?: string;
}
