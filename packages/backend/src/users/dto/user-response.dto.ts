///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

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

  @ApiProperty({ description: '用户状态', enum: UserStatus })
  status: UserStatus;

  @ApiProperty({ description: '用户角色', type: UserRoleDto })
  role: UserRoleDto;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 用户列表响应 DTO
 */
export class UserListResponseDto {
  @ApiProperty({ description: '用户列表', type: [UserResponseDto] })
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

  @ApiProperty({ description: '用户状态', enum: UserStatus })
  status: UserStatus;

  @ApiProperty({ description: '用户角色', type: UserRoleDto })
  role: UserRoleDto;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 存储空间信息 DTO
 */
export class StorageInfoDto {
  @ApiProperty({ description: '已使用空间（字节）' })
  used: number;

  @ApiProperty({ description: '总空间（字节）' })
  total: number;

  @ApiProperty({ description: '剩余空间（字节）' })
  remaining: number;

  @ApiProperty({ description: '使用百分比' })
  usagePercent: number;
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

  @ApiProperty({ description: '文件类型统计', type: FileTypeStatsDto })
  fileTypeStats: FileTypeStatsDto;

  @ApiProperty({ description: '存储空间信息', type: StorageInfoDto })
  storage: StorageInfoDto;
}
