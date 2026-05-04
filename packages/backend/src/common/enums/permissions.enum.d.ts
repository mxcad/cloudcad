/**
 * 权限枚举 - 从 Prisma Client 导入
 *
 * 系统权限和项目权限的定义来源于 packages/backend/prisma/schema.prisma
 * 修改权限请编辑 schema.prisma 文件，然后运行 pnpm db:generate
 *
 * 角色相关的枚举和映射在本文件中定义
 */
import { Permission as PrismaPermission, ProjectPermission as PrismaProjectPermission } from "@prisma/client";
/**
 * 系统权限枚举
 * 用于后台管理功能的权限控制
 * 来源: Prisma Schema (Permission 枚举)
 */
export declare const SystemPermission: {
    SYSTEM_USER_READ: "SYSTEM_USER_READ";
    SYSTEM_USER_CREATE: "SYSTEM_USER_CREATE";
    SYSTEM_USER_UPDATE: "SYSTEM_USER_UPDATE";
    SYSTEM_USER_DELETE: "SYSTEM_USER_DELETE";
    SYSTEM_ROLE_READ: "SYSTEM_ROLE_READ";
    SYSTEM_ROLE_CREATE: "SYSTEM_ROLE_CREATE";
    SYSTEM_ROLE_UPDATE: "SYSTEM_ROLE_UPDATE";
    SYSTEM_ROLE_DELETE: "SYSTEM_ROLE_DELETE";
    SYSTEM_ROLE_PERMISSION_MANAGE: "SYSTEM_ROLE_PERMISSION_MANAGE";
    SYSTEM_FONT_READ: "SYSTEM_FONT_READ";
    SYSTEM_FONT_UPLOAD: "SYSTEM_FONT_UPLOAD";
    SYSTEM_FONT_DELETE: "SYSTEM_FONT_DELETE";
    SYSTEM_FONT_DOWNLOAD: "SYSTEM_FONT_DOWNLOAD";
    SYSTEM_ADMIN: "SYSTEM_ADMIN";
    SYSTEM_MONITOR: "SYSTEM_MONITOR";
    SYSTEM_CONFIG_READ: "SYSTEM_CONFIG_READ";
    SYSTEM_CONFIG_WRITE: "SYSTEM_CONFIG_WRITE";
    LIBRARY_DRAWING_MANAGE: "LIBRARY_DRAWING_MANAGE";
    LIBRARY_BLOCK_MANAGE: "LIBRARY_BLOCK_MANAGE";
    STORAGE_QUOTA: "STORAGE_QUOTA";
    PROJECT_CREATE: "PROJECT_CREATE";
};
/**
 * 项目权限枚举
 * 用于项目和文件系统的权限控制
 * 来源: Prisma Schema
 */
export declare const ProjectPermission: {
    PROJECT_UPDATE: "PROJECT_UPDATE";
    PROJECT_DELETE: "PROJECT_DELETE";
    PROJECT_MEMBER_MANAGE: "PROJECT_MEMBER_MANAGE";
    PROJECT_MEMBER_ASSIGN: "PROJECT_MEMBER_ASSIGN";
    PROJECT_TRANSFER: "PROJECT_TRANSFER";
    PROJECT_ROLE_MANAGE: "PROJECT_ROLE_MANAGE";
    PROJECT_ROLE_PERMISSION_MANAGE: "PROJECT_ROLE_PERMISSION_MANAGE";
    FILE_CREATE: "FILE_CREATE";
    FILE_UPLOAD: "FILE_UPLOAD";
    FILE_OPEN: "FILE_OPEN";
    FILE_EDIT: "FILE_EDIT";
    FILE_DELETE: "FILE_DELETE";
    FILE_TRASH_MANAGE: "FILE_TRASH_MANAGE";
    FILE_DOWNLOAD: "FILE_DOWNLOAD";
    FILE_MOVE: "FILE_MOVE";
    FILE_COPY: "FILE_COPY";
    CAD_SAVE: "CAD_SAVE";
    CAD_EXTERNAL_REFERENCE: "CAD_EXTERNAL_REFERENCE";
    VERSION_READ: "VERSION_READ";
};
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
export declare enum RoleCategory {
    SYSTEM = "SYSTEM",// 系统角色（用于后台管理）
    PROJECT = "PROJECT",// 项目角色（用于项目和文件管理，暂不实现）
    CUSTOM = "CUSTOM"
}
/**
 * 系统角色（用于后台管理）
 */
export declare enum SystemRole {
    ADMIN = "ADMIN",// 系统管理员：拥有所有系统权限
    USER_MANAGER = "USER_MANAGER",// 用户管理员：管理用户和角色
    FONT_MANAGER = "FONT_MANAGER",// 字体管理员：管理字体库
    USER = "USER"
}
/**
 * 项目角色枚举
 * 用于项目和文件系统的角色管理，与系统角色完全解耦
 */
export declare enum ProjectRole {
    /** 项目所有者：拥有所有项目权限 */
    OWNER = "PROJECT_OWNER",
    /** 项目管理员：管理项目和成员 */
    ADMIN = "PROJECT_ADMIN",
    /** 项目编辑者：编辑文件 */
    EDITOR = "PROJECT_EDITOR",
    /** 项目成员：基本项目操作 */
    MEMBER = "PROJECT_MEMBER",
    /** 项目查看者：只读权限 */
    VIEWER = "PROJECT_VIEWER"
}
/**
 * 系统角色权限映射
 * 定义系统角色拥有的系统权限（直接权限，不包括继承）
 */
export declare const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, SystemPermission[]>;
/**
 * 系统角色继承关系
 * 定义角色的父角色（从父角色继承权限）
 */
export declare const SYSTEM_ROLE_HIERARCHY: Record<SystemRole, SystemRole | null>;
/**
 * 默认项目角色权限映射
 * 定义默认项目角色拥有的项目权限
 */
export declare const DEFAULT_PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, ProjectPermission[]>;
//# sourceMappingURL=permissions.enum.d.ts.map