import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly saltRounds = 12;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionCacheService: PermissionCacheService
  ) {}

  /**
   * 创建用户
   */
  async create(createUserDto: CreateUserDto) {
    try {
      // 检查邮箱是否已存在
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: createUserDto.email },
      });

      if (existingEmail) {
        throw new ConflictException('邮箱已存在');
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

      const user = await this.prisma.user.create({
        data: {
          email: createUserDto.email,
          username: createUserDto.username,
          password: hashedPassword,
          nickname: createUserDto.nickname,
          avatar: createUserDto.avatar,
          roleId: createUserDto.roleId || defaultRole.id, // 使用传入的角色ID，默认为普通用户
          status: 'ACTIVE', // 管理员创建的用户直接激活
          emailVerified: true, // 视为已验证
          emailVerifiedAt: new Date(),
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

      this.logger.log(`用户创建成功: ${user.email}`);
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
}
