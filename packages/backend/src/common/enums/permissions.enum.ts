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
 * 系统权限和项目权限的定义来源于 packages/backend/prisma/schema.prisma
 * 修改权限请编辑 schema.prisma 文件，然后运行 pnpm db:generate
 *
 * 角色相关的枚举和映射在本文件中定义
 */

import {
  Permission as PrismaPermission,
  ProjectPermission as PrismaProjectPermission,
} from '@prisma/client';

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
 */
export enum ProjectRole {
  /** 项目所有者：拥有所有项目权限 */
  OWNER = 'PROJECT_OWNER',
  /** 项目管理员：管理项目和成员 */
  ADMIN = 'PROJECT_ADMIN',
  /** 项目编辑者：编辑文件 */
  EDITOR = 'PROJECT_EDITOR',
  /** 项目成员：基本项目操作 */
  MEMBER = 'PROJECT_MEMBER',
  /** 项目查看者：只读权限 */
  VIEWER = 'PROJECT_VIEWER',
}

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
    PrismaPermission.SYSTEM_MONITOR,
    PrismaPermission.SYSTEM_CONFIG_READ,
    PrismaPermission.SYSTEM_CONFIG_WRITE,
    PrismaPermission.SYSTEM_TEMPLATE_READ,
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
  ],
  [SystemRole.FONT_MANAGER]: [
    // 字体管理员权限
    PrismaPermission.SYSTEM_FONT_READ,
    PrismaPermission.SYSTEM_FONT_UPLOAD,
    PrismaPermission.SYSTEM_FONT_DELETE,
    PrismaPermission.SYSTEM_FONT_DOWNLOAD,
  ],
  [SystemRole.USER]: [
    // 普通用户：暂无系统权限（仅用于登录）
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
 */
export const DEFAULT_PROJECT_ROLE_PERMISSIONS: Record<
  ProjectRole,
  ProjectPermission[]
> = {
  [ProjectRole.OWNER]: [
    // 项目所有者拥有所有项目权限
    PrismaProjectPermission.PROJECT_UPDATE,
    PrismaProjectPermission.PROJECT_DELETE,
    PrismaProjectPermission.PROJECT_MEMBER_MANAGE,
    PrismaProjectPermission.PROJECT_MEMBER_ASSIGN,
    PrismaProjectPermission.PROJECT_TRANSFER,
    PrismaProjectPermission.PROJECT_ROLE_MANAGE,
    PrismaProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
    PrismaProjectPermission.FILE_CREATE,
    PrismaProjectPermission.FILE_UPLOAD,
    PrismaProjectPermission.FILE_OPEN,
    PrismaProjectPermission.FILE_EDIT,
    PrismaProjectPermission.FILE_DELETE,
    PrismaProjectPermission.FILE_TRASH_MANAGE,
    PrismaProjectPermission.FILE_DOWNLOAD,
    PrismaProjectPermission.FILE_MOVE,
    PrismaProjectPermission.FILE_COPY,
    PrismaProjectPermission.CAD_SAVE,
    PrismaProjectPermission.CAD_EXTERNAL_REFERENCE,
    PrismaProjectPermission.GALLERY_ADD,
    PrismaProjectPermission.VERSION_READ,
  ],
  [ProjectRole.ADMIN]: [
    // 项目管理员权限
    PrismaProjectPermission.PROJECT_UPDATE,
    PrismaProjectPermission.PROJECT_MEMBER_MANAGE,
    PrismaProjectPermission.PROJECT_MEMBER_ASSIGN,
    PrismaProjectPermission.FILE_CREATE,
    PrismaProjectPermission.FILE_UPLOAD,
    PrismaProjectPermission.FILE_OPEN,
    PrismaProjectPermission.FILE_EDIT,
    PrismaProjectPermission.FILE_DELETE,
    PrismaProjectPermission.FILE_TRASH_MANAGE,
    PrismaProjectPermission.FILE_DOWNLOAD,
    PrismaProjectPermission.FILE_MOVE,
    PrismaProjectPermission.FILE_COPY,
    PrismaProjectPermission.CAD_SAVE,
    PrismaProjectPermission.CAD_EXTERNAL_REFERENCE,
    PrismaProjectPermission.GALLERY_ADD,
    PrismaProjectPermission.VERSION_READ,
  ],
  [ProjectRole.MEMBER]: [
    // 项目成员权限
    PrismaProjectPermission.FILE_CREATE,
    PrismaProjectPermission.FILE_UPLOAD,
    PrismaProjectPermission.FILE_OPEN,
    PrismaProjectPermission.FILE_EDIT,
    PrismaProjectPermission.FILE_DELETE,
    PrismaProjectPermission.FILE_DOWNLOAD,
    PrismaProjectPermission.FILE_MOVE,
    PrismaProjectPermission.FILE_COPY,
    PrismaProjectPermission.CAD_SAVE,
    PrismaProjectPermission.GALLERY_ADD,
    PrismaProjectPermission.VERSION_READ,
  ],
  [ProjectRole.EDITOR]: [
    // 项目编辑者权限
    PrismaProjectPermission.FILE_UPLOAD,
    PrismaProjectPermission.FILE_OPEN,
    PrismaProjectPermission.FILE_EDIT,
    PrismaProjectPermission.FILE_DELETE,
    PrismaProjectPermission.FILE_DOWNLOAD,
    PrismaProjectPermission.FILE_MOVE,
    PrismaProjectPermission.FILE_COPY,
    PrismaProjectPermission.CAD_SAVE,
    PrismaProjectPermission.VERSION_READ,
  ],
  [ProjectRole.VIEWER]: [
    // 项目查看者权限
    PrismaProjectPermission.FILE_OPEN,
    PrismaProjectPermission.FILE_DOWNLOAD,
    PrismaProjectPermission.VERSION_READ,
  ],
};
