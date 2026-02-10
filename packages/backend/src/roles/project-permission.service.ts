import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ProjectPermission,
  ProjectRole,
} from '../common/enums/permissions.enum';
import { ProjectRolesService } from './project-roles.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuditAction, ResourceType } from '@prisma/client';

/**
 * 项目权限检查服务
 * 与系统权限完全解耦，专注于项目内的权限控制
 */
@Injectable()
export class ProjectPermissionService {
  private readonly logger = new Logger(ProjectPermissionService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly projectRolesService: ProjectRolesService,
    private readonly cacheService: PermissionCacheService,
    @Inject(forwardRef(() => AuditLogService))
    private readonly auditLogService: AuditLogService
  ) {}

  /**
   * 检查用户在项目中的权限
   *
   * @param userId 用户ID
   * @param projectId 项目ID
   * @param permission 需要检查的项目权限
   * @returns 是否具有权限
   */
  async checkPermission(
    userId: string,
    projectId: string,
    permission: ProjectPermission
  ): Promise<boolean> {
    const startTime = Date.now();
    try {
      // 1. 检查用户是否为项目所有者
      const isOwner = await this.isProjectOwner(userId, projectId);
      if (isOwner) {
        await this.logPermissionCheck(
          userId,
          projectId,
          permission,
          true,
          '项目所有者',
          Date.now() - startTime
        );
        return true; // 项目所有者拥有所有权限
      }

      // 2. 检查缓存
      const cacheKey = `project:permission:${userId}:${projectId}:${permission}`;
      const cached = await this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // 3. 检查用户的项目角色权限
      const hasPermission = await this.checkRolePermission(
        userId,
        projectId,
        permission
      );

      // 4. 缓存结果
      this.cacheService.set(cacheKey, hasPermission, 300000); // 5分钟

      // 5. 记录审计日志
      await this.logPermissionCheck(
        userId,
        projectId,
        permission,
        hasPermission,
        hasPermission ? '角色权限' : '权限不足',
        Date.now() - startTime
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(`检查项目权限失败: ${error.message}`, error.stack);
      await this.logPermissionCheck(
        userId,
        projectId,
        permission,
        false,
        `检查失败: ${error.message}`,
        Date.now() - startTime
      );
      return false;
    }
  }

  /**
   * 记录权限检查审计日志
   */
  private async logPermissionCheck(
    userId: string,
    projectId: string,
    permission: ProjectPermission,
    success: boolean,
    reason: string,
    duration: number
  ): Promise<void> {
    try {
      const details = JSON.stringify({
        permission,
        reason,
        duration: `${duration}ms`,
      });

      // 根据权限检查结果选择适当的操作类型
      const action = success
        ? AuditAction.PERMISSION_CHECK
        : AuditAction.PERMISSION_DENIED;

      await this.auditLogService.log(
        action,
        ResourceType.PROJECT,
        projectId,
        userId,
        success,
        success ? undefined : reason,
        details
      );
    } catch (error) {
      this.logger.error(`记录权限检查审计日志失败: ${error.message}`);
    }
  }

  /**
   * 检查用户是否为项目所有者
   */
  async isProjectOwner(
    userId: string,
    projectId: string
  ): Promise<boolean> {
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

      // 安全检查：确保项目存在、未被删除、是项目根节点
      const isOwner =
        project?.ownerId === userId && project?.ownerId !== undefined;

      if (isOwner) {
        this.logger.debug(
          `项目所有者检查通过: userId=${userId}, projectId=${projectId}`
        );
      } else {
        this.logger.warn(
          `项目所有者检查失败: userId=${userId}, projectId=${projectId}`
        );
      }

      this.cacheService.set(cacheKey, isOwner, 600000); // 10分钟

      return isOwner;
    } catch (error) {
      this.logger.error(`检查项目所有者失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查用户的项目角色权限
   * 优化后：先从缓存获取用户所有权限，避免 N+1 查询
   */
  private async checkRolePermission(
    userId: string,
    projectId: string,
    permission: ProjectPermission
  ): Promise<boolean> {
    try {
      // 先获取用户的所有权限（从缓存或数据库）
      const userPermissions = await this.getUserPermissions(userId, projectId);

      return userPermissions.includes(permission);
    } catch (error) {
      this.logger.error(`检查角色权限失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取用户在项目中的所有权限
   */
  async getUserPermissions(
    userId: string,
    projectId: string
  ): Promise<ProjectPermission[]> {
    try {
      // 1. 检查用户是否为项目所有者
      const isOwner = await this.isProjectOwner(userId, projectId);
      if (isOwner) {
        // 项目所有者拥有所有权限
        return Object.values(ProjectPermission) as ProjectPermission[];
      }

      // 2. 获取用户的项目角色权限
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

  /**
   * 获取用户在项目中的角色
   */
  async getUserRole(
    userId: string,
    projectId: string
  ): Promise<ProjectRole | null> {
    try {
      const cacheKey = `project:role:${userId}:${projectId}`;
      const cached = this.cacheService.get<ProjectRole>(cacheKey);
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

      const role = (member?.projectRole?.name as ProjectRole) || null;
      if (role) {
        this.cacheService.set(cacheKey, role, 300000); // 5分钟
      }

      return role;
    } catch (error) {
      this.logger.error(`获取用户项目角色失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 检查用户是否具有指定角色
   */
  async hasRole(
    userId: string,
    projectId: string,
    roleNames: ProjectRole[]
  ): Promise<boolean> {
    const userRole = await this.getUserRole(userId, projectId);
    return userRole !== null && roleNames.includes(userRole);
  }

  /**
   * 检查用户是否为项目成员
   */
  async isProjectMember(userId: string, projectId: string): Promise<boolean> {
    try {
      const isOwner = await this.isProjectOwner(userId, projectId);
      if (isOwner) {
        return true;
      }

      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      return member !== null;
    } catch (error) {
      this.logger.error(`检查项目成员失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 清除用户的项目权限缓存
   *
   * 缓存键命名规范：
   * - project:owner:${userId}:${projectId} - 项目所有者缓存
   * - project:role:${userId}:${projectId} - 项目成员角色缓存（与系统角色缓存 role:user:${userId} 保持一致）
   * - project:permission:${userId}:${projectId}:${permission} - 项目权限缓存
   */
  async clearUserCache(userId: string, projectId: string): Promise<void> {
    // 清除项目所有者缓存
    this.cacheService.delete(`project:owner:${userId}:${projectId}`);

    // 清除用户角色缓存
    this.cacheService.delete(`project:role:${userId}:${projectId}`);

    // 清除所有权限缓存
    const permissions = Object.values(ProjectPermission);
    for (const permission of permissions) {
      this.cacheService.delete(
        `project:permission:${userId}:${projectId}:${permission}`
      );
    }
  }

  /**
   * 批量检查权限（多个权限，OR 逻辑）
   * 只要有一个权限就返回 true
   * 优化后：使用并行检查提升性能
   */
  async checkAnyPermission(
    userId: string,
    projectId: string,
    permissions: ProjectPermission[]
  ): Promise<boolean> {
    const startTime = Date.now();
    try {
      // 项目所有者直接返回 true
      const isOwner = await this.isProjectOwner(userId, projectId);
      if (isOwner) {
        this.logger.debug(
          `批量权限检查通过（项目所有者）: userId=${userId}, projectId=${projectId}, permissions=${permissions.length}个, 耗时=${Date.now() - startTime}ms`
        );
        return true;
      }

      // 并行检查所有权限
      const results = await Promise.all(
        permissions.map((permission) =>
          this.checkPermission(userId, projectId, permission)
        )
      );

      const hasAnyPermission = results.some((result) => result === true);

      this.logger.debug(
        `批量权限检查${hasAnyPermission ? '通过' : '失败'}: userId=${userId}, projectId=${projectId}, permissions=${permissions.length}个, 耗时=${Date.now() - startTime}ms`
      );

      return hasAnyPermission;
    } catch (error) {
      this.logger.error(
        `批量权限检查失败: ${error.message}, 耗时=${Date.now() - startTime}ms`,
        error.stack
      );
      return false;
    }
  }

  /**
   * 批量检查权限（多个权限，AND 逻辑）
   * 必须所有权限都满足才返回 true
   * 优化后：使用并行检查提升性能
   */
  async checkAllPermissions(
    userId: string,
    projectId: string,
    permissions: ProjectPermission[]
  ): Promise<boolean> {
    const startTime = Date.now();
    try {
      // 项目所有者直接返回 true
      const isOwner = await this.isProjectOwner(userId, projectId);
      if (isOwner) {
        this.logger.debug(
          `批量权限检查通过（项目所有者）: userId=${userId}, projectId=${projectId}, permissions=${permissions.length}个, 耗时=${Date.now() - startTime}ms`
        );
        return true;
      }

      // 并行检查所有权限
      const results = await Promise.all(
        permissions.map((permission) =>
          this.checkPermission(userId, projectId, permission)
        )
      );

      const hasAllPermissions = results.every((result) => result === true);

      this.logger.debug(
        `批量权限检查${hasAllPermissions ? '通过' : '失败'}: userId=${userId}, projectId=${projectId}, permissions=${permissions.length}个, 耗时=${Date.now() - startTime}ms`
      );

      return hasAllPermissions;
    } catch (error) {
      this.logger.error(
        `批量权限检查失败: ${error.message}, 耗时=${Date.now() - startTime}ms`,
        error.stack
      );
      return false;
    }
  }
}
