import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleDto } from './dto/role.dto';
import { Permission, RoleCategory } from '../common/enums/permissions.enum';
import {
  toPrismaPermission,
  fromPrismaPermission,
  isValidPermission,
  getAllPermissions,
} from '../common/utils/permission.util';
import { PermissionCacheService } from '../common/services/permission-cache.service';

/**
 * 角色管理服务
 *
 * 功能：
 * 1. 角色的增删改查
 * 2. 支持自定义角色
 * 3. 权限分配和移除
 * 4. 角色类别和级别管理
 */
@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly cacheService: PermissionCacheService,
  ) {}

  /**
   * 获取所有角色
   */
  async findAll(): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: {
          select: {
            permission: true,
          },
        },
      },
      orderBy: [
        { category: 'asc' },
        { level: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return roles.map((role) => this.mapToRoleDto(role));
  }

  /**
   * 根据类别获取角色
   */
  async findByCategory(category: RoleCategory): Promise<RoleDto[]> {
    const roles = await this.prisma.role.findMany({
      where: { category },
      include: {
        permissions: {
          select: {
            permission: true,
          },
        },
      },
      orderBy: [
        { level: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return roles.map((role) => this.mapToRoleDto(role));
  }

  /**
   * 根据 ID 获取角色
   */
  async findOne(id: string): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          select: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`角色 ID ${id} 不存在`);
    }

    return this.mapToRoleDto(role);
  }

  /**
   * 创建角色
   */
  async create(createRoleDto: CreateRoleDto): Promise<RoleDto> {
    // 检查角色名称是否已存在
    const existingRole = await this.prisma.role.findUnique({
      where: { name: createRoleDto.name },
    });

    if (existingRole) {
      throw new ConflictException(`角色名称 "${createRoleDto.name}" 已存在`);
    }

    // 验证权限是否有效
    this.validatePermissions(createRoleDto.permissions);

    // 创建角色和权限
    const role = await this.prisma.role.create({
      data: {
        name: createRoleDto.name,
        description: createRoleDto.description,
        category: createRoleDto.category || RoleCategory.CUSTOM,
        level: createRoleDto.level || 0,
        isSystem: false, // 新创建的角色都不是系统角色
        permissions: {
          create: createRoleDto.permissions.map((permission) => ({
            permission: toPrismaPermission(permission),
          })),
        },
      },
      include: {
        permissions: {
          select: {
            permission: true,
          },
        },
      },
    });

    this.logger.log(`创建角色成功: ${role.name} (${role.id})`);

    // 清理所有用户的角色缓存（因为新角色可能影响权限检查）
    this.cacheService.cleanup();

    return this.mapToRoleDto(role);
  }

  /**
   * 更新角色
   */
  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<RoleDto> {
    // 检查角色是否存在
    const role = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new NotFoundException(`角色 ID ${id} 不存在`);
    }

    // 系统角色不允许修改名称、描述、类别和级别
    if (role.isSystem) {
      if (updateRoleDto.name || updateRoleDto.description || updateRoleDto.category || updateRoleDto.level !== undefined) {
        throw new BadRequestException('系统角色不允许修改名称、描述、类别和级别');
      }
    }

    // 如果修改名称，检查是否与其他角色冲突
    if (updateRoleDto.name && updateRoleDto.name !== role.name) {
      const existingRole = await this.prisma.role.findUnique({
        where: { name: updateRoleDto.name },
      });

      if (existingRole) {
        throw new ConflictException(`角色名称 "${updateRoleDto.name}" 已存在`);
      }
    }

    // 验证权限是否有效
    if (updateRoleDto.permissions) {
      this.validatePermissions(updateRoleDto.permissions);
    }

    // 更新角色
    const updatedRole = await this.prisma.role.update({
      where: { id },
      data: {
        ...(updateRoleDto.name && { name: updateRoleDto.name }),
        ...(updateRoleDto.description !== undefined && {
          description: updateRoleDto.description,
        }),
        ...(updateRoleDto.category && { category: updateRoleDto.category }),
        ...(updateRoleDto.level !== undefined && { level: updateRoleDto.level }),
        ...(updateRoleDto.permissions && {
          permissions: {
            deleteMany: {}, // 删除所有旧权限
            create: updateRoleDto.permissions.map((permission) => ({
              permission: toPrismaPermission(permission),
            })), // 创建新权限
          },
        }),
      },
      include: {
        permissions: {
          select: {
            permission: true,
          },
        },
      },
    });

    this.logger.log(`更新角色成功: ${updatedRole.name} (${updatedRole.id})`);

    // 如果修改了权限，清理所有用户的角色缓存
    if (updateRoleDto.permissions) {
      this.cacheService.cleanup();
    }

    return this.mapToRoleDto(updatedRole);
  }

  /**
   * 删除角色
   */
  async remove(id: string): Promise<void> {
    // 检查角色是否存在
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            projectMembers: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`角色 ID ${id} 不存在`);
    }

    // 系统角色不允许删除
    if (role.isSystem) {
      throw new BadRequestException('系统角色不允许删除');
    }

    // 检查是否有用户正在使用该角色
    const userCount = role._count.users;
    const memberCount = role._count.projectMembers;

    if (userCount > 0 || memberCount > 0) {
      throw new BadRequestException(
        `该角色正在被 ${userCount} 个用户和 ${memberCount} 个项目成员使用，无法删除。请先将这些用户分配到其他角色。`
      );
    }

    // 删除角色（级联删除角色权限）
    await this.prisma.role.delete({
      where: { id },
    });

    this.logger.log(`删除角色成功: ${role.name} (${role.id})`);

    // 清理所有用户的角色缓存
    this.cacheService.cleanup();
  }

  /**
   * 为角色分配权限
   */
  async addPermissions(roleId: string, permissions: Permission[]): Promise<RoleDto> {
    // 检查角色是否存在
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException(`角色 ID ${roleId} 不存在`);
    }

    // 系统角色不允许修改权限
    if (role.isSystem) {
      throw new BadRequestException('系统角色不允许修改权限');
    }

    // 验证权限是否有效
    this.validatePermissions(permissions);

    // 添加权限
    await this.prisma.role.update({
      where: { id: roleId },
      data: {
        permissions: {
          createMany: {
            data: permissions.map((permission) => ({
              permission: toPrismaPermission(permission),
            })),
            skipDuplicates: true, // 跳过已存在的权限
          },
        },
      },
    });

    this.logger.log(`为角色添加权限成功: ${role.name} (${roleId}), 权限数: ${permissions.length}`);

    // 清理所有用户的角色缓存
    this.cacheService.cleanup();

    return this.findOne(roleId);
  }

  /**
   * 从角色移除权限
   */
  async removePermissions(roleId: string, permissions: Permission[]): Promise<RoleDto> {
    // 检查角色是否存在
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException(`角色 ID ${roleId} 不存在`);
    }

    // 系统角色不允许修改权限
    if (role.isSystem) {
      throw new BadRequestException('系统角色不允许修改权限');
    }

    // 移除权限
    await this.prisma.role.update({
      where: { id: roleId },
      data: {
        permissions: {
          deleteMany: {
            permission: {
              in: permissions.map(toPrismaPermission),
            },
          },
        },
      },
    });

    this.logger.log(`从角色移除权限成功: ${role.name} (${roleId}), 权限数: ${permissions.length}`);

    // 清理所有用户的角色缓存
    this.cacheService.cleanup();

    return this.findOne(roleId);
  }

  /**
   * 获取角色的所有权限
   */
  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          select: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`角色 ID ${roleId} 不存在`);
    }

    return role.permissions.map((p) => String(p.permission) as Permission);
  }

  /**
   * 验证权限是否有效
   */
  private validatePermissions(permissions: Permission[]): void {
    const allPermissions = getAllPermissions();
    const invalidPermissions = permissions.filter(
      (perm) => !isValidPermission(perm),
    );

    if (invalidPermissions.length > 0) {
      throw new BadRequestException(
        `无效的权限: ${invalidPermissions.join(', ')}`,
      );
    }
  }

  /**
   * 将 Prisma Role 对象映射到 RoleDto
   */
  private mapToRoleDto(role: any): RoleDto {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      category: role.category,
      level: role.level,
      isSystem: role.isSystem,
      permissions: role.permissions.map((p: any) => fromPrismaPermission(p.permission)),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
