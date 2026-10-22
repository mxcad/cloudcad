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
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 用户修改自己资料的 DTO。
 * 与 UpdateUserDto 的区别：不含 roleId / status 等管理员字段，
 * 配合全局 ValidationPipe whitelist + forbidNonWhitelisted 使用。
 */
export class UpdateProfileDto {
  @ApiProperty({ description: '用户邮箱', required: false })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsEmail()
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

  @ApiProperty({ description: '用户名', required: false, minLength: 3 })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

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
}
