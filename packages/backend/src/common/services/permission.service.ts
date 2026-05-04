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

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SystemPermission, SystemRole } from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';
import { RoleInheritanceService } from './role-inheritance.service';
import { PermissionContext } from '../utils/permission.utils';
import { Permission as PrismaPermission } from '@prisma/client';
import { PolicyConfigService } from '../../policy-engine/services/policy-config.service';
import { PolicyEngineService } from '../../policy-engine/services/policy-engine.service';
import { IPermissionPolicy } from '../../policy-engine/interfaces/permission-policy.interface';
import { CACHE_TTL } from '../constants/cache.constants';
import { IPERMISSION_STORE, IPermissionStore } from '../interfaces/permission-store.interface';

export interface Role {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isSystem: boolean;
  permissions?: { permission: SystemPermission }[];
}

export interface UserWithPermissions {
  id: string;
  email: string;
  username: string;
  nickname?: string;
  avatar?: string;
  role: Role;
  status: string;
}

/**
 * 系统权限检查服务
 *
 * 功能：
 * 1. 检查用户是否具有指定系统权限
 * 2. 支持系统权限缓存优化性能
 * 3. 支持上下文感知的权限检查
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService,
    private readonly roleInheritanceService: RoleInheritanceService,
    @Optional()
    @Inject(IPERMISSION_STORE)
    private readonly permissionStore?: IPermissionStore,
    @Optional()
    private readonly policyConfigService?: PolicyConfigService,
    @Optional()
    private readonly policyEngineService?: PolicyEngineService
  ) {}

  /**
   * 系统权限检查入口
   *
   * @param userId 用户 ID
   * @param permission 系统权限
   * @returns 是否具有权限
   */
  async checkSystemPermission(
    userId: string,
    permission: SystemPermission
  ): Promise<boolean> {
    const startTime = Date.now();
    let decisionReason = '';
    let hasPermission = false;

    try {
      if (this.permissionStore) {
        return this.permissionStore.checkSystemPermission(userId, permission);
      }

      // 1. 检查缓存
      const cacheKey = `system_perm:${userId}:${permission}`;
      const cached = await this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        decisionReason = '缓存命中';
        hasPermission = cached;
        this.logger.log(
          `权限检查缓存命中: 用户=${userId.substring(0, 8)}..., 权限=${permission}, 结果=${hasPermission}`
        );
      } else {
        // 2. 检查用户的系统权限（包括管理员也需要具体权限配置）
        decisionReason = '系统权限检查';
        hasPermission = await this.checkUserSystemPermission(
          userId,
          permission
        );
        this.cacheService.set(
          cacheKey,
          hasPermission,
          CACHE_TTL.SYSTEM_PERMISSION
        ); // 5 分钟
        this.logger.log(
          `权限检查完成: 用户=${userId.substring(0, 8)}..., 权限=${permission}, 结果=${hasPermission}, 原因=${decisionReason}`
        );
      }

      // 权限检查不记录审计日志（避免日志过多）
      return hasPermission;
    } catch (error) {
      this.logger.error(
        `系统权限检查失败: ${(error as Error).message}`,
        (error as Error).stack
      );

      // 权限检查不记录审计日志（避免日志过多）
      return false;
    }
  }

  /**
   * 检查用户是否为系统管理员
   */
  private async isSystemAdmin(userId: string): Promise<boolean> {
    const cacheKey = `is_admin:${userId}`;
    const cached = await this.cacheService.get<boolean>(cacheKey);
    if (cached !== null) {
      this.logger.log(
        `is_admin 缓存命中: 用户=${userId.substring(0, 8)}..., 结果=${cached}`
      );
      return cached;
    }

    // 检查用户是否具有 SYSTEM_ADMIN 权限
    const isAdmin = await this.checkUserSystemPermission(
      userId,
      SystemPermission.SYSTEM_ADMIN
    );

    this.logger.log(
      `is_admin 计算完成: 用户=${userId.substring(0, 8)}..., 结果=${isAdmin}`
    );
    this.cacheService.set(cacheKey, isAdmin, CACHE_TTL.USER_ROLE); // 10 分钟
    return isAdmin;
  }

  /**
   * 检查用户的系统权限（支持角色继承）
   */
  private async checkUserSystemPermission(
    userId: string,
    permission: SystemPermission
  ): Promise<boolean> {
    try {
      // 使用角色继承服务检查权限（包括继承的权限）
      return await this.roleInheritanceService.checkUserPermissionWithInheritance(
        userId,
        permission
      );
    } catch (error) {
      this.logger.error(`检查用户系统权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取用户的系统权限（包括继承的权限）
   */
  async getUserPermissions(
    user: UserWithPermissions
  ): Promise<SystemPermission[]> {
    try {
      if (!user.role) {
        return [];
      }

      // 使用角色继承服务获取所有权限（包括继承的权限）
      return await this.roleInheritanceService.getRolePermissions(
        user.role.name as SystemRole
      );
    } catch (error) {
      this.logger.error(`获取用户权限失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 检查用户是否具有指定角色
   */
  hasRole(user: UserWithPermissions, roleNames: string[]): boolean {
    return roleNames.includes(user.role?.name || '');
  }

  /**
   * 支持上下文的权限检查
   *
   * 在基础权限检查的基础上，增加上下文感知的额外验证
   *
   * @param userId 用户 ID
   * @param permission 系统权限
   * @param context 上下文信息
   * @returns 是否具有权限
   */
  async checkSystemPermissionWithContext(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      // 1. 先进行基础权限检查
      const hasBasicPermission = await this.checkSystemPermission(
        userId,
        permission
      );

      if (!hasBasicPermission) {
        return false;
      }

      // 2. 检查上下文规则
      const contextGranted = await this.checkContextRules(
        userId,
        permission,
        context
      );

      if (!contextGranted) {
        // 权限检查不记录审计日志（避免日志过多）
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`上下文权限检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查上下文规则
   *
   * 使用策略引擎评估动态权限策略
   *
   * @returns 是否通过上下文规则检查
   */
  private async checkContextRules(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext
  ): Promise<boolean> {
    // 如果策略引擎服务未注入，使用旧的硬编码规则（向后兼容）
    if (!this.policyConfigService || !this.policyEngineService) {
      return this.checkLegacyContextRules(userId, permission, context);
    }

    try {
      // 获取该权限的所有启用的策略
      const policyConfigs =
        await this.policyConfigService.getEnabledPoliciesForPermission(
          permission as PrismaPermission
        );

      // 如果没有配置策略，默认允许
      if (policyConfigs.length === 0) {
        return true;
      }

      // 创建策略实例
      const policies: IPermissionPolicy[] = [];
      for (const config of policyConfigs) {
        try {
          const policy = this.policyEngineService.createPolicy(
            config.type,
            config.id || 'temp',
            config.config
          );
          policies.push(policy);
        } catch (error) {
          this.logger.error(
            `创建策略实例失败: ${config.name} - ${error.message}`,
            error.stack
          );
        }
      }

      // 如果没有有效的策略，默认允许
      if (policies.length === 0) {
        return true;
      }

      // 构建策略上下文
      const policyContext = {
        userId,
        permission: permission as PrismaPermission,
        time: context.time,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: context.metadata,
      };

      // 评估所有策略（AND 逻辑，所有策略都通过才允许）
      const summary = await this.policyEngineService.evaluatePolicies(
        policies,
        policyContext
      );

      if (!summary.allowed) {
        this.logger.warn(
          `用户 ${userId} 的权限 ${permission} 被策略拒绝: ${summary.denialReason}`
        );
      }

      return summary.allowed;
    } catch (error) {
      this.logger.error(`策略引擎评估失败: ${error.message}`, error.stack);
      // 出错时默认拒绝（安全原则）
      return false;
    }
  }

  /**
   * 旧的硬编码上下文规则（向后兼容）
   *
   * @deprecated 使用策略引擎替代
   */
  private async checkLegacyContextRules(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext
  ): Promise<boolean> {
    // 示例规则 1：工作时间限制（9:00 - 18:00）
    // 仅对敏感操作（如 DELETE）进行时间限制
    const sensitivePermissions: SystemPermission[] = [
      SystemPermission.SYSTEM_USER_DELETE,
      SystemPermission.SYSTEM_ROLE_DELETE,
      SystemPermission.SYSTEM_FONT_DELETE,
    ];

    if (sensitivePermissions.includes(permission) && context.time) {
      const hour = context.time.getHours();
      if (hour < 9 || hour >= 18) {
        this.logger.warn(
          `用户 ${userId} 在非工作时间尝试执行敏感操作 ${permission}`
        );
        return false;
      }
    }

    // 示例规则 2：IP 地址白名单检查
    // 如果配置了 IP 白名单，检查用户 IP 是否在白名单中
    if (context.ipAddress) {
      const isAllowedIp = await this.checkIpAddressWhitelist(
        userId,
        context.ipAddress
      );
      if (!isAllowedIp) {
        this.logger.warn(
          `用户 ${userId} 的 IP 地址 ${context.ipAddress} 不在白名单中`
        );
        return false;
      }
    }

    // 示例规则 3：设备类型限制
    // 如果配置了设备类型限制，检查用户设备类型
    if (context.userAgent) {
      const isAllowedDevice = await this.checkDeviceRestriction(
        userId,
        context.userAgent
      );
      if (!isAllowedDevice) {
        this.logger.warn(
          `用户 ${userId} 的设备类型不在允许列表中: ${context.userAgent}`
        );
        return false;
      }
    }

    // 所有规则都通过
    return true;
  }

  /**
   * 检查 IP 地址白名单
   */
  private async checkIpAddressWhitelist(
    userId: string,
    ipAddress: string
  ): Promise<boolean> {
    try {
      // 从数据库获取用户的 IP 白名单
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }, // 暂时没有 IP 白名单字段，后续可以添加
      });

      // 如果用户配置了 IP 白名单，进行验证
      // 目前默认允许所有 IP
      return true;
    } catch (error) {
      this.logger.error(`检查 IP 白名单失败: ${error.message}`);
      // 出错时默认拒绝
      return false;
    }
  }

  /**
   * 检查设备限制
   */
  private async checkDeviceRestriction(
    userId: string,
    userAgent: string
  ): Promise<boolean> {
    try {
      // 从数据库获取用户的设备限制配置
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }, // 暂时没有设备限制字段，后续可以添加
      });

      // 如果用户配置了设备限制，进行验证
      // 目前默认允许所有设备
      return true;
    } catch (error) {
      this.logger.error(`检查设备限制失败: ${error.message}`);
      // 出错时默认拒绝
      return false;
    }
  }

  /**
   * 清除用户权限缓存
   */
  async clearUserCache(userId: string): Promise<void> {
    if (this.permissionStore) {
      await this.permissionStore.clearUserCache(userId);
      return;
    }
    await this.cacheService.clearUserCache(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });

    if (user?.role) {
      await this.roleInheritanceService.clearRoleCache(
        user.role.name as SystemRole
      );
    }
  }

  /**
   * 批量检查系统权限
   *
   * @param userId 用户ID
   * @param permissions 需要检查的权限列表
   * @returns 权限检查结果映射（权限 -> 是否有权限）
   */
  async checkSystemPermissionsBatch(
    userId: string,
    permissions: SystemPermission[]
  ): Promise<Map<SystemPermission, boolean>> {
    const results = new Map<SystemPermission, boolean>();

    if (this.permissionStore) {
      const userPermissions = await this.permissionStore.getUserSystemPermissions(userId);
      for (const permission of permissions) {
        results.set(permission, userPermissions.includes(permission));
      }
      return results;
    }

    const uncachedPermissions: SystemPermission[] = [];

    // 先从缓存中获取
    for (const permission of permissions) {
      const cacheKey = `system_perm:${userId}:${permission}`;
      const cached = await this.cacheService.get<boolean>(cacheKey);

      if (cached !== null) {
        results.set(permission, cached);
      } else {
        uncachedPermissions.push(permission);
      }
    }

    // 批量查询未缓存的权限
    if (uncachedPermissions.length > 0) {
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
          // 用户不存在或没有角色，所有权限返回 false
          for (const permission of uncachedPermissions) {
            results.set(permission, false);
          }
          return results;
        }

        // 获取用户的所有权限（包括继承）
        const userPermissions =
          await this.roleInheritanceService.getRolePermissions(
            user.role.name as SystemRole
          );

        for (const permission of uncachedPermissions) {
          const hasPermission = userPermissions.includes(permission);
          results.set(permission, hasPermission);

          // 缓存结果
          const cacheKey = `system_perm:${userId}:${permission}`;
          this.cacheService.set(
            cacheKey,
            hasPermission,
            CACHE_TTL.SYSTEM_PERMISSION
          ); // 5 分钟
        }
      } catch (error) {
        this.logger.error(
          `批量检查系统权限失败: ${error.message}`,
          error.stack
        );
        // 出错时所有未缓存的权限返回 false
        for (const permission of uncachedPermissions) {
          results.set(permission, false);
        }
      }
    }

    return results;
  }
}
