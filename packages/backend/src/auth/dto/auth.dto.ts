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

export class RegisterDto {
  @ApiPropertyOptional({
    description: '用户邮箱（邮件服务启用时可选）',
    example: 'user@example.com',
    format: 'email',
  })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  email?: string;

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

  @ApiProperty({
    description: '昵称',
    example: '用户昵称',
    required: false,
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @MaxLength(50, { message: '昵称最多50个字符' })
  nickname?: string;

  @ApiPropertyOptional({
    description: '微信临时 Token（微信登录跳转注册时携带）',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsOptional()
  @IsString({ message: '微信临时 Token 必须是字符串' })
  wechatTempToken?: string;
}

export class LoginDto {
  @ApiProperty({
    description: '邮箱、用户名或手机号',
    example: 'user@example.com',
  })
  @IsString({ message: '登录账号必须是字符串' })
  @IsNotEmpty({ message: '登录账号不能为空' })
  account: string;

  @ApiProperty({
    description: '密码',
    example: 'Password123!',
  })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;

  @ApiPropertyOptional({
    description:
      'TOTP 双因素动态码（管理员入口且已启用 TOTP 时必传；普通入口忽略）',
    example: '123456',
  })
  @IsOptional()
  @IsString({ message: '双因素动态码必须是字符串' })
  @MaxLength(8, { message: '双因素动态码最多8个字符' })
  totpCode?: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: '刷新Token（浏览器可用 cookie 代替，桌面 EXE 必传）',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: false,
  })
  @IsOptional()
  @IsString({ message: '刷新Token必须是字符串' })
  @IsNotEmpty({ message: '刷新Token不能为空' })
  refreshToken?: string;
}

export class UserDto {
  @ApiProperty({
    description: '用户ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiPropertyOptional({
    type: 'string',
    description: '用户邮箱（可能未绑定）',
    example: 'user@example.com',
    nullable: true,
  })
  email?: string | null;

  @ApiProperty({
    description: '用户名',
    example: 'username',
  })
  username: string;

  @ApiProperty({
    description: '昵称',
    example: '用户昵称',
    required: false,
  })
  nickname?: string;

  @ApiProperty({
    description: '头像URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  avatar?: string;

  @ApiProperty({
    description: '用户角色',
    type: 'object',
    properties: {
      id: { type: 'string', example: 'clxxxxxxx' },
      name: {
        type: 'string',
        enum: ['ADMIN', 'USER_MANAGER', 'FONT_MANAGER', 'USER'],
        example: 'USER',
      },
      description: {
        type: 'string',
        example: '普通用户，基础权限',
        nullable: true,
      },
      isSystem: { type: 'boolean', example: true },
      permissions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { permission: { type: 'string' } },
        },
      },
    },
  })
  role: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: Array<{ permission: string }>;
  };

  @ApiProperty({
    description: '用户状态',
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    example: 'ACTIVE',
  })
  status: string;

  @ApiPropertyOptional({
    description: '用户手机号（可能未绑定）',
    type: String,
    example: '13800138000',
    nullable: true,
  })
  phone?: string | null;

  @ApiPropertyOptional({
    description: '手机号是否已验证',
    example: false,
  })
  phoneVerified?: boolean;

  @ApiPropertyOptional({
    description: '微信 OpenID',
    type: String,
    example: 'oXYZ123...',
    nullable: true,
  })
  wechatId?: string | null;

  @ApiPropertyOptional({
    description: '登录方式 (LOCAL | WECHAT)',
    example: 'LOCAL',
  })
  provider?: string;

  @ApiPropertyOptional({
    description: '是否已设置密码',
    example: true,
  })
  hasPassword?: boolean;

  @ApiPropertyOptional({
    description: 'VIP 等级（0=VIP0, 1=VIP1, 2=VIP2, ...）',
    type: Number,
    example: 0,
  })
  membershipTierLevel?: number;

  @ApiPropertyOptional({
    description: '会员到期时间（null=永久）',
    type: String,
    nullable: true,
  })
  membershipExpiresAt?: string | null;

  @ApiPropertyOptional({
    description:
      '会员档位（桌面客户端契约，由等级推导：VIP0=免费；VIP1/VIP2/VIP3...=有效会员，与 membershipTierLevel 对应；不随 vipTier.name 显示名变化）',
    type: String,
    example: 'VIP0',
  })
  membershipTier?: string;

  @ApiPropertyOptional({
    description: '是否有效会员（tierLevel > 0 且未过期）',
    type: Boolean,
    example: false,
  })
  isVip?: boolean;
}

export class AuthResponseDto {
  @ApiProperty({
    description: '访问Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: '刷新Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: '用户信息',
    type: () => UserDto,
  })
  user: UserDto;

  @ApiPropertyOptional({
    description: '注销冷静期内登录自动恢复成功标记（账户已自动取消注销）',
  })
  restored?: boolean;

  @ApiPropertyOptional({
    description:
      '管理员未绑定 TOTP 双因素标记（true=登录成功但被锁定至绑定页，完成绑定前后台其余功能不可用）',
  })
  mfaSetupRequired?: boolean;

  @ApiPropertyOptional({
    description:
      '口令定期更换强制标记（仅管理员入口，#416 等保 8.1.4.1 b)）：first_login=首登未改密，expired=超 180 天到期；true 时前端锁定至改密页',
    enum: ['first_login', 'expired'],
  })
  passwordChangeRequired?: 'first_login' | 'expired';

  @ApiPropertyOptional({
    description:
      '口令即将到期提示（仅管理员入口，#416；提前 14 天软提示，不拦截）',
  })
  passwordExpiringSoon?: boolean;
}

export class AuthApiResponseDto extends AuthResponseDto {}

export class CheckFieldUniquenessDto {
  @ApiPropertyOptional({
    description: '用户名',
    example: 'username',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: '邮箱',
    example: 'user@example.com',
    format: 'email',
  })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email?: string;

  @ApiPropertyOptional({
    description: '手机号',
    example: '13800138000',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
