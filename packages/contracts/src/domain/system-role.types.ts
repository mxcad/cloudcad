///////////////////////////////////////////////////////////////////////////////
// 系统角色契约：与 backend 的 src/common/enums/permissions.enum.ts 保持单一来源。
//
// SystemRole 枚举与 SYSTEM_ROLE_PERMISSIONS 是「系统角色权限」的业务契约，
// 同时被 backend 业务模块、初始化播种（initialization.service）与 prisma seed 脚本消费。
// 下沉到 @cloudcad/contracts 后，seed（rootDir 约束为 ./prisma，无法 import backend/src）
// 可从本包安全导入，三处不再各自维护权限清单而漂移。
// 改变系统角色权限定义统一编辑本文件。
///////////////////////////////////////////////////////////////////////////////

import { Permission as PrismaPermission } from '@cloudcad/db';

/**
 * 系统角色（用于后台管理）
 */
export enum SystemRole {
  /** 系统管理员：拥有所有系统权限（不含审计管理，三权分立见 #321） */
  ADMIN = 'ADMIN',
  /** 审计管理员：审计数据查询/导出/清理（等保 8.5.2 三权分立） */
  AUDIT_ADMIN = 'AUDIT_ADMIN',
  /** 用户管理员：管理用户和角色 */
  USER_MANAGER = 'USER_MANAGER',
  /** 字体管理员：管理字体库 */
  FONT_MANAGER = 'FONT_MANAGER',
  /** 普通用户：基础系统权限 */
  USER = 'USER',
}

/**
 * 系统角色权限映射
 * 定义系统角色拥有的系统权限（直接权限，不包括继承）
 * 单一来源：backend 初始化播种、prisma seed、权限审计脚本均从此读取
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<
  SystemRole,
  PrismaPermission[]
> = {
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
    // 注意：系统管理员不持有 AUDIT_ADMIN（等保 8.5.2 三权分立，
    // 审计清理权归 AUDIT_ADMIN 角色，如需兼任可通过角色管理显式授予）
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
  [SystemRole.AUDIT_ADMIN]: [
    // 审计管理员权限（等保 8.5.2 三权分立）
    PrismaPermission.AUDIT_ADMIN,
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
 * 系统角色层级（Role.level 字段）
 * ADMIN=100（顶级），AUDIT_ADMIN/USER_MANAGER/FONT_MANAGER=50，USER=0
 * 单一来源：backend 初始化播种、prisma seed 均从此读取，避免 level 赋值漂移
 */
export const SYSTEM_ROLE_LEVELS: Record<SystemRole, number> = {
  [SystemRole.ADMIN]: 100,
  [SystemRole.AUDIT_ADMIN]: 50,
  [SystemRole.USER_MANAGER]: 50,
  [SystemRole.FONT_MANAGER]: 50,
  [SystemRole.USER]: 0,
};
