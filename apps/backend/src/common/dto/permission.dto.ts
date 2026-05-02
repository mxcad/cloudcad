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
 * 系统权限枚举
 * 用于后台管理功能的权限控制
 */
export enum SystemPermission {
  // ========== 用户管理 ==========
  /** 查看用户列表和用户详情 */
  USER_READ = 'SYSTEM_USER_READ',
  /** 创建用户 */
  USER_CREATE = 'SYSTEM_USER_CREATE',
  /** 编辑用户信息 */
  USER_UPDATE = 'SYSTEM_USER_UPDATE',
  /** 删除用户 */
  USER_DELETE = 'SYSTEM_USER_DELETE',

  // ========== 角色权限管理 ==========
  /** 查看角色列表和角色详情 */
  ROLE_READ = 'SYSTEM_ROLE_READ',
  /** 创建角色 */
  ROLE_CREATE = 'SYSTEM_ROLE_CREATE',
  /** 编辑角色信息 */
  ROLE_UPDATE = 'SYSTEM_ROLE_UPDATE',
  /** 删除角色 */
  ROLE_DELETE = 'SYSTEM_ROLE_DELETE',
  /** 为角色分配系统权限 */
  ROLE_PERMISSION_MANAGE = 'SYSTEM_ROLE_PERMISSION_MANAGE',

  // ========== 字体库管理 ==========
  /** 查看字体库列表和字体详情 */
  FONT_READ = 'SYSTEM_FONT_READ',
  /** 上传字体 */
  FONT_UPLOAD = 'SYSTEM_FONT_UPLOAD',
  /** 删除字体 */
  FONT_DELETE = 'SYSTEM_FONT_DELETE',
  /** 下载字体 */
  FONT_DOWNLOAD = 'SYSTEM_FONT_DOWNLOAD',

  // ========== 系统管理 ==========
  /** 系统管理员：拥有所有系统权限 */
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  /** 系统监控：查看系统状态和日志 */
  SYSTEM_MONITOR = 'SYSTEM_MONITOR',

  // ========== 运行时配置管理 ==========
  /** 查看运行时配置 */
  CONFIG_READ = 'SYSTEM_CONFIG_READ',
  /** 修改运行时配置 */
  CONFIG_WRITE = 'SYSTEM_CONFIG_WRITE',
}

/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制，与系统权限完全解耦
 */
export enum ProjectPermission {
  // ========== 项目管理权限 ==========
  /** 编辑项目信息 */
  PROJECT_UPDATE = 'PROJECT_UPDATE',
  /** 删除项目 */
  PROJECT_DELETE = 'PROJECT_DELETE',
  /** 项目成员管理（添加、移除成员） */
  PROJECT_MEMBER_MANAGE = 'PROJECT_MEMBER_MANAGE',
  /** 项目成员角色分配 */
  PROJECT_MEMBER_ASSIGN = 'PROJECT_MEMBER_ASSIGN',
  /** 项目角色增删改查 */
  PROJECT_ROLE_MANAGE = 'PROJECT_ROLE_MANAGE',
  /** 项目角色权限分配 */
  PROJECT_ROLE_PERMISSION_MANAGE = 'PROJECT_ROLE_PERMISSION_MANAGE',
  /** 转让项目所有权 */
  PROJECT_TRANSFER = 'PROJECT_TRANSFER',

  // ========== 文件操作权限 ==========
  /** 创建文件/文件夹 */
  FILE_CREATE = 'FILE_CREATE',
  /** 上传文件 */
  FILE_UPLOAD = 'FILE_UPLOAD',
  /** 打开/预览CAD图纸 */
  FILE_OPEN = 'FILE_OPEN',
  /** 编辑CAD图纸 */
  FILE_EDIT = 'FILE_EDIT',
  /** 删除文件 */
  FILE_DELETE = 'FILE_DELETE',
  /** 回收站管理（恢复、彻底删除） */
  FILE_TRASH_MANAGE = 'FILE_TRASH_MANAGE',
  /** 下载文件 */
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  /** 分享文件 */
  FILE_SHARE = 'FILE_SHARE',

  // ========== CAD 图纸权限 ==========
  /** 保存图纸（DWG/MXWEB） */
  CAD_SAVE = 'CAD_SAVE',
  /** 管理外部参照 */
  CAD_EXTERNAL_REFERENCE = 'CAD_EXTERNAL_REFERENCE',

  // ========== 版本管理权限 ==========
  /** 查看版本历史 */
  VERSION_READ = 'VERSION_READ',
  /** 创建版本 */
  VERSION_CREATE = 'VERSION_CREATE',
  /** 删除版本 */
  VERSION_DELETE = 'VERSION_DELETE',
  /** 恢复版本 */
  VERSION_RESTORE = 'VERSION_RESTORE',

  // ========== 项目设置权限 ==========
  /** 项目设置管理 */
  PROJECT_SETTINGS_MANAGE = 'PROJECT_SETTINGS_MANAGE',
}

/**
 * 统一的权限类型
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
    example: SystemPermission.USER_READ,
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
    example: SystemPermission.USER_READ,
    enumName: 'PermissionEnum',
  })
  permission: Permission;
}
