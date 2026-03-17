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

/**
 * 管理员统计响应 DTO
 */
export class AdminStatsResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;

  @ApiProperty({ description: '时间戳' })
  timestamp: string;
}

/**
 * 缓存统计 DTO
 */
export class CacheStatsDto {
  @ApiProperty({ description: '缓存条目数' })
  size: number;

  @ApiProperty({ description: '命中次数' })
  hits: number;

  @ApiProperty({ description: '未命中次数' })
  misses: number;

  @ApiProperty({ description: '命中率' })
  hitRate: number;
}

/**
 * 缓存统计响应 DTO
 */
export class CacheStatsResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;

  @ApiProperty({ description: '缓存统计数据', type: CacheStatsDto })
  data: CacheStatsDto;
}

/**
 * 缓存清理响应 DTO
 */
export class CacheCleanupResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;
}

/**
 * 用户权限信息 DTO
 */
export class UserPermissionInfoDto {
  @ApiProperty({ description: '用户角色' })
  userRole: string;

  @ApiProperty({ description: '权限列表', type: [String] })
  permissions: string[];
}

/**
 * 用户权限响应 DTO
 */
export class UserPermissionsResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;

  @ApiProperty({ description: '用户权限信息', type: UserPermissionInfoDto })
  data: UserPermissionInfoDto;
}

/**
 * 用户缓存清理响应 DTO
 */
export class UserCacheClearResponseDto {
  @ApiProperty({ description: '提示消息' })
  message: string;
}
