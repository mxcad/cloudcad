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
import { Transform } from 'class-transformer';

/**
 * 首启「创建首个管理员」请求体。
 *
 * 仅在系统零用户（首启未初始化）时可用，创建的用户固定为 ADMIN 角色。
 * 字段规则与 RegisterDto 对齐（同一套用户名/密码约束），但无验证码、
 * 无微信分支——首启页是受控的一次性入口，不走常规注册流程。
 */
export class CreateFirstAdminDto {
  @ApiPropertyOptional({
    description: '管理员邮箱（可选）',
    example: 'admin@example.com',
    format: 'email',
  })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  email?: string;

  @ApiProperty({
    type: String,
    description: '管理员用户名',
    example: 'admin',
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
    description: '管理员密码（需满足口令策略）',
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
    description: '管理员昵称（缺省取用户名）',
    example: '系统管理员',
  })
  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @MaxLength(50, { message: '昵称最多50个字符' })
  nickname?: string;
}

/** 首启状态响应：setupRequired=true 表示系统零用户，登录页应展示首启设置表单 */
export class SetupStatusResponseDto {
  @ApiProperty({
    description: '是否需要首启设置（系统尚无任何用户）',
    example: true,
  })
  setupRequired: boolean;
}
