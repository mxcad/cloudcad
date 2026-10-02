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
} from '../../common/enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';
import { CACHE_TTL } from '../../common/constants/cache.constants';

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
    if (!roleName) {
      this.logger.warn('getRolePermissions 调用时 roleName 为空，直接返回空权限');
      return [];
    }

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
        // 不永久缓存空结果，避免启动竞态（角色尚未播种）导致角色权限被永久置空。
        // 下次请求会重新解析，播种/层级初始化后会通过 clearRoleCache 主动失效。
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
    // 先清除缓存（必须 await：delete 未完成就重新获取，可能读到旧缓存）
    const cacheKey = `role:permissions:${roleName}`;
    await this.cacheService.delete(cacheKey);

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
      orderBy: { level: 'desc' },
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
    // 必须 await：调用方（如 roles.service）在 await 后可能立即重查权限，
    // 未等待删除完成会读到旧缓存
    const cacheKey = `role:permissions:${roleName}`;
    await this.cacheService.delete(cacheKey);

    // 清除层级路径缓存
    const pathKey = `role:path:${roleName}`;
    await this.cacheService.delete(pathKey);

    this.logger.debug(`清除角色权限缓存: ${roleName}`);
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
        select: { id: true, name: true, level: true },
      });

      // 按角色名去重：同名系统角色可能存在重复行，保留层级最高（最权威）的一行，
      // 否则层级关系可能被设置到错误/空白的角色行上
      const roleMap = new Map<string, { id: string; level: number }>();
      roles.forEach((role) => {
        const existing = roleMap.get(role.name);
        if (!existing || role.level > existing.level) {
          roleMap.set(role.name, { id: role.id, level: role.level });
        }
      });

      // 使用事务确保所有更新原子性
      await this.prisma.$transaction(async (tx) => {
        // 遍历所有系统角色，设置 parentId
        for (const [roleName, parentRoleName] of Object.entries(
          SYSTEM_ROLE_HIERARCHY
        )) {
            if (parentRoleName && typeof parentRoleName === 'string') {
              const roleId = roleMap.get(roleName)?.id;
              const parentId = roleMap.get(parentRoleName)?.id;

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
        `角色权限缓存预热完成: ${warmedCount}/${systemRoles.length} 个角色。用户权限缓存按需惰性构建。`
      );
    } catch (error) {
      this.logger.error(
        `预热角色权限缓存失败: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }
}
