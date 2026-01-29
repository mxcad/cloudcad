import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { SystemPermission, SystemRole } from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';
import { PermissionContext } from '../utils/permission.util';
import { AuditAction, ResourceType } from '@prisma/client';

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
    @Inject(forwardRef(() => AuditLogService))
    private readonly auditLogService: AuditLogService
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
      // 1. 检查缓存
      const cacheKey = `system_perm:${userId}:${permission}`;
      const cached = this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        decisionReason = '缓存命中';
        hasPermission = cached;
      } else {
        // 2. 检查系统管理员权限
        const isAdmin = await this.isSystemAdmin(userId);
        if (isAdmin) {
          decisionReason = '系统管理员权限';
          hasPermission = true;
          this.cacheService.set(cacheKey, true, 600000); // 10 分钟
        } else {
          // 3. 检查用户的系统权限
          decisionReason = '系统权限检查';
          hasPermission = await this.checkUserSystemPermission(
            userId,
            permission
          );
          this.cacheService.set(cacheKey, hasPermission, 300000); // 5 分钟
        }
      }

      // 记录权限决策日志
      const duration = Date.now() - startTime;
      await this.logPermissionDecision(
        userId,
        permission,
        hasPermission,
        decisionReason,
        duration
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(`系统权限检查失败: ${error.message}`, error.stack);

      // 记录错误日志
      const duration = Date.now() - startTime;
      await this.logPermissionDecision(
        userId,
        permission,
        false,
        `权限检查异常: ${error.message}`,
        duration
      );

      return false;
    }
  }

  /**
   * 记录权限决策日志
   */
  private async logPermissionDecision(
    userId: string,
    permission: SystemPermission,
    granted: boolean,
    reason: string,
    duration: number
  ): Promise<void> {
    try {
      const details = JSON.stringify({
        permission,
        reason,
        duration,
        timestamp: new Date().toISOString(),
      });

      await this.auditLogService.log(
        granted ? AuditAction.PERMISSION_CHECK : AuditAction.PERMISSION_DENIED,
        ResourceType.SYSTEM,
        undefined, // resourceId
        userId,
        granted,
        undefined, // errorMessage
        details
      );
    } catch (error) {
      this.logger.error(`记录权限决策日志失败: ${error.message}`, error.stack);
      // 不抛出异常，避免影响主业务流程
    }
  }

  /**
   * 检查用户是否为系统管理员
   */
  private async isSystemAdmin(userId: string): Promise<boolean> {
    const cacheKey = `is_admin:${userId}`;
    const cached = this.cacheService.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached;
    }

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

    const isAdmin = user?.role?.name === SystemRole.ADMIN;
    this.cacheService.set(cacheKey, isAdmin, 600000); // 10 分钟
    return isAdmin;
  }

  /**
   * 检查用户的系统权限
   */
  private async checkUserSystemPermission(
    userId: string,
    permission: SystemPermission
  ): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (!user?.role) {
        return false;
      }

      const userPermissions = user.role.permissions.map(
        (p) => p.permission as SystemPermission
      );
      return userPermissions.includes(permission as SystemPermission);
    } catch (error) {
      this.logger.error(`检查用户系统权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取用户的系统权限
   */
  async getUserPermissions(
    user: UserWithPermissions
  ): Promise<SystemPermission[]> {
    try {
      return (
        user.role?.permissions?.map((p) => p.permission as SystemPermission) ||
        []
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
        // 记录上下文拒绝日志
        await this.logPermissionDecision(
          userId,
          permission,
          false,
          '上下文规则拒绝',
          Date.now() - startTime
        );
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
   * @returns 是否通过上下文规则检查
   */
  private async checkContextRules(
    userId: string,
    permission: SystemPermission,
    context: PermissionContext
  ): Promise<boolean> {
    // 示例规则 1：工作时间限制（9:00 - 18:00）
    // 仅对敏感操作（如 DELETE）进行时间限制
    const sensitivePermissions: SystemPermission[] = [
      SystemPermission.USER_DELETE,
      SystemPermission.ROLE_DELETE,
      SystemPermission.FONT_DELETE,
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
    await this.cacheService.clearUserCache(userId);
  }
}
