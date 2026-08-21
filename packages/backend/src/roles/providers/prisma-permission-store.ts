///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { SystemPermission, SystemRole, ProjectPermission, ProjectRole } from '../../common/enums/permissions.enum';
import { PermissionCacheService } from '../../permission/services/permission-cache.service';
import { RoleInheritanceService } from '../../permission/services/role-inheritance.service';
import { CACHE_TTL } from '../../common/constants/cache.constants';
import { IPermissionStore } from '../../common/interfaces/permission-store.interface';

@Injectable()
export class PrismaPermissionStore implements IPermissionStore {
  private readonly logger = new Logger(PrismaPermissionStore.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService,
    private readonly roleInheritanceService: RoleInheritanceService
  ) {}

  async getUserSystemPermissions(userId: string): Promise<SystemPermission[]> {
    try {
      const cacheKey = `system_perms:${userId}`;
      const cached = await this.cacheService.get<SystemPermission[]>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!user?.role) {
        return [];
      }

      const permissions = await this.roleInheritanceService.getRolePermissions(
        user.role.name as SystemRole
      );

      this.cacheService.set(cacheKey, permissions, CACHE_TTL.SYSTEM_PERMISSION);
      return permissions;
    } catch (error) {
      this.logger.error(`获取用户系统权限失败: ${error.message}`, error.stack);
      return [];
    }
  }

  async checkSystemPermission(
    userId: string,
    permission: SystemPermission
  ): Promise<boolean> {
    try {
      const cacheKey = `system_perm:${userId}:${permission}`;
      const cached = await this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const hasPermission = await this.roleInheritanceService.checkUserPermissionWithInheritance(
        userId,
        permission
      );

      this.cacheService.set(cacheKey, hasPermission, CACHE_TTL.SYSTEM_PERMISSION);
      return hasPermission;
    } catch (error) {
      this.logger.error(`检查系统权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  async getUserProjectPermissions(
    userId: string,
    projectId: string
  ): Promise<ProjectPermission[]> {
    try {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
        include: {
          projectRole: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (!member?.projectRole) {
        // 无成员行：可能是私人空间（"我的图纸"）。私人空间零成员零角色
        // （ADR-00XX），权限按 ownerId 判定（与 RequireProjectPermissionGuard.
        // handlePersonalSpaceAccess 语义一致）——owner 视为拥有全部项目权限，
        // 前端多选栏/行级按钮等门控依赖本接口返回值。
        const personalSpaceOwnerId = await this.getPersonalSpaceOwnerId(projectId);
        if (personalSpaceOwnerId === userId) {
          return Object.values(ProjectPermission);
        }
        return [];
      }

      return member.projectRole.permissions.map(
        (rp) => rp.permission as unknown as ProjectPermission
      );
    } catch (error) {
      this.logger.error(`获取用户项目权限失败: ${error.message}`, error.stack);
      return [];
    }
  }

  async checkProjectPermission(
    userId: string,
    projectId: string,
    permission: ProjectPermission
  ): Promise<boolean> {
    try {
      const cacheKey = `project:permission:${userId}:${projectId}:${permission}`;
      const cached = await this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const userPermissions = await this.getUserProjectPermissions(userId, projectId);
      const hasPermission = userPermissions.includes(permission);

      this.cacheService.set(cacheKey, hasPermission, CACHE_TTL.PROJECT_PERMISSION);
      return hasPermission;
    } catch (error) {
      this.logger.error(`检查项目权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  async getUserProjectRole(
    userId: string,
    projectId: string
  ): Promise<string | null> {
    try {
      const cacheKey = `project:role:${userId}:${projectId}`;
      const cached = await this.cacheService.get<string>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
        include: {
          projectRole: true,
        },
      });

      let role = member?.projectRole?.name || null;
      if (!role) {
        // 私人空间 owner 视为项目所有者（ADR-00XX，与 getUserProjectPermissions 语义一致）
        const personalSpaceOwnerId = await this.getPersonalSpaceOwnerId(projectId);
        if (personalSpaceOwnerId === userId) {
          role = ProjectRole.OWNER;
        }
      }
      if (role) {
        this.cacheService.set(cacheKey, role, CACHE_TTL.PROJECT_MEMBER_ROLE);
      }

      return role;
    } catch (error) {
      this.logger.error(`获取用户项目角色失败: ${error.message}`, error.stack);
      return null;
    }
  }

  async isProjectOwner(userId: string, projectId: string): Promise<boolean> {
    try {
      const cacheKey = `project:owner:${userId}:${projectId}`;
      const cached = await this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const project = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      });

      const isOwner = project?.ownerId === userId && project?.ownerId !== undefined;
      this.cacheService.set(cacheKey, isOwner, CACHE_TTL.PROJECT_OWNER);

      return isOwner;
    } catch (error) {
      this.logger.error(`检查项目所有者失败: ${error.message}`, error.stack);
      return false;
    }
  }

  async clearUserCache(userId: string): Promise<void> {
    await this.cacheService.clearUserCache(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { role: { select: { name: true } } },
    });

    if (user?.role) {
      await this.roleInheritanceService.clearRoleCache(
        user.role.name as SystemRole
      );
    }
  }

  async clearProjectCache(projectId: string): Promise<void> {
    await this.cacheService.clearProjectCache(projectId);
  }

  /**
   * 解析私人空间（"我的图纸"）的 ownerId：项目 ID 指向 PERSONAL_SPACE 节点时
   * 返回其 ownerId，否则返回 null（普通项目/资源库等不适用 owner 直通语义）。
   */
  private async getPersonalSpaceOwnerId(
    projectId: string
  ): Promise<string | null> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: projectId },
      select: { nodeType: true, ownerId: true },
    });
    return node?.nodeType === NodeType.PERSONAL_SPACE
      ? (node.ownerId ?? null)
      : null;
  }
}
