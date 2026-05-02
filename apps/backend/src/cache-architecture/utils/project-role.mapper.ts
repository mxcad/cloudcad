///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { ProjectRole } from '../../common/enums/permissions.enum';

/**
 * 项目角色映射工具类
 * 提供数据库角色名称到项目访问角色的映射关系
 */
export class ProjectRoleMapper {
  /**
   * 角色名称映射表
   * 将数据库中的角色名称映射到项目访问角色
   */
  private static readonly roleMap: Record<string, ProjectRole> = {
    PROJECT_OWNER: ProjectRole.OWNER,
    PROJECT_ADMIN: ProjectRole.ADMIN,
    PROJECT_MEMBER: ProjectRole.MEMBER,
    PROJECT_EDITOR: ProjectRole.EDITOR,
    PROJECT_VIEWER: ProjectRole.VIEWER,
  };

  /**
   * 将数据库角色名称映射到项目访问角色
   * @param roleName 数据库中的角色名称（如 PROJECT_OWNER, PROJECT_ADMIN）
   * @returns 项目访问角色
   */
  static mapRoleToAccessRole(roleName: string): ProjectRole {
    return this.roleMap[roleName] || ProjectRole.VIEWER;
  }

  /**
   * 获取所有可用的数据库角色名称
   * @returns 角色名称数组
   */
  static getAvailableDatabaseRoles(): string[] {
    return Object.keys(this.roleMap);
  }

  /**
   * 获取所有可用的项目访问角色
   * @returns 项目访问角色数组
   */
  static getAvailableAccessRoles(): ProjectRole[] {
    return Object.values(this.roleMap);
  }

  /**
   * 检查数据库角色是否存在
   * @param roleName 数据库角色名称
   * @returns 是否存在
   */
  static hasDatabaseRole(roleName: string): boolean {
    return roleName in this.roleMap;
  }
}
