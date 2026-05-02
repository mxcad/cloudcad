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
