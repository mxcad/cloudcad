import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Permission,
  ProjectMemberRole,
  ROLE_PERMISSIONS,
  UserRole,
} from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';

export interface UserWithPermissions {
  id: string;
  email: string;
  username: string;
  nickname?: string;
  avatar?: string;
  role: UserRole;
  status: string;
}

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService
  ) {}

  async hasPermission(
    user: UserWithPermissions,
    permission: Permission,
    resourceId?: { projectId?: string; fileId?: string }
  ): Promise<boolean> {
    const resourceInfo = resourceId
      ? ` (资源: ${JSON.stringify(resourceId)})`
      : '';
    this.logger.debug(
      `检查用户权限: ${user.id} (${user.username}) - ${permission}${resourceInfo}`
    );

    try {
      const userPermissions = ROLE_PERMISSIONS[user.role] || [];
      if (userPermissions.includes(permission)) {
        this.logger.debug(
          `用户 ${user.id} 通过基础角色权限检查: ${permission}`
        );
        return true;
      }

      this.logger.warn(
        '项目和文件权限检查已迁移到 FileSystemPermissionService'
      );
      return false;
    } catch (error) {
      this.logger.error(`权限检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * @deprecated 已迁移到 FileSystemPermissionService.checkNodePermission
   */
  async checkProjectPermission(
    user: UserWithPermissions,
    projectId: string,
    permission: Permission
  ): Promise<boolean> {
    this.logger.warn(
      'checkProjectPermission 已废弃，请使用 FileSystemPermissionService.checkNodePermission'
    );
    return false;
  }

  /**
   * @deprecated 已迁移到 FileSystemPermissionService.checkNodePermission
   */
  async checkFilePermission(
    user: UserWithPermissions,
    fileId: string,
    permission: Permission
  ): Promise<boolean> {
    this.logger.warn(
      'checkFilePermission 已废弃，请使用 FileSystemPermissionService.checkNodePermission'
    );
    return false;
  }

  hasRole(user: UserWithPermissions, roles: UserRole[]): boolean {
    return roles.includes(user.role);
  }

  /**
   * @deprecated 已迁移到 FileSystemPermissionService
   */
  async hasProjectRole(
    user: UserWithPermissions,
    projectId: string,
    roles: ProjectMemberRole[]
  ): Promise<boolean> {
    this.logger.warn(
      'hasProjectRole 已废弃，请使用 FileSystemPermissionService'
    );
    return false;
  }

  /**
   * @deprecated 已迁移到 FileSystemPermissionService.checkNodePermission
   */
  async getProjectPermissions(
    user: UserWithPermissions,
    projectId: string
  ): Promise<Permission[]> {
    this.logger.warn(
      'getProjectPermissions 已废弃，请使用 FileSystemPermissionService.checkNodePermission'
    );
    return [];
  }

  /**
   * @deprecated 已迁移到 FileSystemPermissionService.checkNodePermission
   */
  async getFilePermissions(
    user: UserWithPermissions,
    fileId: string
  ): Promise<Permission[]> {
    this.logger.warn(
      'getFilePermissions 已废弃，请使用 FileSystemPermissionService.checkNodePermission'
    );
    return [];
  }

  /**
   * @deprecated 已迁移到 FileSystemPermissionService
   */
  async getFileAccessPermissions(
    user: UserWithPermissions,
    fileId: string
  ): Promise<Permission[]> {
    this.logger.warn(
      'getFileAccessPermissions 已废弃，请使用 FileSystemPermissionService'
    );
    return [];
  }

  async getUserPermissions(user: UserWithPermissions): Promise<Permission[]> {
    try {
      const basePermissions = ROLE_PERMISSIONS[user.role] || [];
      return basePermissions;
    } catch (error) {
      this.logger.error(`获取用户权限失败: ${error.message}`, error.stack);
      return [];
    }
  }
}
