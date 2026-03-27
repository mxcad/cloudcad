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

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { DatabaseService } from '../database/database.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma, ProjectStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly saltRounds = 12;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly runtimeConfigService: RuntimeConfigService,
  ) {}

  /**
   * 创建用户（包含私人空间创建）
   */
  async create(createUserDto: CreateUserDto) {
    try {
      // 获取运行时配置
      const mailEnabled = await this.runtimeConfigService.getValue<boolean>('mailEnabled', false);

      // 检查邮箱是否必填
      if (mailEnabled && !createUserDto.email) {
        throw new BadRequestException('邮件服务已启用，邮箱为必填项');
      }

      // 如果提供了邮箱，检查是否已存在
      if (createUserDto.email) {
        const existingEmail = await this.prisma.user.findUnique({
          where: { email: createUserDto.email },
        });

        if (existingEmail) {
          throw new ConflictException('邮箱已存在');
        }
      }

      // 检查用户名是否已存在
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: createUserDto.username },
      });

      if (existingUsername) {
        throw new ConflictException('用户名已存在');
      }

      // 获取默认角色（USER 角色）
      const defaultRole = await this.prisma.role.findFirst({
        where: { name: 'USER' },
      });

      if (!defaultRole) {
        throw new NotFoundException('默认角色不存在，请联系管理员');
      }

      // 加密密码
      const hashedPassword = await bcrypt.hash(
        createUserDto.password,
        this.saltRounds
      );

      // 使用事务创建用户和私人空间
      const user = await this.prisma.$transaction(async (tx) => {
        // 创建用户
        const newUser = await tx.user.create({
          data: {
            email: createUserDto.email || null,
            username: createUserDto.username,
            password: hashedPassword,
            nickname: createUserDto.nickname,
            avatar: createUserDto.avatar,
            roleId: createUserDto.roleId || defaultRole.id,
            status: 'ACTIVE',
            emailVerified: createUserDto.email ? true : false,
            emailVerifiedAt: createUserDto.email ? new Date() : null,
          },
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            role: {
              select: {
                id: true,
                name: true,
              },
            },
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        // 获取 PROJECT_OWNER 角色
        const ownerRole = await tx.projectRole.findFirst({
          where: { name: 'PROJECT_OWNER', isSystem: true },
        });

        if (!ownerRole) {
          throw new NotFoundException('PROJECT_OWNER 角色不存在');
        }

        // 创建私人空间
        await tx.fileSystemNode.create({
          data: {
            name: '我的图纸',
            isFolder: true,
            isRoot: true,
            personalSpaceKey: newUser.id,
            projectStatus: ProjectStatus.ACTIVE,
            ownerId: newUser.id,
            projectMembers: {
              create: {
                userId: newUser.id,
                projectRoleId: ownerRole.id,
              },
            },
          },
        });

        return newUser;
      });

      this.logger.log(`用户创建成功: ${user.username}${user.email ? ` (${user.email})` : ''}`);
      return user;
    } catch (error) {
      this.logger.error(`用户创建失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 查询用户列表
   */
  async findAll(query: QueryUsersDto) {
    try {
      const { search, roleId, page = 1, limit = 10, sortBy, sortOrder } = query;
      const skip = (page - 1) * limit;

      const where: Prisma.UserWhereInput = {};

      // 搜索条件
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { nickname: { contains: search, mode: 'insensitive' } },
        ];
      }

      // 角色筛选
      if (roleId) {
        where.roleId = roleId;
      }

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isSystem: true,
                permissions: {
                  select: {
                    permission: true,
                  },
                },
              },
            },
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.user.count({ where }),
      ]);

      return {
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / (limit || 10)),
      };
    } catch (error) {
      this.logger.error(`查询用户列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 根据ID查询用户
   */
  async findOne(id: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
              permissions: {
                select: {
                  permission: true,
                },
              },
            },
          },
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      return user;
    } catch (error) {
      this.logger.error(`查询用户失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 根据邮箱查询用户
   */
  async findByEmail(email: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
              permissions: {
                select: {
                  permission: true,
                },
              },
            },
          },
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      return user;
    } catch (error) {
      this.logger.error(`根据邮箱查询用户失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 根据邮箱查询用户（包含密码，用于登录验证）
   */
  async findByEmailWithPassword(email: string) {
    try {
      return await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
              permissions: {
                select: {
                  permission: true,
                },
              },
            },
          },
          status: true,
          password: true, // 登录时需要密码
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      this.logger.error(`根据邮箱查询用户失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新用户
   */
  async update(id: string, updateUserDto: UpdateUserDto) {
    try {
      // 检查用户是否存在
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        throw new NotFoundException('用户不存在');
      }

      // 检查邮箱唯一性
      if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
        const emailExists = await this.prisma.user.findUnique({
          where: { email: updateUserDto.email },
        });

        if (emailExists) {
          throw new ConflictException('邮箱已存在');
        }
      }

      // 检查用户名唯一性
      if (
        updateUserDto.username &&
        updateUserDto.username !== existingUser.username
      ) {
        const usernameExists = await this.prisma.user.findUnique({
          where: { username: updateUserDto.username },
        });

        if (usernameExists) {
          throw new ConflictException('用户名已存在');
        }
      }

      // 如果更新密码，需要加密
      const updateData: Prisma.UserUpdateInput = {};
      if (updateUserDto.email) updateData.email = updateUserDto.email;
      if (updateUserDto.username) updateData.username = updateUserDto.username;
      if (updateUserDto.nickname !== undefined)
        updateData.nickname = updateUserDto.nickname;
      if (updateUserDto.avatar !== undefined)
        updateData.avatar = updateUserDto.avatar;
      if (updateUserDto.roleId) {
        updateData.role = { connect: { id: updateUserDto.roleId } };
      }
      if (updateUserDto.status) updateData.status = updateUserDto.status;
      if (updateUserDto.password) {
        updateData.password = await bcrypt.hash(
          updateUserDto.password,
          this.saltRounds
        );
      }

      const user = await this.prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      this.logger.log(`用户更新成功: ${user.email}`);

      // 如果更新了角色或状态，清除相关缓存
      if (updateUserDto.roleId || updateUserDto.status) {
        this.permissionCacheService.clearUserCache(id);
      }

      return user;
    } catch (error) {
      this.logger.error(`用户更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 删除用户
   */
  async remove(id: string) {
    try {
      // 检查用户是否存在
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        throw new NotFoundException('用户不存在');
      }

      await this.prisma.user.delete({
        where: { id },
      });

      this.logger.log(`用户删除成功: ${existingUser.email}`);
      return { message: '用户删除成功' };
    } catch (error) {
      this.logger.error(`用户删除失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新用户状态
   */
  async updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: { status },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      this.logger.log(`用户状态更新成功: ${user.email} -> ${status}`);
      return user;
    } catch (error) {
      this.logger.error(`用户状态更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 验证密码
   */
  async validatePassword(
    plainPassword: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * 修改密码
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          password: true,
        },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
      if (!isPasswordValid) {
        throw new ConflictException('旧密码不正确');
      }

      const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);

      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
      this.logger.log(`已删除用户的所有刷新令牌: ${user.email}`);

      this.logger.log(`用户密码修改成功: ${user.email}`);

      return { message: '密码修改成功，请重新登录' };
    } catch (error) {
      this.logger.error(`用户密码修改失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取用户仪表盘统计数据
   */
  async getDashboardStats(userId: string) {
    try {
      // 获取今日开始时间
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // 并行查询所有统计数据
      const [
        projectCount,
        totalFiles,
        todayUploads,
        fileTypeStats,
        storageUsed,
      ] = await Promise.all([
        // 1. 项目数量（用户拥有的 + 作为成员的项目）
        this.prisma.fileSystemNode.count({
          where: {
            isRoot: true,
            deletedAt: null,
            personalSpaceKey: null,
            OR: [
              { ownerId: userId },
              { projectMembers: { some: { userId } } },
            ],
          },
        }),

        // 2. 文件总数（私人空间 + 项目中的文件）
        this.prisma.fileSystemNode.count({
          where: {
            isFolder: false,
            deletedAt: null,
            OR: [
              { ownerId: userId },
              {
                parent: {
                  OR: [
                    { ownerId: userId },
                    { projectMembers: { some: { userId } } },
                  ],
                },
              },
            ],
          },
        }),

        // 3. 今日上传数量
        this.prisma.fileSystemNode.count({
          where: {
            isFolder: false,
            deletedAt: null,
            createdAt: { gte: todayStart },
            ownerId: userId,
          },
        }),

        // 4. 文件类型统计
        this.prisma.fileSystemNode.groupBy({
          by: ['extension'],
          where: {
            isFolder: false,
            deletedAt: null,
            ownerId: userId,
          },
          _count: { extension: true },
        }),

        // 5. 存储使用量（用户所有文件的总大小）
        this.prisma.fileSystemNode.aggregate({
          where: {
            isFolder: false,
            deletedAt: null,
            ownerId: userId,
          },
          _sum: { size: true },
        }),
      ]);

      // 处理文件类型统计
      const fileTypeResult = { dwg: 0, dxf: 0, other: 0 };
      for (const item of fileTypeStats) {
        const ext = item.extension?.toLowerCase();
        if (ext === 'dwg') {
          fileTypeResult.dwg = item._count.extension;
        } else if (ext === 'dxf') {
          fileTypeResult.dxf = item._count.extension;
        } else {
          fileTypeResult.other += item._count.extension;
        }
      }

      // 存储空间配置（默认 10GB）
      const totalStorage = 10 * 1024 * 1024 * 1024; // 10GB
      const usedStorage = storageUsed._sum.size || 0;
      const remainingStorage = Math.max(0, totalStorage - usedStorage);
      const usagePercent = totalStorage > 0 ? (usedStorage / totalStorage) * 100 : 0;

      return {
        projectCount,
        totalFiles,
        todayUploads,
        fileTypeStats: fileTypeResult,
        storage: {
          used: usedStorage,
          total: totalStorage,
          remaining: remainingStorage,
          usagePercent,
        },
      };
    } catch (error) {
      this.logger.error(`获取仪表盘统计失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
