import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditLogService } from '../../audit/audit-log.service';
import {
  NODE_ACCESS_PERMISSIONS,
  NodeAccessRole,
  Permission,
  UserRole,
} from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';
import { PermissionContext } from '../utils/permission.util';
import { AuditAction, ResourceType } from '@prisma/client';

export interface Role {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isSystem: boolean;
  permissions?: { permission: Permission }[];
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
 * 统一权限检查服务
 *
 * 功能：
 * 1. 检查用户是否具有指定权限
 * 2. 支持系统权限和节点权限
 * 3. 使用缓存优化性能
 * 4. 支持权限继承
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
   * 统一权限检查入口
   *
   * @param userId 用户 ID
   * @param nodeId 节点 ID（可选，用于节点权限检查）
   * @param permission 权限
   * @returns 是否具有权限
   */
  async checkPermission(
    userId: string,
    nodeId: string | undefined,
    permission: Permission
  ): Promise<boolean> {
    const startTime = Date.now();
    let decisionReason = '';
    let hasPermission = false;

    try {
      // 1. 检查缓存
      const cacheKey = `perm:${userId}:${nodeId || 'system'}:${permission}`;
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
        } else if (!nodeId) {
          // 3. 如果没有节点 ID，只检查系统权限
          decisionReason = '系统权限检查';
          hasPermission = await this.checkSystemPermission(userId, permission);
          this.cacheService.set(cacheKey, hasPermission, 300000); // 5 分钟
        } else {
          // 4. 检查节点权限
          const role = await this.getNodeAccessRole(userId, nodeId);
          decisionReason = `节点权限检查 (角色: ${role || '无'})`;
          hasPermission = await this.checkNodePermission(
            userId,
            nodeId,
            permission
          );
          this.cacheService.set(cacheKey, hasPermission, 300000); // 5 分钟
        }
      }

