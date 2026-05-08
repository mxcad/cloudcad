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

/**
 * 系统权限 API 枚举（独立于 Prisma）
 *
 * 与 schema.prisma 的 Permission 枚举值保持一致，
 * 专用于 @ApiProperty 装饰器和 DTO 字段类型。
 *
 * 注意：该枚举仅包含系统级权限（SystemPermission）。
 * 项目级权限（ProjectPermission）定义在 project-permission.enum.ts 中。
 */
export enum SystemPermission {
  SYSTEM_USER_READ = 'SYSTEM_USER_READ',
  SYSTEM_USER_CREATE = 'SYSTEM_USER_CREATE',
  SYSTEM_USER_UPDATE = 'SYSTEM_USER_UPDATE',
  SYSTEM_USER_DELETE = 'SYSTEM_USER_DELETE',
  SYSTEM_ROLE_READ = 'SYSTEM_ROLE_READ',
  SYSTEM_ROLE_CREATE = 'SYSTEM_ROLE_CREATE',
  SYSTEM_ROLE_UPDATE = 'SYSTEM_ROLE_UPDATE',
  SYSTEM_ROLE_DELETE = 'SYSTEM_ROLE_DELETE',
  SYSTEM_ROLE_PERMISSION_MANAGE = 'SYSTEM_ROLE_PERMISSION_MANAGE',
  SYSTEM_FONT_READ = 'SYSTEM_FONT_READ',
  SYSTEM_FONT_UPLOAD = 'SYSTEM_FONT_UPLOAD',
  SYSTEM_FONT_DELETE = 'SYSTEM_FONT_DELETE',
  SYSTEM_FONT_DOWNLOAD = 'SYSTEM_FONT_DOWNLOAD',
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  SYSTEM_MONITOR = 'SYSTEM_MONITOR',
  SYSTEM_CONFIG_READ = 'SYSTEM_CONFIG_READ',
  SYSTEM_CONFIG_WRITE = 'SYSTEM_CONFIG_WRITE',
  LIBRARY_DRAWING_MANAGE = 'LIBRARY_DRAWING_MANAGE',
  LIBRARY_BLOCK_MANAGE = 'LIBRARY_BLOCK_MANAGE',
  STORAGE_QUOTA = 'STORAGE_QUOTA',
  PROJECT_CREATE = 'PROJECT_CREATE',
}
