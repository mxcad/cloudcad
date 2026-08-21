///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, Inject } from '@nestjs/common';
import { SystemPermission, SystemRole } from '../../common/enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';
import { RoleInheritanceService } from './role-inheritance.service';
import { PermissionContext } from '../../common/utils/permission.utils';
import { CACHE_TTL } from '../../common/constants/cache.constants';
import { IPermissionService, UserWithPermissions } from '../interfaces/permission-service.interface';
import type { IStorePermissionStrategy, IContextPermissionStrategy } from '../strategies';
import { ISTORE_PERMISSION_STRATEGY, ICONTEXT_PERMISSION_STRATEGY } from '../strategies';
import { DatabaseService } from '../../database/database.service';
import { ClsService } from 'nestjs-cls';

const systemPermCacheKey = (userId: string, permission: SystemPermission): string =>
  `system_perm:${userId}:${permission}`;

/**
 * 系统权限检查服务
 *
 * 作为薄门面编排策略链：
 * - StorePermissionStrategy 处理 IPermissionStore 委托（TOB 定制认证路径）
 * - ContextPermissionStrategy 处理上下文规则（策略引擎 + 传统规则）
 * - 核心缓存 + DB 逻辑保留在此模块
 */
@Injectable()
export class PermissionService implements IPermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService,
    private readonly roleInheritanceService: RoleInheritanceService,
    @Inject(ISTORE_PERMISSION_STRATEGY)
    private readonly storeStrategy: IStorePermissionStrategy,
    @Inject(ICONTEXT_PERMISSION_STRATEGY)
    private readonly contextStrategy: IContextPermissionStrategy,
    private readonly cls: ClsService,
  ) {}

  async checkSystemPermission(
    userId: string,
    permission: SystemPermission
  ): Promise<boolean> {
    const cacheKey = systemPermCacheKey(userId, permission);
    try {
      const storeResult = await this.storeStrategy.checkSystemPermission(userId, permission);
      if (storeResult !== null) return storeResult;
      const cached = await this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        this.logger.log(`权限检查缓存命中: 用户=${userId.substring(0, 8)}..., 权限=${permission}, 结果=${cached}`);
        return cached;
      }

      const hasPermission = await this.roleInheritanceService.checkUserPermissionWithInheritance(userId, permission);
      await this.cacheService.set(cacheKey, hasPermission, CACHE_TTL.SYSTEM_PERMISSION);
      this.logger.log(`权限检查完成: 用户=${userId.substring(0, 8)}..., 权限=${permission}, 结果=${hasPermission}`);
      return hasPermission;
    } catch (error) {
      this.logger.error(`系统权限检查失败: ${(error as Error).message}`, (error as Error).stack);
      return false;
    }
  }

  async getUserPermissions(user: UserWithPermissions): Promise<SystemPermission[]> {
    try {
      if (!user.role) return [];
      return await this.roleInheritanceService.getRolePermissions(user.role.name as SystemRole);
    } catch (error) {
      this.logger.error(`获取用户权限失败: ${(error as Error).message}`, (error as Error).stack);
      return [];
    }
  }

  hasRole(user: UserWithPermissions, roleNames: string[]): boolean {
    return roleNames.includes(user.role?.name || '');
  }

  async checkSystemPermissionWithContext(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext
  ): Promise<boolean> {
    try {
      const hasBasicPermission = await this.checkSystemPermission(userId, permission);
      if (!hasBasicPermission) {
        this.logPermissionDenied(userId, permission, context, '基础权限检查失败');
        return false;
      }

      return await this.contextStrategy.checkContextRules(userId, permission, context);
    } catch (error) {
      this.logger.error(`上下文权限检查失败: ${(error as Error).message}`, (error as Error).stack);
      return false;
    }
  }

  async clearUserCache(userId: string): Promise<void> {
    const cleared = await this.storeStrategy.clearUserCache(userId);
    if (cleared) return;

    await this.cacheService.clearUserCache(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });

    if (user?.role) {
      await this.roleInheritanceService.clearRoleCache(user.role.name as SystemRole);
    }
  }

  async checkSystemPermissionsBatch(
    userId: string,
    permissions: SystemPermission[]
  ): Promise<Map<SystemPermission, boolean>> {
    const storeResults = await this.storeStrategy.checkSystemPermissionsBatch(userId, permissions);
    if (storeResults !== null) return storeResults;

    const results = new Map<SystemPermission, boolean>();
    const uncachedPermissions: SystemPermission[] = [];

    for (const permission of permissions) {
      const cached = await this.cacheService.get<boolean>(systemPermCacheKey(userId, permission));
      if (cached !== null) {
        results.set(permission, cached);
      } else {
        uncachedPermissions.push(permission);
      }
    }

    if (uncachedPermissions.length > 0) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId, deletedAt: null },
          select: { role: { select: { name: true } } },
        });

        if (!user?.role) {
          for (const permission of uncachedPermissions) {
            results.set(permission, false);
          }
          return results;
        }

        const userPermissions = await this.roleInheritanceService.getRolePermissions(user.role.name as SystemRole);

        for (const permission of uncachedPermissions) {
          const hasPermission = userPermissions.includes(permission);
          results.set(permission, hasPermission);
          await this.cacheService.set(systemPermCacheKey(userId, permission), hasPermission, CACHE_TTL.SYSTEM_PERMISSION);
        }
      } catch (error) {
        this.logger.error(`批量检查系统权限失败: ${(error as Error).message}`, (error as Error).stack);
        for (const permission of uncachedPermissions) {
          results.set(permission, false);
        }
      }
    }

    return results;
  }

  private logPermissionDenied(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext,
    reason: string
  ): void {
    const clientIp = this.cls.get<string>('clientIp') || context.ipAddress || 'unknown';
    const userAgent = this.cls.get<string>('userAgent') || context.userAgent || 'unknown';

    this.logger.warn(`权限拒绝: 用户=${userId}, 权限=${permission}, 原因=${reason}, IP=${clientIp}, UA=${userAgent}`);
  }
}