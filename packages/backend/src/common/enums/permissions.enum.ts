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
  SystemRole,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLE_LEVELS,
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

// SystemRole 枚举已下沉到 @cloudcad/contracts（单一来源），见下方 re-export

/**
 * 项目角色枚举
 * 用于项目和文件系统的角色管理，与系统角色完全解耦
 * @deprecated 请从 @cloudcad/contracts 导入（单一来源，见 project-role.types）
 */
export { ProjectRole };

/**
 * 系统角色权限映射（SYSTEM_ROLE_PERMISSIONS）与层级（SYSTEM_ROLE_LEVELS）
 * 已下沉到 @cloudcad/contracts（单一来源；prisma seed 脚本因 rootDir 约束
 * 无法 import backend/src），此处 re-export 保持既有 import 路径兼容
 */
export { SystemRole, SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLE_LEVELS };

/**
 * 系统角色继承关系
 * 定义角色的父角色（从父角色继承权限）
 */
export const SYSTEM_ROLE_HIERARCHY: Record<SystemRole, SystemRole | null> = {
  [SystemRole.ADMIN]: null, // 顶级角色
  [SystemRole.AUDIT_ADMIN]: SystemRole.USER, // 继承自 USER（独立于 ADMIN 的审计线，与系统管理权互不隶属）
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
