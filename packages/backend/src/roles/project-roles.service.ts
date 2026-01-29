import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ProjectPermission as PrismaProjectPermission } from '@prisma/client';
import {
  ProjectRole,
  ProjectPermission,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '../common/enums/permissions.enum';

export interface CreateProjectRoleDto {
  projectId: string;
  name: string;
  description?: string;
  permissions: ProjectPermission[];
}

export interface UpdateProjectRoleDto {
  name?: string;
  description?: string;
  permissions?: ProjectPermission[];
}

/**
 * 项目角色服务
 * 管理项目角色和权限分配
 */
@Injectable()
export class ProjectRolesService {
  private readonly logger = new Logger(ProjectRolesService.name);

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 为项目创建默认角色
   * 当项目创建时调用，初始化默认的项目角色
   */
  async createDefaultRoles(projectId: string): Promise<void> {
    try {
      const defaultRoles = [
        { name: ProjectRole.OWNER, isSystem: true },
        { name: ProjectRole.ADMIN, isSystem: true },
        { name: ProjectRole.EDITOR, isSystem: true },
        { name: ProjectRole.MEMBER, isSystem: true },
        { name: ProjectRole.VIEWER, isSystem: true },
      ];

      for (const role of defaultRoles) {
        await this.create({
          projectId,
          name: role.name,
          description: `默认角色: ${role.name}`,
          permissions:
            DEFAULT_PROJECT_ROLE_PERMISSIONS[role.name as ProjectRole] || [],
        });
      }

      this.logger.log(`项目 ${projectId} 的默认角色创建成功`);
    } catch (error) {
      this.logger.error(`创建项目默认角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(`创建项目默认角色失败: ${error.message}`);
    }
  }

  /**
   * 创建项目角色
   */
  async create(dto: CreateProjectRoleDto): Promise<any> {
    try {
      // 检查角色名称是否已存在
      const existingRole = await this.prisma.projectRole.findFirst({
        where: {
          projectId: dto.projectId,
          name: dto.name,
        },
      });

      if (existingRole) {
        throw new ConflictException(`角色名称 "${dto.name}" 已存在`);
      }

      // 创建角色
      const role = await this.prisma.projectRole.create({
        data: {
          projectId: dto.projectId,
          name: dto.name,
          description: dto.description,
        },
      });

      // 分配权限
      if (dto.permissions && dto.permissions.length > 0) {
        await this.assignPermissions(role.id, dto.permissions);
      }

      return role;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`创建项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(`创建项目角色失败: ${error.message}`);
    }
  }

  /**
   * 更新项目角色
   */
  async update(roleId: string, dto: UpdateProjectRoleDto): Promise<any> {
    try {
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException('项目角色不存在');
      }

      // 系统默认角色不能修改名称
      if (role.isSystem && dto.name && dto.name !== role.name) {
        throw new BadRequestException('无法修改系统默认角色的名称');
      }

      // 更新角色信息
      const updatedRole = await this.prisma.projectRole.update({
        where: { id: roleId },
        data: {
          name: dto.name,
          description: dto.description,
        },
      });

      // 更新权限
      if (dto.permissions !== undefined) {
        await this.updatePermissions(roleId, dto.permissions);
      }

      return updatedRole;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`更新项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException('更新项目角色失败');
    }
  }

  /**
   * 删除项目角色
   */
  async delete(roleId: string): Promise<void> {
    try {
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
        include: {
          members: true,
        },
      });

      if (!role) {
        throw new NotFoundException('项目角色不存在');
      }

      // 系统默认角色不能删除
      if (role.isSystem) {
        throw new BadRequestException('无法删除系统默认角色');
      }

      // 检查是否有成员使用此角色
      if (role.members.length > 0) {
        throw new BadRequestException('角色正在使用中，无法删除');
      }

      // 删除角色（级联删除权限关联）
      await this.prisma.projectRole.delete({
        where: { id: roleId },
      });

      this.logger.log(`项目角色 ${roleId} 删除成功`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`删除项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException('删除项目角色失败');
    }
  }

  /**
   * 获取项目的所有角色
   */
  async findByProject(projectId: string): Promise<any[]> {
    try {
      const roles = await this.prisma.projectRole.findMany({
        where: { projectId },
        include: {
          permissions: true,
          _count: {
            select: { members: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return roles;
    } catch (error) {
      this.logger.error(`获取项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException('获取项目角色失败');
    }
  }

  /**
   * 获取项目角色详情
   */
  async findOne(roleId: string): Promise<any> {
    try {
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
        include: {
          permissions: true,
          _count: {
            select: { members: true },
          },
        },
      });

      if (!role) {
        throw new NotFoundException('项目角色不存在');
      }

      return role;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`获取项目角色详情失败: ${error.message}`, error.stack);
      throw new BadRequestException('获取项目角色详情失败');
    }
  }

  /**
   * 获取角色的所有权限
   */
  async getRolePermissions(roleId: string): Promise<ProjectPermission[]> {
    try {
      const rolePermissions = await this.prisma.projectRolePermission.findMany({
        where: { projectRoleId: roleId },
        select: { permission: true },
      });

      // 将 Prisma ProjectPermission 转换为 TypeScript ProjectPermission
      // 两者使用相同的字符串值，所以可以直接使用 as 进行类型断言
      return rolePermissions.map((rp) => rp.permission as unknown as ProjectPermission);
    } catch (error) {
      this.logger.error(`获取角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException('获取角色权限失败');
    }
  }

  /**
   * 为角色分配权限
   */
  async assignPermissions(
    roleId: string,
    permissions: ProjectPermission[]
  ): Promise<void> {
    try {
      // 创建权限关联（直接使用枚举值）
      const data = permissions.map((permission) => ({
        projectRoleId: roleId,
        permission: permission as PrismaProjectPermission,
      }));

      await this.prisma.projectRolePermission.createMany({
        data,
        skipDuplicates: true,
      });

      this.logger.log(`角色 ${roleId} 的权限分配成功`);
    } catch (error) {
      this.logger.error(`分配角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException(`分配角色权限失败: ${error.message}`);
    }
  }

  /**
   * 移除角色权限
   */
  async removePermissions(
    roleId: string,
    permissions: ProjectPermission[]
  ): Promise<void> {
    try {
      await this.prisma.projectRolePermission.deleteMany({
        where: {
          projectRoleId: roleId,
          permission: {
            in: permissions as PrismaProjectPermission[],
          },
        },
      });

      this.logger.log(`角色 ${roleId} 的权限移除成功`);
    } catch (error) {
      this.logger.error(`移除角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException('移除角色权限失败');
    }
  }

  /**
   * 更新角色权限（替换所有权限）
   */
  async updatePermissions(
    roleId: string,
    permissions: ProjectPermission[]
  ): Promise<void> {
    try {
      // 先删除所有现有权限
      await this.prisma.projectRolePermission.deleteMany({
        where: { projectRoleId: roleId },
      });

      // 然后重新分配权限
      await this.assignPermissions(roleId, permissions);
    } catch (error) {
      this.logger.error(`更新角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException('更新角色权限失败');
    }
  }
}
