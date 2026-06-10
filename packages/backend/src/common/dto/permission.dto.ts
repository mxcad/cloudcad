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
import { SystemPermission, ProjectPermission } from '../enums/permissions.enum';

/**
 * 统一的权限类型
 * @deprecated 请使用 SystemPermission | ProjectPermission
 */
export type Permission = SystemPermission | ProjectPermission;

/**
 * 系统权限 DTO
 * 用于在 Swagger 中暴露系统权限枚举
 */
export class SystemPermissionDto {
  @ApiProperty({
    enum: Object.values(SystemPermission),
    description: '系统权限',
    example: SystemPermission.SYSTEM_USER_READ,
    enumName: 'SystemPermissionEnum',
  })
  permission: SystemPermission;
}

/**
 * 项目权限 DTO
 * 用于在 Swagger 中暴露项目权限枚举
 */
export class ProjectPermissionDto {
  @ApiProperty({
    enum: Object.values(ProjectPermission),
    description: '项目权限',
    example: ProjectPermission.FILE_UPLOAD,
    enumName: 'ProjectPermissionEnum',
  })
  permission: ProjectPermission;
}

/**
 * 权限 DTO
 * 用于在 Swagger 中暴露统一权限枚举
 */
export class PermissionDto {
  @ApiProperty({
    enum: [
      ...Object.values(SystemPermission),
      ...Object.values(ProjectPermission),
    ],
    description: '权限',
    example: SystemPermission.SYSTEM_USER_READ,
    enumName: 'PermissionEnum',
  })
  permission: Permission;
}
