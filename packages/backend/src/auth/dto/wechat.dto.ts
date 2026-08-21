///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * 微信用户信息 DTO
 */
export class WechatUserInfoDto {
  @ApiProperty({ description: '用户 openid' })
  openid: string;

  @ApiProperty({ description: '昵称' })
  nickname: string;

  @ApiProperty({ description: '头像 URL' })
  avatar: string;

  @ApiPropertyOptional({ description: '性别' })
  sex?: number;

  @ApiPropertyOptional({ description: '省份' })
  province?: string;

  @ApiPropertyOptional({ description: '城市' })
  city?: string;

  @ApiPropertyOptional({ description: '国家' })
  country?: string;
}

/**
 * 微信登录响应中的用户信息 DTO（包含完整用户数据）
 */
export class WechatLoginUserDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiPropertyOptional({ description: '邮箱' })
  email?: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiPropertyOptional({ description: '昵称' })
  nickname?: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  avatar?: string;

  @ApiPropertyOptional({ description: '微信 openid' })
  wechatId?: string;

  @ApiProperty({ description: '登录方式' })
  provider: string;

  @ApiProperty({ description: '角色信息' })
  role: {
    id: string;
    name: string;
    description?: string;
    isSystem: boolean;
    permissions: Array<{ permission: string }>;
  };

  @ApiProperty({ description: '用户状态' })
  status: string;

  @ApiProperty({ description: '邮箱是否验证' })
  emailVerified: boolean;

  @ApiPropertyOptional({ description: '手机号' })
  phone?: string;

  @ApiProperty({ description: '手机是否验证' })
  phoneVerified: boolean;
}

/**
 * 微信登录响应 DTO
 */
export class WechatLoginResponseDto {
  @ApiProperty({ description: '访问令牌' })
  accessToken: string;

  @ApiProperty({ description: '刷新令牌' })
  refreshToken: string;

  @ApiProperty({ description: '用户信息' })
  user: WechatLoginUserDto;

  @ApiProperty({
    description: '是否需要绑定邮箱',
    required: false,
  })
  requireEmailBinding?: boolean;

  @ApiProperty({
    description: '是否需要绑定手机',
    required: false,
  })
  requirePhoneBinding?: boolean;

  @ApiPropertyOptional({
    description: '临时令牌（用于绑定流程或待注册状态）',
  })
  tempToken?: string;

  @ApiPropertyOptional({
    description: '是否需要注册（首次登录且未开启自动注册时）',
  })
  needRegister?: boolean;

  @ApiPropertyOptional({
    description: '注销冷静期内登录自动恢复成功标记（账户已自动取消注销）',
  })
  restored?: boolean;
}

/**
 * 微信绑定响应 DTO
 */
export class WechatBindResponseDto {
  @ApiProperty({ description: '是否绑定成功' })
  success: boolean;

  @ApiProperty({ description: '消息' })
  message: string;
}

/**
 * 微信解绑响应 DTO
 */
export class WechatUnbindResponseDto {
  @ApiProperty({ description: '是否解绑成功' })
  success: boolean;

  @ApiProperty({ description: '消息' })
  message: string;
}

/**
 * 获取微信授权 URL 响应 DTO
 */
export class WechatAuthUrlResponseDto {
  @ApiProperty({ description: '微信授权 URL' })
  authUrl: string;

  @ApiProperty({ description: 'CSRF 防护 state 参数' })
  state: string;

  @ApiProperty({ description: '登录事务 ID（用于轮询登录结果）' })
  transactionId: string;
}

/**
 * 轮询微信登录事务响应 DTO
 */
export class WechatPollTransactionResponseDto {
  @ApiProperty({ description: '事务状态：pending / completed / expired / rate_limited' })
  status: string;

  @ApiPropertyOptional({ description: '动作类型：login / need_register / bind_email / bind_phone / error' })
  action?: string;

  @ApiPropertyOptional({ description: '登录成功时的 Access Token' })
  accessToken?: string;

  @ApiPropertyOptional({ description: '登录成功时的 Refresh Token' })
  refreshToken?: string;

  @ApiPropertyOptional({ description: '登录成功时的用户信息' })
  user?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '临时令牌（用于注册/绑定流程）' })
  tempToken?: string;

  @ApiPropertyOptional({ description: '登录失败时的错误信息' })
  error?: string;

  @ApiPropertyOptional({
    description: '注销冷静期内登录自动恢复成功标记（账户已自动取消注销）',
  })
  restored?: boolean;

  @ApiPropertyOptional({ description: '登录失败业务错误码（如 ACCOUNT_DEACTIVATED）' })
  errorCode?: string;

  @ApiPropertyOptional({ description: '错误码附带：注销冷静期天数' })
  graceDays?: number;

  @ApiPropertyOptional({ description: '错误码附带：数据彻底删除延迟天数' })
  cleanupDays?: number;
}

/**
 * 绑定微信 DTO
 */
export class BindWechatDto {
  @ApiProperty({
    description: '微信授权回调返回的 code',
    example: '081x7J0w3Q4e1Z2B5L1w3FVKJT0x7J0Z',
  })
  @IsString({ message: 'code 必须是字符串' })
  @IsNotEmpty({ message: 'code 不能为空' })
  code: string;

  @ApiProperty({
    description: '微信授权 state 参数（包含 csrf token）',
    example: 'eyJjc3JmIjoiYWJjZGVmIiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwIn0=',
  })
  @IsString({ message: 'state 必须是字符串' })
  @IsNotEmpty({ message: 'state 不能为空' })
  state: string;

  @ApiPropertyOptional({
    description:
      '该微信已绑定其他账号时是否接管（旧账号需有密码/邮箱/手机等其他登录方式，否则仍拒绝）',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'takeover 必须是布尔值' })
  takeover?: boolean;
}
