///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 权限枚举 - 从 Prisma Client 导入
 *
 * 系统权限和项目权限的定义来源于 packages/db/prisma/schema.prisma
 * 修改权限请编辑 schema.prisma 文件，然后运行 pnpm db:generate
 *
 * 角色相关的枚举和映射在本文件中定义
 */

import {
  Permission as PrismaPermission,
  ProjectPermission as PrismaProjectPermission,
} from '@cloudcad/db';
import {
  ProjectRole,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '@cloudcad/contracts';

/**
 * 系统权限枚举
 * 用于后台管理功能的权限控制
 * 来源: Prisma Schema (Permission 枚举)
 */
export const SystemPermission = PrismaPermission;

/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制
 * 来源: Prisma Schema
 */
export const ProjectPermission = PrismaProjectPermission;

/**
 * 系统权限类型
 */
export type SystemPermission = PrismaPermission;

/**
 * 项目权限类型
 */
export type ProjectPermission = PrismaProjectPermission;

/**
 * 统一的权限类型
 * @deprecated 请使用 SystemPermission 或 ProjectPermission
 */
export type Permission = SystemPermission | ProjectPermission;

/**
 * 角色类别
 */
export enum RoleCategory {
  SYSTEM = 'SYSTEM', // 系统角色（用于后台管理）
  PROJECT = 'PROJECT', // 项目角色（用于项目和文件管理，暂不实现）
  CUSTOM = 'CUSTOM', // 自定义角色
}

/**
 * 系统角色（用于后台管理）
 */
export enum SystemRole {
  ADMIN = 'ADMIN', // 系统管理员：拥有所有系统权限
  USER_MANAGER = 'USER_MANAGER', // 用户管理员：管理用户和角色
  FONT_MANAGER = 'FONT_MANAGER', // 字体管理员：管理字体库
  USER = 'USER', // 普通用户：基础系统权限
}

/**
 * 项目角色枚举
 * 用于项目和文件系统的角色管理，与系统角色完全解耦
 * @deprecated 请从 @cloudcad/contracts 导入（单一来源，见 project-role.types）
 */
export { ProjectRole };

/**
 * 系统角色权限映射
 * 定义系统角色拥有的系统权限（直接权限，不包括继承）
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, SystemPermission[]> = {
  [SystemRole.ADMIN]: [
    // 系统管理员拥有所有系统权限
    PrismaPermission.SYSTEM_USER_READ,
    PrismaPermission.SYSTEM_USER_CREATE,
    PrismaPermission.SYSTEM_USER_UPDATE,
    PrismaPermission.SYSTEM_USER_DELETE,
    PrismaPermission.SYSTEM_USER_MEMBERSHIP_MANAGE,
    PrismaPermission.SYSTEM_ROLE_READ,
    PrismaPermission.SYSTEM_ROLE_CREATE,
    PrismaPermission.SYSTEM_ROLE_UPDATE,
    PrismaPermission.SYSTEM_ROLE_DELETE,
    PrismaPermission.SYSTEM_ROLE_PERMISSION_MANAGE,
    PrismaPermission.SYSTEM_FONT_READ,
    PrismaPermission.SYSTEM_FONT_UPLOAD,
    PrismaPermission.SYSTEM_FONT_DELETE,
    PrismaPermission.SYSTEM_FONT_DOWNLOAD,
    PrismaPermission.SYSTEM_ADMIN,
    PrismaPermission.SYSTEM_BILLING_READ,
    PrismaPermission.SYSTEM_BILLING_WRITE,
    PrismaPermission.SYSTEM_MONITOR,
    PrismaPermission.SYSTEM_CONFIG_READ,
    PrismaPermission.SYSTEM_CONFIG_WRITE,
    PrismaPermission.SYSTEM_IP_BLACKLIST_MANAGE,
    PrismaPermission.SYSTEM_IP_WHITELIST_MANAGE,
    PrismaPermission.LIBRARY_DRAWING_MANAGE,
    PrismaPermission.LIBRARY_BLOCK_MANAGE,
    PrismaPermission.PROJECT_CREATE,
  ],
  [SystemRole.USER_MANAGER]: [
    // 用户管理员权限
    PrismaPermission.SYSTEM_USER_READ,
    PrismaPermission.SYSTEM_USER_CREATE,
    PrismaPermission.SYSTEM_USER_UPDATE,
    PrismaPermission.SYSTEM_USER_DELETE,
    PrismaPermission.SYSTEM_ROLE_READ,
    PrismaPermission.SYSTEM_ROLE_CREATE,
    PrismaPermission.SYSTEM_ROLE_UPDATE,
    PrismaPermission.SYSTEM_ROLE_DELETE,
    PrismaPermission.SYSTEM_ROLE_PERMISSION_MANAGE,
    PrismaPermission.PROJECT_CREATE,
  ],
  [SystemRole.FONT_MANAGER]: [
    // 字体管理员权限
    PrismaPermission.SYSTEM_FONT_READ,
    PrismaPermission.SYSTEM_FONT_UPLOAD,
    PrismaPermission.SYSTEM_FONT_DELETE,
    PrismaPermission.SYSTEM_FONT_DOWNLOAD,
    PrismaPermission.PROJECT_CREATE,
  ],
  [SystemRole.USER]: [
    // 普通用户：创建项目权限
    PrismaPermission.PROJECT_CREATE,
  ],
};

/**
 * 系统角色继承关系
 * 定义角色的父角色（从父角色继承权限）
 */
export const SYSTEM_ROLE_HIERARCHY: Record<SystemRole, SystemRole | null> = {
  [SystemRole.ADMIN]: null, // 顶级角色
  [SystemRole.USER_MANAGER]: SystemRole.USER, // 继承自 USER
  [SystemRole.FONT_MANAGER]: SystemRole.USER, // 继承自 USER
  [SystemRole.USER]: null, // 基础角色
};

/**
 * 默认项目角色权限映射
 * 定义默认项目角色拥有的项目权限
 * @deprecated 请从 @cloudcad/contracts 导入（单一来源，见 project-role.types）
 */
export { DEFAULT_PROJECT_ROLE_PERMISSIONS };
