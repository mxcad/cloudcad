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
import { UserStatus } from '../../common/enums/user-status.enum';
import { StorageInfoDto } from '../../common/dto/storage-info.dto';


/**
 * 用户角色 DTO
 */
export class UserRoleDto {
  @ApiProperty({ description: '角色 ID' })
  id: string;

  @ApiProperty({ description: '角色名称' })
  name: string;

  @ApiProperty({ description: '角色描述', required: false })
  description?: string;

  @ApiProperty({ description: '是否为系统角色' })
  isSystem: boolean;
}

/**
 * 用户响应 DTO
 */
export class UserResponseDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '用户邮箱' })
  email: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '用户昵称', required: false })
  nickname?: string;

  @ApiProperty({ description: '头像 URL', required: false })
  avatar?: string;

  @ApiPropertyOptional({ description: '手机号码' })
  phone?: string;

  @ApiPropertyOptional({ description: '手机号是否已验证' })
  phoneVerified?: boolean;

  @ApiPropertyOptional({
    description: '微信 OpenID',
    type: String,
    nullable: true,
  })
  wechatId?: string | null;

  @ApiPropertyOptional({
    description: '登录方式 (LOCAL | WECHAT)',
    example: 'LOCAL',
  })
  provider?: string;

  @ApiProperty({
    description: '用户状态',
    enum: Object.values(UserStatus),
    enumName: 'UserStatus',
  })
  status: UserStatus;

  @ApiProperty({ description: '用户角色', type: () => UserRoleDto })
  role: UserRoleDto;

  @ApiProperty({
    description: '是否已设置密码（手机/微信自动注册用户可能未设置）',
  })
  hasPassword: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({
    description: 'VIP 等级（0=VIP0, 1=VIP1, 2=VIP2, ...）',
    type: Number,
  })
  membershipTierLevel: number;

  @ApiProperty({
    description: '会员到期时间（免费用户为 null）',
    required: false,
  })
  membershipExpiresAt?: Date;

  @ApiProperty({
    description: '会员档位（由等级推导：VIP0=免费；VIP1/VIP2/VIP3...=有效会员，不随 vipTier.name 变化）',
    type: String,
    example: 'VIP0',
  })
  membershipTier: string;

  @ApiProperty({
    description: '是否有效会员（tierLevel > 0 且未过期）',
    type: Boolean,
    example: false,
  })
  isVip: boolean;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 用户列表响应 DTO
 */
export class UserListResponseDto {
  @ApiProperty({ description: '用户列表', type: () => [UserResponseDto] })
  users: UserResponseDto[];

  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页数量' })
  limit: number;

  @ApiProperty({ description: '总页数' })
  totalPages: number;
}

/**
 * 用户搜索结果 DTO
 */
export class UserSearchResultDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '用户邮箱' })
  email: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '用户昵称', required: false })
  nickname?: string;

  @ApiProperty({ description: '头像 URL', required: false })
  avatar?: string;
}

/**
 * 修改密码响应 DTO
 */
export class ChangePasswordResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;
}

/**
 * 用户资料响应 DTO
 */
export class UserProfileResponseDto {
  @ApiProperty({ description: '用户 ID' })
  id: string;

  @ApiProperty({ description: '用户邮箱' })
  email: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '用户昵称', required: false })
  nickname?: string;

  @ApiProperty({ description: '头像 URL', required: false })
  avatar?: string;

  @ApiPropertyOptional({
    description: '用户手机号（可能未绑定）',
    type: String,
    nullable: true,
  })
  phone?: string | null;

  @ApiPropertyOptional({ description: '手机号是否已验证' })
  phoneVerified?: boolean;

  @ApiPropertyOptional({
    description: '微信 OpenID',
    type: String,
    nullable: true,
  })
  wechatId?: string | null;

  @ApiPropertyOptional({
    description: '登录方式 (LOCAL | WECHAT)',
    example: 'LOCAL',
  })
  provider?: string;

  @ApiProperty({
    description: '用户状态',
    enum: Object.values(UserStatus),
    enumName: 'UserStatus',
  })
  status: UserStatus;

  @ApiProperty({ description: '用户角色', type: () => UserRoleDto })
  role: UserRoleDto;

  @ApiProperty({
    description: '是否已设置密码（手机/微信自动注册用户可能未设置）',
  })
  hasPassword: boolean;

  @ApiProperty({
    description: 'VIP 等级（0=VIP0, 1=VIP1, 2=VIP2, ...）',
    type: Number,
  })
  membershipTierLevel: number;

  @ApiProperty({
    description: '会员到期时间（null=永久，免费用户为 null）',
    type: String,
    nullable: true,
    required: false,
  })
  membershipExpiresAt?: Date | null;

  @ApiProperty({
    description:
      '会员档位（桌面客户端契约，由等级推导：VIP0=免费；VIP1/VIP2/VIP3...=有效会员，与 membershipTierLevel 对应；不随 vipTier.name 显示名变化）',
    type: String,
    example: 'VIP0',
  })
  membershipTier: string;

  @ApiProperty({
    description: '是否有效会员（tierLevel > 0 且未过期）',
    type: Boolean,
    example: false,
  })
  isVip: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 文件类型统计 DTO
 */
export class FileTypeStatsDto {
  @ApiProperty({ description: 'DWG 文件数量' })
  dwg: number;

  @ApiProperty({ description: 'DXF 文件数量' })
  dxf: number;

  @ApiProperty({ description: '其他文件数量' })
  other: number;
}

/**
 * 用户仪表盘统计 DTO
 */
export class UserDashboardStatsDto {
  @ApiProperty({ description: '项目数量' })
  projectCount: number;

  @ApiProperty({ description: '文件总数' })
  totalFiles: number;

  @ApiProperty({ description: '今日上传数量' })
  todayUploads: number;

  @ApiProperty({ description: '文件类型统计', type: () => FileTypeStatsDto })
  fileTypeStats: FileTypeStatsDto;

  @ApiProperty({ description: '存储空间信息', type: () => StorageInfoDto })
  storage: StorageInfoDto;
}
