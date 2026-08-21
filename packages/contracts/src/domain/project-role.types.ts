///////////////////////////////////////////////////////////////////////////////
// 项目角色契约：与 backend 的 src/common/enums/permissions.enum.ts 保持单一来源。
//
// ProjectRole 枚举与 DEFAULT_PROJECT_ROLE_PERMISSIONS 是「项目角色权限」的业务契约，
// 同时被 backend 业务模块与 prisma seed 脚本消费。下沉到 @cloudcad/contracts 后，
// seed（rootDir 约束为 ./prisma，无法 import backend/src）可从本包安全导入，
// 改变权限定义统一编辑 schema.prisma + 本文件。
///////////////////////////////////////////////////////////////////////////////

import { ProjectPermission as PrismaProjectPermission } from '@cloudcad/db';

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
 * 默认项目角色权限映射
 * 定义默认项目角色拥有的项目权限
 */
export const DEFAULT_PROJECT_ROLE_PERMISSIONS: Record<
  ProjectRole,
  PrismaProjectPermission[]
> = {
  [ProjectRole.OWNER]: [
    // 项目所有者拥有所有项目权限
    PrismaProjectPermission.PROJECT_UPDATE,
    PrismaProjectPermission.PROJECT_DELETE,
    PrismaProjectPermission.PROJECT_MEMBER_MANAGE,
    PrismaProjectPermission.PROJECT_MEMBER_ASSIGN,
    PrismaProjectPermission.PROJECT_TRANSFER,
    PrismaProjectPermission.PROJECT_TRANSFER_MANAGE,
    PrismaProjectPermission.PROJECT_ROLE_MANAGE,
    PrismaProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
    PrismaProjectPermission.FILE_CREATE,
    PrismaProjectPermission.FILE_UPLOAD,
    PrismaProjectPermission.FILE_OPEN,
    PrismaProjectPermission.FILE_EDIT,
    PrismaProjectPermission.FILE_DELETE,
    PrismaProjectPermission.FILE_TRASH_MANAGE,
    PrismaProjectPermission.FILE_DOWNLOAD,
    PrismaProjectPermission.FILE_SHARE,
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
    PrismaProjectPermission.PROJECT_ROLE_MANAGE,
    PrismaProjectPermission.PROJECT_ROLE_PERMISSION_MANAGE,
    PrismaProjectPermission.PROJECT_TRANSFER_MANAGE,
    PrismaProjectPermission.FILE_CREATE,
    PrismaProjectPermission.FILE_UPLOAD,
    PrismaProjectPermission.FILE_OPEN,
    PrismaProjectPermission.FILE_EDIT,
    PrismaProjectPermission.FILE_DELETE,
    PrismaProjectPermission.FILE_TRASH_MANAGE,
    PrismaProjectPermission.FILE_DOWNLOAD,
    PrismaProjectPermission.FILE_SHARE,
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
    PrismaProjectPermission.FILE_SHARE,
    PrismaProjectPermission.FILE_MOVE,
    PrismaProjectPermission.FILE_COPY,
    PrismaProjectPermission.CAD_SAVE,
    PrismaProjectPermission.CAD_EXTERNAL_REFERENCE,
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
    PrismaProjectPermission.CAD_EXTERNAL_REFERENCE,
    PrismaProjectPermission.VERSION_READ,
  ],
  [ProjectRole.VIEWER]: [
    // 项目查看者权限
    PrismaProjectPermission.FILE_OPEN,
    PrismaProjectPermission.FILE_DOWNLOAD,
    PrismaProjectPermission.VERSION_READ,
  ],
};
