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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  SystemRole,
  SystemPermission,
  SYSTEM_ROLE_HIERARCHY,
} from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';
import { CACHE_TTL } from '../constants/cache.constants';

/**
 * 角色基本信息接口
 */
interface RoleBasicInfo {
  id: string;
  name: string;
  description: string | null;
  category: string;
  level: number;
  isSystem: boolean;
}

/**
 * 角色层级节点接口
 */
export interface RoleHierarchyNode {
  id: string;
  name: string;
  description?: string;
  category: string;
  level: number;
  isSystem: boolean;
  children: RoleHierarchyNode[];
}

/**
 * 角色继承服务
 *
 * 功能：
 * 1. 获取角色的所有权限（包括继承的权限）
 * 2. 检查角色是否继承自另一个角色
 * 3. 获取角色层级路径
 * 4. 缓存角色继承关系优化性能
 */
@Injectable()
export class RoleInheritanceService implements OnModuleInit {
  private readonly logger = new Logger(RoleInheritanceService.name);

  // 最大层级深度限制，防止无限递归
  private static readonly MAX_HIERARCHY_DEPTH = 50;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService
  ) {}

  /**
   * 获取角色的所有权限（包括继承的权限）
   * 使用 Prisma ORM 递归查询
   *
   * @param roleName 角色名称
   * @returns 角色拥有的所有权限（包括从父角色继承的权限）
   */
  async getRolePermissions(roleName: SystemRole): Promise<SystemPermission[]> {
    const cacheKey = `role:permissions:${roleName}`;
    const cached = await this.cacheService.get<SystemPermission[] | 'null'>(
      cacheKey
    );

    if (cached !== null) {
      this.logger.log(
        `角色 ${roleName} 权限缓存命中: ${cached === 'null' ? '空' : `${(cached as SystemPermission[]).length} 个权限`}`
      );
      return cached === 'null' ? [] : (cached as SystemPermission[]);
    }

    try {
      // 收集角色及其所有祖先角色的 ID
      const roleIds = await this.collectRoleAncestors(roleName, 0);
      this.logger.log(
        `角色 ${roleName} 及其祖先角色的 ID: ${JSON.stringify(roleIds)}`
      );

      if (roleIds.length === 0) {
        this.logger.warn(`角色 ${roleName} 没有找到角色 ID`);
        this.cacheService.set(cacheKey, 'null', CACHE_TTL.ROLE_PERMISSION);
        return [];
      }

      // 查询所有相关角色的权限
      const permissions = await this.prisma.rolePermission.findMany({
        where: {
          roleId: { in: roleIds },
        },
        select: {
          permission: true,
        },
      });

      this.logger.log(
        `角色 ${roleName} 查询到 ${permissions.length} 条权限记录`
      );

      const allPermissions = [
        ...new Set(permissions.map((p) => p.permission as SystemPermission)),
      ];

      // 缓存结果
      if (allPermissions.length === 0) {
        this.cacheService.set(cacheKey, 'null', CACHE_TTL.ROLE_PERMISSION);
      } else {
        this.cacheService.set(
          cacheKey,
          allPermissions,
          CACHE_TTL.ROLE_PERMISSION
        );
      }

      return allPermissions;
    } catch (error) {
      this.logger.error(
        `获取角色权限失败: ${(error as Error).message}`,
        (error as Error).stack
      );
      // 出错时不缓存空结果，让下次请求可以重新尝试
      return [];
    }
  }

  /**
   * 强制刷新角色权限缓存（清除缓存后重新获取）
   */
  async forceRefreshRolePermissions(
    roleName: SystemRole
  ): Promise<SystemPermission[]> {
    // 先清除缓存
    const cacheKey = `role:permissions:${roleName}`;
    this.cacheService.delete(cacheKey);

    // 重新获取权限
    return this.getRolePermissions(roleName);
  }

  /**
   * 递归收集角色及其所有祖先角色的 ID
   */
  private async collectRoleAncestors(
    roleName: string,
    depth: number
  ): Promise<string[]> {
    if (depth >= RoleInheritanceService.MAX_HIERARCHY_DEPTH) {
      return [];
    }

    const role = await this.prisma.role.findFirst({
      where: { name: roleName },
      select: { id: true, parentId: true },
    });

    if (!role) {
      return [];
    }

    const ids = [role.id];

    // 递归获取父角色
    if (role.parentId) {
      const parentRole = await this.prisma.role.findUnique({
        where: { id: role.parentId },
        select: { name: true },
      });

      if (parentRole) {
        const parentIds = await this.collectRoleAncestors(
          parentRole.name,
          depth + 1
        );
        ids.push(...parentIds);
      }
    }

    return ids;
  }

  /**
   * 检查角色是否继承自另一个角色
   *
   * @param childRoleName 子角色名称
   * @param parentRoleName 父角色名称
   * @returns 是否继承自该父角色
   */
  async isInheritedFrom(
    childRoleName: SystemRole,
    parentRoleName: SystemRole
  ): Promise<boolean> {
    const cacheKey = `role:inherit:${childRoleName}:${parentRoleName}`;
    const cached = await this.cacheService.get<boolean>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    try {
      // 获取继承路径
      const ancestors = await this.collectAncestorNames(childRoleName, 0);

      // 检查父角色是否在继承路径中
      const hasInheritance = ancestors.includes(parentRoleName);

      this.cacheService.set(
        cacheKey,
        hasInheritance,
        CACHE_TTL.ROLE_INHERITANCE
      );
      return hasInheritance;
    } catch (error) {
      this.logger.error(
        `检查角色继承关系失败: ${(error as Error).message}`,
        (error as Error).stack
      );
      // 出错时回退到安全策略
      return false;
    }
  }

  /**
   * 递归收集角色及其所有祖先角色的名称
   */
  private async collectAncestorNames(
    roleName: string,
    depth: number
  ): Promise<string[]> {
    if (depth >= RoleInheritanceService.MAX_HIERARCHY_DEPTH) {
      return [];
    }

    const role = await this.prisma.role.findFirst({
      where: { name: roleName },
      select: { name: true, parentId: true },
    });

    if (!role) {
      return [];
    }

    const names = [role.name];

    // 递归获取父角色
    if (role.parentId) {
      const parentRole = await this.prisma.role.findUnique({
        where: { id: role.parentId },
        select: { name: true },
      });

      if (parentRole) {
        const parentNames = await this.collectAncestorNames(
          parentRole.name,
          depth + 1
        );
        names.push(...parentNames);
      }
    }

    return names;
  }

  /**
   * 获取角色层级路径
   *
   * @param roleName 角色名称
   * @returns 从根角色到当前角色的路径（数组）
   */
  async getRoleHierarchyPath(roleName: SystemRole): Promise<string[]> {
    const cacheKey = `role:path:${roleName}`;
    const cached = await this.cacheService.get<string[]>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    try {
      // 获取继承路径并反转（从根角色到当前角色）
      const ancestors = await this.collectAncestorNames(roleName, 0);
      const path = ancestors.reverse();

      this.cacheService.set(cacheKey, path, CACHE_TTL.ROLE_HIERARCHY_PATH);
      return path;
    } catch (error) {
      this.logger.error(
        `获取角色层级路径失败: ${(error as Error).message}`,
        (error as Error).stack
      );
      return [];
    }
  }

  /**
   * 检查用户是否具有指定权限（考虑角色继承）
   *
   * @param userId 用户ID
   * @param permission 系统权限
   * @returns 是否具有权限
   */
  async checkUserPermissionWithInheritance(
    userId: string,
    permission: SystemPermission
  ): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!user?.role) {
        this.logger.warn(`用户 ${userId} 没有关联角色`);
        return false;
      }

      const roleName = user.role.name as SystemRole;
      const rolePermissions = await this.getRolePermissions(roleName);

      this.logger.log(`角色 ${roleName} 的权限数量: ${rolePermissions.length}`);
      this.logger.log(
        `角色 ${roleName} 的权限列表: ${rolePermissions.join(', ')}`
      );

      const hasPermission = rolePermissions.includes(permission);
      this.logger.log(
        `权限检查: 用户=${userId.substring(0, 8)}..., 角色=${roleName}, 权限=${permission}, 结果=${hasPermission}`
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(
        `检查用户权限（考虑继承）失败: ${(error as Error).message}`,
        (error as Error).stack
      );
      return false;
    }
  }

  /**
   * 清除角色权限缓存
   *
   * @param roleName 角色名称
   */
  async clearRoleCache(roleName: SystemRole): Promise<void> {
    const cacheKey = `role:permissions:${roleName}`;
    this.cacheService.delete(cacheKey);

    // 清除层级路径缓存
    const pathKey = `role:path:${roleName}`;
    this.cacheService.delete(pathKey);

    // 同时清除该角色的所有继承关系缓存
    // 由于缓存键包含角色名，这里无法精确匹配，需要在实际使用时清除相关缓存
    this.logger.debug(`清除角色权限缓存: ${roleName}`);
  }

  /**
   * 递归清除角色权限缓存（包括所有子角色）
   *
   * @param roleName 角色名称
   */
  async clearRoleCacheRecursive(roleName: SystemRole): Promise<void> {
    // 清除当前角色缓存
    await this.clearRoleCache(roleName);

    try {
      // 查找所有子角色
      const currentRole = await this.prisma.role.findFirst({
        where: { name: roleName },
        select: { id: true },
      });

      if (!currentRole) {
        return;
      }

      const children = await this.prisma.role.findMany({
        where: { parentId: currentRole.id },
        select: { name: true },
      });

      // 递归清除子角色缓存
      for (const child of children) {
        await this.clearRoleCacheRecursive(child.name as SystemRole);
      }

      this.logger.debug(
        `递归清除角色权限缓存（含子角色）: ${roleName} (${children.length} 个子角色)`
      );
    } catch (error) {
      this.logger.error(`递归清除角色缓存失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 获取所有角色的层级关系
   *
   * @returns 角色层级关系树
   */
  async getRoleHierarchyTree(): Promise<RoleHierarchyNode[]> {
    try {
      // 获取所有顶级角色（parentId 为 null）
      const topRoles = await this.prisma.role.findMany({
        where: { parentId: null },
        orderBy: { name: 'asc' },
      });

      const tree: RoleHierarchyNode[] = [];

      for (const role of topRoles) {
        const node = await this.buildHierarchyNode(role);
        tree.push(node);
      }

      return tree;
    } catch (error) {
      this.logger.error(`获取角色层级树失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 递归构建层级节点
   */
  private async buildHierarchyNode(
    role: RoleBasicInfo
  ): Promise<RoleHierarchyNode> {
    // 获取子角色
    const children = await this.prisma.role.findMany({
      where: { parentId: role.id },
      orderBy: { name: 'asc' },
    });

    const childNodes: RoleHierarchyNode[] = [];

    for (const child of children) {
      const childNode = await this.buildHierarchyNode(child as RoleBasicInfo);
      childNodes.push(childNode);
    }

    return {
      id: role.id,
      name: role.name,
      description: role.description || undefined,
      category: role.category,
      level: role.level,
      isSystem: role.isSystem,
      children: childNodes,
    };
  }

  /**
   * 初始化系统角色层级关系
   *
   * 根据 SYSTEM_ROLE_HIERARCHY 枚举建立角色层级关系
   * 使用事务确保所有更新原子性
   */
  async initializeRoleHierarchy(): Promise<void> {
    try {
      const roles = await this.prisma.role.findMany({
        where: { isSystem: true },
        select: { id: true, name: true },
      });

      const roleMap = new Map<string, string>();
      roles.forEach((role) => roleMap.set(role.name, role.id));

      // 使用事务确保所有更新原子性
      await this.prisma.$transaction(async (tx) => {
        // 遍历所有系统角色，设置 parentId
        for (const [roleName, parentRoleName] of Object.entries(
          SYSTEM_ROLE_HIERARCHY
        )) {
          if (parentRoleName && typeof parentRoleName === 'string') {
            const roleId = roleMap.get(roleName);
            const parentId = roleMap.get(parentRoleName);

            if (roleId && parentId) {
              // 更新角色的 parentId 和 level
              const parentRole = await tx.role.findUnique({
                where: { id: parentId },
                select: { level: true },
              });

              await tx.role.update({
                where: { id: roleId },
                data: {
                  parentId: parentId,
                  level: (parentRole?.level || 0) + 1,
                },
              });

              this.logger.debug(
                `设置角色层级: ${roleName} -> ${parentRoleName}`
              );
            }
          }
        }
      });

      this.logger.log('系统角色层级关系初始化完成');
    } catch (error) {
      this.logger.error(
        `初始化角色层级关系失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 模块初始化时预热缓存（异步执行，不阻塞启动）
   */
  async onModuleInit(): Promise<void> {
    // 异步执行预热，不阻塞模块启动
    this.warmupCacheAsync().catch((error) => {
      this.logger.error(`预热角色权限缓存失败: ${error.message}`, error.stack);
    });
  }

  /**
   * 异步预热缓存（后台执行）
   */
  private async warmupCacheAsync(): Promise<void> {
    try {
      this.logger.log('开始预热角色权限缓存（后台异步）...');

      const systemRoles = await this.prisma.role.findMany({
        where: { isSystem: true },
        select: { name: true },
      });

      let warmedCount = 0;
      for (const role of systemRoles) {
        try {
          // 强制刷新缓存，确保使用最新数据
          await this.forceRefreshRolePermissions(role.name as SystemRole);
          warmedCount++;
        } catch (error) {
          this.logger.warn(
            `预热角色 ${role.name} 权限缓存失败: ${(error as Error).message}`
          );
        }
      }

      this.logger.log(
        `角色权限缓存预热完成: ${warmedCount}/${systemRoles.length} 个角色`
      );

      // 清除所有活跃用户的权限缓存，确保使用新的角色权限数据
      await this.clearAllActiveUsersCache();
    } catch (error) {
      this.logger.error(
        `预热角色权限缓存失败: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }

  /**
   * 清除所有活跃用户的权限缓存
   */
  private async clearAllActiveUsersCache(): Promise<void> {
    try {
      const activeUsers = await this.prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });

      this.logger.log(`清除 ${activeUsers.length} 个活跃用户的权限缓存...`);

      for (const user of activeUsers) {
        // 清除用户级别的权限缓存
        const keysToDelete = [
          `is_admin:${user.id}`,
          ...Object.values(SystemPermission).map(
            (perm) => `system_perm:${user.id}:${perm}`
          ),
        ];

        for (const key of keysToDelete) {
          this.cacheService.delete(key);
        }
      }

      this.logger.log(`活跃用户权限缓存清除完成`);
    } catch (error) {
      this.logger.error(
        `清除活跃用户缓存失败: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }
}
