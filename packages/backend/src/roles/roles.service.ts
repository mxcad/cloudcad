import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleDto } from './dto/role.dto';
import { Permission } from '../common/enums/permissions.enum';
import { Permission as PrismaPermission } from '@prisma/client';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: DatabaseService) {}

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
      orderBy: {
        createdAt: 'asc',
      },
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
        permissions: {
          create: createRoleDto.permissions.map((permission) => ({
            permission: permission as unknown as PrismaPermission,
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

    // 系统角色不允许修改名称和描述
    if (role.isSystem && (updateRoleDto.name || updateRoleDto.description)) {
      throw new BadRequestException('系统角色不允许修改名称和描述');
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
        ...(updateRoleDto.permissions && {
          permissions: {
            deleteMany: {}, // 删除所有旧权限
            create: updateRoleDto.permissions.map((permission) => ({
              permission: permission as unknown as PrismaPermission,
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
    if (role._count.users > 0) {
      throw new BadRequestException(
        `该角色正在被 ${role._count.users} 个用户使用，无法删除。请先将这些用户分配到其他角色。`
      );
    }

    // 删除角色（级联删除角色权限）
    await this.prisma.role.delete({
      where: { id },
    });
  }

  /**
   * 验证权限是否有效
   */
  private validatePermissions(permissions: Permission[]): void {
    const validPermissions = Object.values(PrismaPermission);
    const invalidPermissions = permissions.filter(
      (perm) => !validPermissions.includes(perm as unknown as PrismaPermission)
    );

    if (invalidPermissions.length > 0) {
      throw new BadRequestException(
        `无效的权限: ${invalidPermissions.join(', ')}`
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
      isSystem: role.isSystem,
      permissions: role.permissions.map((p: any) => p.permission as Permission),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}
