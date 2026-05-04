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
import { Permission as PrismaPermission, ProjectPermission as PrismaProjectPermission, } from "@prisma/client";
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
 * 角色类别
 */
export var RoleCategory;
(function (RoleCategory) {
    RoleCategory["SYSTEM"] = "SYSTEM";
    RoleCategory["PROJECT"] = "PROJECT";
    RoleCategory["CUSTOM"] = "CUSTOM";
})(RoleCategory || (RoleCategory = {}));
/**
 * 系统角色（用于后台管理）
 */
export var SystemRole;
(function (SystemRole) {
    SystemRole["ADMIN"] = "ADMIN";
    SystemRole["USER_MANAGER"] = "USER_MANAGER";
    SystemRole["FONT_MANAGER"] = "FONT_MANAGER";
    SystemRole["USER"] = "USER";
})(SystemRole || (SystemRole = {}));
/**
 * 项目角色枚举
 * 用于项目和文件系统的角色管理，与系统角色完全解耦
 */
export var ProjectRole;
(function (ProjectRole) {
    /** 项目所有者：拥有所有项目权限 */
    ProjectRole["OWNER"] = "PROJECT_OWNER";
    /** 项目管理员：管理项目和成员 */
    ProjectRole["ADMIN"] = "PROJECT_ADMIN";
    /** 项目编辑者：编辑文件 */
    ProjectRole["EDITOR"] = "PROJECT_EDITOR";
    /** 项目成员：基本项目操作 */
    ProjectRole["MEMBER"] = "PROJECT_MEMBER";
    /** 项目查看者：只读权限 */
    ProjectRole["VIEWER"] = "PROJECT_VIEWER";
})(ProjectRole || (ProjectRole = {}));
/**
 * 系统角色权限映射
 * 定义系统角色拥有的系统权限（直接权限，不包括继承）
 */
export const SYSTEM_ROLE_PERMISSIONS = {
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
        PrismaPermission.LIBRARY_DRAWING_MANAGE,
        PrismaPermission.LIBRARY_BLOCK_MANAGE,
        PrismaPermission.STORAGE_QUOTA,
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
        PrismaPermission.STORAGE_QUOTA,
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
export const SYSTEM_ROLE_HIERARCHY = {
    [SystemRole.ADMIN]: null, // 顶级角色
    [SystemRole.USER_MANAGER]: SystemRole.USER, // 继承自 USER
    [SystemRole.FONT_MANAGER]: SystemRole.USER, // 继承自 USER
    [SystemRole.USER]: null, // 基础角色
};
/**
 * 默认项目角色权限映射
 * 定义默认项目角色拥有的项目权限
 */
export const DEFAULT_PROJECT_ROLE_PERMISSIONS = {
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
//# sourceMappingURL=permissions.enum.js.map