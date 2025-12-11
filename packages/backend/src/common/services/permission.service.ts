import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import {
  FILE_ACCESS_PERMISSIONS,
  FileAccessRole,
  Permission,
  PROJECT_MEMBER_PERMISSIONS,
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

  /**
   * 检查用户是否具有指定权限
   */
  async hasPermission(
    user: UserWithPermissions,
    permission: Permission,
    resourceId?: { projectId?: string; fileId?: string }
  ): Promise<boolean> {
    const resourceInfo = resourceId ? ` (资源: ${JSON.stringify(resourceId)})` : '';
    this.logger.debug(`检查用户权限: ${user.id} (${user.username}) - ${permission}${resourceInfo}`);
    
    try {
      // 1. 检查用户基础权限
      const userPermissions = ROLE_PERMISSIONS[user.role] || [];
      if (userPermissions.includes(permission)) {
        this.logger.debug(`用户 ${user.id} 通过基础角色权限检查: ${permission}`);
        return true;
      }

      // 2. 检查项目级权限
      if (resourceId?.projectId) {
        const hasProjectPermission = await this.checkProjectPermission(
          user,
          resourceId.projectId,
          permission
        );
        if (hasProjectPermission) {
          this.logger.debug(`用户 ${user.id} 通过项目权限检查: ${permission}`);
          return true;
        }
      }

      // 3. 检查文件级权限
      if (resourceId?.fileId) {
        const hasFilePermission = await this.checkFilePermission(
          user,
          resourceId.fileId,
          permission
        );
        if (hasFilePermission) {
          this.logger.debug(`用户 ${user.id} 通过文件权限检查: ${permission}`);
          return true;
        }
      }

      this.logger.warn(`用户 ${user.id} 权限检查失败: ${permission}${resourceInfo}`);
      return false;
    } catch (error) {
      this.logger.error(`权限检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查用户在项目中的权限
   */
  private async checkProjectPermission(
    user: UserWithPermissions,
    projectId: string,
    permission: Permission
  ): Promise<boolean> {
    try {
      // 先检查缓存
      const cachedPermissions = this.cacheService.getProjectPermissions(
        user.id,
        projectId
      );
      if (cachedPermissions) {
        return cachedPermissions.includes(permission);
      }

      const projectMember = await this.prisma.projectMember.findFirst({
        where: {
          userId: user.id,
          projectId: projectId,
        },
        select: {
          role: true,
        },
      });

      if (!projectMember) {
        return false;
      }

      const memberPermissions =
        PROJECT_MEMBER_PERMISSIONS[projectMember.role] || [];

      // 缓存权限
      this.cacheService.cacheProjectPermissions(
        user.id,
        projectId,
        memberPermissions
      );

      return memberPermissions.includes(permission);
    } catch (error) {
      this.logger.error(`项目权限检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查用户对文件的权限
   */
  private async checkFilePermission(
    user: UserWithPermissions,
    fileId: string,
    permission: Permission
  ): Promise<boolean> {
    try {
      // 先检查缓存
      const cachedPermissions = this.cacheService.getFilePermissions(
        user.id,
        fileId
      );
      if (cachedPermissions) {
        return cachedPermissions.includes(permission);
      }

      const fileAccess = await this.prisma.fileAccess.findFirst({
        where: {
          userId: user.id,
          fileId: fileId,
        },
        select: {
          role: true,
        },
      });

      let permissions: Permission[] = [];

      if (!fileAccess) {
        // 检查是否是文件创建者
        const file = await this.prisma.file.findUnique({
          where: { id: fileId },
          select: { ownerId: true, projectId: true },
        });

        if (!file) {
          return false;
        }

        // 文件创建者拥有所有权限
        if (file.ownerId === user.id) {
          permissions = FILE_ACCESS_PERMISSIONS[FileAccessRole.OWNER];
        } else if (file.projectId) {
          // 如果文件属于项目，检查项目权限
          const hasProjectPermission = await this.checkProjectPermission(
            user,
            file.projectId,
            permission
          );
          if (hasProjectPermission) {
            // 缓存文件权限
            this.cacheService.cacheFilePermissions(user.id, fileId, [
              permission,
            ]);
          }
          return hasProjectPermission;
        }
      } else {
        permissions =
          FILE_ACCESS_PERMISSIONS[fileAccess.role as FileAccessRole] || [];
      }

      // 缓存文件权限
      this.cacheService.cacheFilePermissions(user.id, fileId, permissions);
      return permissions.includes(permission);
    } catch (error) {
      this.logger.error(`文件权限检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查用户角色
   */
  hasRole(user: UserWithPermissions, roles: UserRole[]): boolean {
    return roles.includes(user.role);
  }

  /**
   * 检查用户在项目中的角色
   */
  async hasProjectRole(
    user: UserWithPermissions,
    projectId: string,
    roles: ProjectMemberRole[]
  ): Promise<boolean> {
    try {
      const projectMember = await this.prisma.projectMember.findFirst({
        where: {
          userId: user.id,
          projectId: projectId,
        },
        select: {
          role: true,
        },
      });

      return projectMember
        ? roles.includes(projectMember.role as ProjectMemberRole)
        : false;
    } catch (error) {
      this.logger.error(`项目角色检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 检查用户对文件的角色
   */
  async hasFileRole(
    user: UserWithPermissions,
    fileId: string,
    roles: FileAccessRole[]
  ): Promise<boolean> {
    try {
      const fileAccess = await this.prisma.fileAccess.findFirst({
        where: {
          userId: user.id,
          fileId: fileId,
        },
        select: {
          role: true,
        },
      });

      if (fileAccess) {
        return roles.includes(fileAccess.role as FileAccessRole);
      }

      // 检查是否是文件创建者
      const file = await this.prisma.file.findUnique({
        where: { id: fileId },
        select: { ownerId: true },
      });

      return file
        ? file.ownerId === user.id && roles.includes(FileAccessRole.OWNER)
        : false;
    } catch (error) {
      this.logger.error(`文件角色检查失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * 获取用户在项目中的所有权限
   */
  async getProjectPermissions(
    user: UserWithPermissions,
    projectId: string
  ): Promise<Permission[]> {
    try {
      const projectMember = await this.prisma.projectMember.findFirst({
        where: {
          userId: user.id,
          projectId: projectId,
        },
        select: {
          role: true,
        },
      });

      if (!projectMember) {
        return [];
      }

      return PROJECT_MEMBER_PERMISSIONS[projectMember.role] || [];
    } catch (error) {
      this.logger.error(`获取项目权限失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 获取用户对文件的所有权限
   */
  async getFilePermissions(
    user: UserWithPermissions,
    fileId: string
  ): Promise<Permission[]> {
    try {
      const fileAccess = await this.prisma.fileAccess.findFirst({
        where: {
          userId: user.id,
          fileId: fileId,
        },
        select: {
          role: true,
        },
      });

      if (fileAccess) {
        return FILE_ACCESS_PERMISSIONS[fileAccess.role as FileAccessRole] || [];
      }

      // 检查是否是文件创建者
      const file = await this.prisma.file.findUnique({
        where: { id: fileId },
        select: { ownerId: true, projectId: true },
      });

      if (!file) {
        return [];
      }

      if (file.ownerId === user.id) {
        return FILE_ACCESS_PERMISSIONS[FileAccessRole.OWNER];
      }

      // 如果文件属于项目，返回项目权限
      if (file.projectId) {
        return this.getProjectPermissions(user, file.projectId);
      }

      return [];
    } catch (error) {
      this.logger.error(`获取文件权限失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 获取用户的所有权限
   */
  async getUserPermissions(user: UserWithPermissions): Promise<Permission[]> {
    try {
      // 获取用户基础权限
      const basePermissions = ROLE_PERMISSIONS[user.role] || [];

      // 获取用户参与的所有项目和文件的权限
      // 这里可以根据需要扩展更复杂的权限聚合逻辑

      return basePermissions;
    } catch (error) {
      this.logger.error(`获取用户权限失败: ${error.message}`, error.stack);
      return [];
    }
  }
}