      // 记录权限决策日志
      const duration = Date.now() - startTime;
      await this.logPermissionDecision(
        userId,
        nodeId,
        permission,
        hasPermission,
        decisionReason,
        duration
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(`权限检查失败: ${error.message}`, error.stack);

      // 记录错误日志
      const duration = Date.now() - startTime;
      await this.logPermissionDecision(
        userId,
        nodeId,
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
    nodeId: string | undefined,
    permission: Permission,
    granted: boolean,
    reason: string,
    duration: number
  ): Promise<void> {
    try {
      const details = JSON.stringify({
        permission,
        nodeId,
        reason,
        duration,
        timestamp: new Date().toISOString(),
      });

      await this.auditLogService.log(
        granted ? AuditAction.PERMISSION_CHECK : AuditAction.PERMISSION_DENIED,
        nodeId ? ResourceType.FILE : ResourceType.SYSTEM,
        nodeId,
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

    const isAdmin = user?.role?.name === UserRole.ADMIN;
    this.cacheService.set(cacheKey, isAdmin, 600000); // 10 分钟
    return isAdmin;
  }

  /**
   * 检查系统权限
   */
  private async checkSystemPermission(
    userId: string,
    permission: Permission
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
        (p) => p.permission as Permission
      );
      return userPermissions.includes(permission as Permission);
    } catch (error) {
      this.logger.error(`检查系统权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查节点权限
   */
  private async checkNodePermission(
    userId: string,
    nodeId: string,
    permission: Permission
  ): Promise<boolean> {
    try {
      const role = await this.getNodeAccessRole(userId, nodeId);
      if (!role) {
        return false;
      }

      const permissions = NODE_ACCESS_PERMISSIONS[role] || [];
      return permissions.includes(permission as Permission);
    } catch (error) {
      this.logger.error(`检查节点权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取用户在节点上的访问角色
   */
  async getNodeAccessRole(
    userId: string,
    nodeId: string
  ): Promise<NodeAccessRole | null> {
    try {
      // 先检查缓存
      const cachedRole = this.cacheService.getNodeAccessRole(userId, nodeId);
      if (cachedRole) {
        return cachedRole;
      }

      // 查询节点信息
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { ownerId: true, deletedAt: true, isRoot: true },
      });

      if (!node || node.deletedAt) {
        return null;
      }

      // 如果是所有者，直接返回 OWNER
      if (node.ownerId === userId) {
        this.cacheService.cacheNodeAccessRole(
          userId,
          nodeId,
          NodeAccessRole.OWNER
        );
        return NodeAccessRole.OWNER;
      }

      // 优先检查 ProjectMember 表（新系统）
      const projectMember = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: node.isRoot
              ? nodeId
              : await this.getProjectRootId(nodeId),
            userId,
          },
        },
        include: {
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      if (projectMember) {
        const nodeAccessRole = this.mapRoleNameToNodeAccessRole(
          projectMember.role.name
        );
        if (nodeAccessRole) {
          this.cacheService.cacheNodeAccessRole(userId, nodeId, nodeAccessRole);
          return nodeAccessRole;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`获取节点访问角色失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 获取项目的根节点 ID
   */
  private async getProjectRootId(nodeId: string): Promise<string> {
    const rootNode = await this.findRootNode(nodeId);
    return rootNode?.id || nodeId;
  }

  /**
   * 查找项目根节点
   */
  private async findRootNode(nodeId: string) {
    let currentNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { id: true, isRoot: true, parentId: true },
    });

    if (!currentNode) return null;
    if (currentNode.isRoot) return currentNode;

    while (currentNode && !currentNode.isRoot && currentNode.parentId) {
      currentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: currentNode.parentId },
        select: { id: true, isRoot: true, parentId: true },
      });
    }

    return currentNode?.isRoot ? currentNode : null;
  }

  /**
   * 将系统角色名称映射到 NodeAccessRole
   */
  private mapRoleNameToNodeAccessRole(roleName: string): NodeAccessRole | null {
    const roleMap: Record<string, NodeAccessRole> = {
      PROJECT_OWNER: NodeAccessRole.OWNER,
      PROJECT_ADMIN: NodeAccessRole.ADMIN,
      PROJECT_MEMBER: NodeAccessRole.MEMBER,
      PROJECT_EDITOR: NodeAccessRole.EDITOR,
      PROJECT_VIEWER: NodeAccessRole.VIEWER,
    };

    return roleMap[roleName] || null;
  }

  /**
   * 检查用户是否具有指定角色之一
   */
  async hasNodeAccessRole(
    user: UserWithPermissions,
    nodeId: string,
    roles: NodeAccessRole[]
  ): Promise<boolean> {
    // 系统管理员拥有所有权限
    if (user.role?.name === UserRole.ADMIN) {
      return true;
    }

    const role = await this.getNodeAccessRole(user.id, nodeId);
    return role ? roles.includes(role) : false;
  }

  /**
   * 获取用户在节点上的所有权限
   */
  async getNodePermissions(
    userId: string,
    nodeId: string
  ): Promise<Permission[]> {
    const role = await this.getNodeAccessRole(userId, nodeId);
    if (!role) {
      return [];
    }
    return NODE_ACCESS_PERMISSIONS[role] || [];
  }

  /**
   * 检查用户是否具有指定用户角色
   */
  hasRole(user: UserWithPermissions, roleNames: string[]): boolean {
    return roleNames.includes(user.role?.name || '');
  }

  /**
   * 获取用户的系统权限
   */
  async getUserPermissions(user: UserWithPermissions): Promise<Permission[]> {
    try {
      return user.role?.permissions?.map((p) => p.permission) || [];
    } catch (error) {
      this.logger.error(`获取用户权限失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 支持上下文的权限检查
   *
   * 在基础权限检查的基础上，增加上下文感知的额外验证
   *
   * @param userId 用户 ID
   * @param nodeId 节点 ID（可选）
   * @param permission 权限
   * @param context 上下文信息
   * @returns 是否具有权限
   */
  async checkPermissionWithContext(
    userId: string,
    nodeId: string | undefined,
    permission: Permission,
    context: PermissionContext
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      // 1. 先进行基础权限检查
      const hasBasicPermission = await this.checkPermission(
        userId,
        nodeId,
        permission
      );

      if (!hasBasicPermission) {
        return false;
      }

      // 2. 检查上下文规则
      const contextGranted = await this.checkContextRules(
        userId,
        nodeId,
        permission,
        context
      );

      if (!contextGranted) {
        // 记录上下文拒绝日志
        await this.logPermissionDecision(
          userId,
          nodeId,
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
    nodeId: string | undefined,
    permission: Permission,
    context: PermissionContext
  ): Promise<boolean> {
    // 示例规则 1：工作时间限制（9:00 - 18:00）
    // 仅对敏感操作（如 DELETE）进行时间限制
    const sensitivePermissions = [
      Permission.FILE_DELETE,
      Permission.PROJECT_DELETE,
      Permission.USER_DELETE,
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

  /**
   * 清除节点权限缓存
   */
  async clearNodeCache(nodeId: string): Promise<void> {
    await this.cacheService.clearNodeCache(nodeId);
  }
}
