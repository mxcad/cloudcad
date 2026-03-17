///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ProjectPermission as PrismaProjectPermission } from '@prisma/client';
import {
  ProjectRole,
  ProjectPermission,
  DEFAULT_PROJECT_ROLE_PERMISSIONS,
} from '../common/enums/permissions.enum';

export interface CreateProjectRoleDto {
  projectId?: string; // 项目 ID（系统角色不需要）
  name: string;
  description?: string;
  permissions: string[]; // 接受 string[]，内部转换为 ProjectPermission[]
}

export interface UpdateProjectRoleDto {
  name?: string;
  description?: string;
  permissions?: string[]; // 接受 string[]，内部转换为 ProjectPermission[]
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
   * 创建系统默认角色（仅在系统初始化时调用一次）
   */
  async createSystemDefaultRoles(): Promise<void> {
    try {
      const defaultRoles = [
        { name: ProjectRole.OWNER, isSystem: true },
        { name: ProjectRole.ADMIN, isSystem: true },
        { name: ProjectRole.EDITOR, isSystem: true },
        { name: ProjectRole.MEMBER, isSystem: true },
        { name: ProjectRole.VIEWER, isSystem: true },
      ];

      for (const role of defaultRoles) {
        try {
          await this.create({
            name: role.name,
            description: `系统默认角色: ${role.name}`,
            permissions:
              DEFAULT_PROJECT_ROLE_PERMISSIONS[role.name as ProjectRole] || [],
          });
        } catch (error) {
          // 如果角色已存在，跳过
          if (error instanceof ConflictException) {
            continue;
          }
          throw error;
        }
      }

      this.logger.log('系统默认项目角色创建成功');
    } catch (error) {
      this.logger.error(`创建系统默认角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(`创建系统默认角色失败: ${error.message}`);
    }
  }

  /**
   * 创建项目角色
   */
  async create(dto: CreateProjectRoleDto, userId?: string): Promise<any> {
    try {
      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

      // 检查角色名称是否已存在（项目内唯一）
      const existingRole = await this.prisma.projectRole.findFirst({
        where: {
          name: dto.name,
          projectId: dto.projectId ?? null,
        },
      });

      if (existingRole) {
        throw new ConflictException(
          dto.projectId
            ? `项目内角色名称 "${dto.name}" 已存在`
            : `全局角色名称 "${dto.name}" 已存在`
        );
      }

      // 创建角色
      const role = await this.prisma.projectRole.create({
        data: {
          projectId: dto.projectId || null,
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
      if (
        error instanceof ConflictException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`创建项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(`创建项目角色失败: ${error.message}`);
    }
  }

  /**
   * 更新项目角色
   */
  async update(
    roleId: string,
    dto: UpdateProjectRoleDto,
    userId?: string
  ): Promise<any> {
    try {
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException('项目角色不存在');
      }

      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

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
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
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
  async delete(roleId: string, userId?: string): Promise<void> {
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

      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

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
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`删除项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException('删除项目角色失败');
    }
  }

  /**
   * 获取所有项目角色
   */
  async findAll(): Promise<any[]> {
    try {
      const roles = await this.prisma.projectRole.findMany({
        include: {
          project: {
            select: { id: true, name: true },
          },
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
      throw new BadRequestException(`获取项目角色失败`);
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
   * 获取特定项目的角色列表
   */
  async findByProject(projectId: string): Promise<any[]> {
    try {
      const roles = await this.prisma.projectRole.findMany({
        where: {
          OR: [
            { projectId: projectId }, // 项目自定义角色
            { isSystem: true }, // 系统角色（全局共享）
          ],
        },
        include: {
          permissions: true,
          _count: {
            select: { members: true },
          },
        },
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      });

      return roles;
    } catch (error) {
      this.logger.error(`获取项目角色列表失败: ${error.message}`, error.stack);
      throw new BadRequestException(`获取项目角色列表失败`);
    }
  }

  /**
   * 获取系统默认项目角色列表（仅返回 isSystem=true 的角色）
   */
  async findSystemRoles(): Promise<any[]> {
    try {
      const roles = await this.prisma.projectRole.findMany({
        where: {
          isSystem: true,
        },
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
      this.logger.error(`获取系统项目角色失败: ${error.message}`, error.stack);
      throw new BadRequestException(`获取系统项目角色失败`);
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
      return rolePermissions.map(
        (rp) => rp.permission as unknown as ProjectPermission
      );
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
    permissions: string[], // 接受 string[]，内部转换
    userId?: string
  ): Promise<void> {
    try {
      // 检查角色是否存在
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException('项目角色不存在');
      }

      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

      // 转换为 ProjectPermission 类型
      const typedPermissions = permissions as ProjectPermission[];

      // 创建权限关联（直接使用枚举值）
      const data = typedPermissions.map((permission) => ({
        projectRoleId: roleId,
        permission: permission as PrismaProjectPermission,
      }));

      await this.prisma.projectRolePermission.createMany({
        data,
        skipDuplicates: true,
      });

      this.logger.log(`角色 ${roleId} 的权限分配成功`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`分配角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException(`分配角色权限失败: ${error.message}`);
    }
  }

  /**
   * 移除角色权限
   */
  async removePermissions(
    roleId: string,
    permissions: string[], // 接受 string[]，内部转换
    userId?: string
  ): Promise<void> {
    try {
      // 检查角色是否存在
      const role = await this.prisma.projectRole.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException('项目角色不存在');
      }

      // 权限检查已在控制器层面通过 @RequirePermissions 装饰器进行

      // 转换为 ProjectPermission 类型
      const typedPermissions = permissions as ProjectPermission[];

      await this.prisma.projectRolePermission.deleteMany({
        where: {
          projectRoleId: roleId,
          permission: {
            in: typedPermissions as PrismaProjectPermission[],
          },
        },
      });

      this.logger.log(`角色 ${roleId} 的权限移除成功`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(`移除角色权限失败: ${error.message}`, error.stack);
      throw new BadRequestException('移除角色权限失败');
    }
  }

  /**
   * 更新角色权限（替换所有权限）
   */
  async updatePermissions(
    roleId: string,
    permissions: string[] // 接受 string[]，内部转换
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
