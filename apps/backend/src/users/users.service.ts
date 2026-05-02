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
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { UserCleanupService } from '../common/services/user-cleanup.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma, ProjectStatus } from '@prisma/client';
import {
  SMS_VERIFICATION_SERVICE,
  ISmsVerificationService,
  EMAIL_VERIFICATION_SERVICE,
  IEmailVerificationService,
} from '../common/interfaces/verification.interface';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly saltRounds = 12;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly userCleanupService: UserCleanupService,
    private readonly configService: ConfigService,
    private readonly runtimeConfigService: RuntimeConfigService,
    @Inject(SMS_VERIFICATION_SERVICE)
    private readonly smsVerificationService: ISmsVerificationService,
    @Inject(EMAIL_VERIFICATION_SERVICE)
    private readonly emailVerificationService: IEmailVerificationService
  ) {}

  /**
   * 创建用户（包含私人空间创建）
   */
  async create(createUserDto: CreateUserDto) {
    try {
      // 获取运行时配置
      const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
        'mailEnabled',
        false
      );
      const requireEmailVerification =
        await this.runtimeConfigService.getValue<boolean>(
          'requireEmailVerification',
          false
        );

      // 只有当需要验证邮箱时，才要求邮箱必填
      if (requireEmailVerification && !createUserDto.email) {
        throw new BadRequestException('邮箱验证已启用，邮箱为必填项');
      }

      // 如果提供了邮箱，检查是否已存在（排除已注销用户）
      if (createUserDto.email) {
        const existingEmail = await this.prisma.user.findFirst({
          where: { 
            email: createUserDto.email,
            deletedAt: null,
          },
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

      // 如果提供了手机号，检查是否已存在（排除已注销用户）
      if (createUserDto.phone) {
        const existingPhone = await this.prisma.user.findFirst({
          where: { 
            phone: createUserDto.phone,
            deletedAt: null,
          },
        });

        if (existingPhone) {
          throw new ConflictException('手机号已存在');
        }
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
            phone: createUserDto.phone || null,
            phoneVerified:
              createUserDto.phoneVerified ??
              (createUserDto.phone ? true : false),
            phoneVerifiedAt: createUserDto.phone ? new Date() : null,
            wechatId: createUserDto.wechatId || null,
            provider: createUserDto.provider || 'LOCAL',
          },
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            phone: true,
            phoneVerified: true,
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

      this.logger.log(
        `用户创建成功：${user.username}${user.email ? ` (${user.email})` : ''}`
      );
      return user;
    } catch (error) {
      this.logger.error(`用户创建失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 查询用户列表
   */
  async findAll(query: QueryUsersDto, userId?: string) {
    try {
      const { search, roleId, page = 1, limit = 10, sortBy, sortOrder, projectId } = query;
      const skip = (page - 1) * limit;

      const where: Prisma.UserWhereInput = {};

      // 搜索条件
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { nickname: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }

      // 角色筛选
      if (roleId) {
        where.roleId = roleId;
      }

      // 状态筛选（支持特殊值 DELETED 查询已注销用户）
      if (query.status === 'DELETED') {
        where.deletedAt = { not: null };
      } else if (query.status) {
        where.status = query.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
      }

      // 权限检查：如果提供了 projectId，检查用户是否为项目成员或所有者
      if (projectId && userId) {
        const project = await this.prisma.fileSystemNode.findUnique({
          where: { id: projectId, isRoot: true },
          select: { ownerId: true },
        });

        if (!project) {
          throw new BadRequestException('项目不存在');
        }

        // 检查用户是否为项目所有者
        if (project.ownerId !== userId) {
          // 检查用户是否为项目成员
          const isMember = await this.prisma.projectMember.findUnique({
            where: {
              projectId_userId: {
                projectId,
                userId,
              },
            },
          });

          if (!isMember) {
            throw new BadRequestException('您不是该项目的成员');
          }
        }
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
            phone: true,
            phoneVerified: true,
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
            deletedAt: true,
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
      this.logger.error(`查询用户列表失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 根据 ID 查询用户
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
          phone: true,
          phoneVerified: true,
          password: true, // 需要查询密码字段以判断是否已设置密码
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

      // 计算 hasPassword 并移除敏感字段
      const hasPassword = !!user.password;
      const { password: _, ...userWithoutPassword } = user;

      return {
        ...userWithoutPassword,
        hasPassword,
      };
    } catch (error) {
      this.logger.error(`查询用户失败：${error.message}`, error.stack);
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
          phone: true,
          phoneVerified: true,
          password: true, // 需要查询密码字段以判断是否已设置密码
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

      // 计算 hasPassword 并移除敏感字段
      const hasPassword = !!user.password;
      const { password: _, ...userWithoutPassword } = user;

      return {
        ...userWithoutPassword,
        hasPassword,
      };
    } catch (error) {
      this.logger.error(`查询用户失败：${error.message}`, error.stack);
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
          phone: true,
          phoneVerified: true,
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
      this.logger.error(`根据邮箱查询用户失败：${error.message}`, error.stack);
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

      // 检查邮箱唯一性（排除已注销用户）
      if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
        const emailExists = await this.prisma.user.findFirst({
          where: { 
            email: updateUserDto.email,
            deletedAt: null,
          },
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

      // 检查手机号唯一性（排除已注销用户）
      if (updateUserDto.phone && updateUserDto.phone !== existingUser.phone) {
        const phoneExists = await this.prisma.user.findFirst({
          where: { 
            phone: updateUserDto.phone,
            deletedAt: null,
          },
        });

        if (phoneExists) {
          throw new ConflictException('手机号已存在');
        }
      }

      // 如果更新密码，需要加密
      const updateData: Prisma.UserUpdateInput = {};
      if (updateUserDto.email) updateData.email = updateUserDto.email;
      if (updateUserDto.username) updateData.username = updateUserDto.username;
      if (updateUserDto.phone !== undefined) {
        updateData.phone = updateUserDto.phone || null;
        updateData.phoneVerified = !!updateUserDto.phone;
        if (updateUserDto.phone) {
          updateData.phoneVerifiedAt = new Date();
        }
      }
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
          phone: true,
          phoneVerified: true,
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

      this.logger.log(`用户更新成功：${user.email}`);

      // 如果更新了角色或状态，清除相关缓存
      if (updateUserDto.roleId || updateUserDto.status) {
        this.permissionCacheService.clearUserCache(id);
      }

      return user;
    } catch (error) {
      this.logger.error(`用户更新失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 软删除用户（管理员操作）
   * 设置 deletedAt 后，用户进入冷静期，30天后由 UserCleanupService 清理数据
   */
  async softDelete(id: string) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });

      if (!existingUser) {
        throw new NotFoundException('用户不存在');
      }

      if (existingUser.deletedAt) {
        throw new BadRequestException('用户已注销');
      }

      // 防止删除管理员账户
      if (existingUser.role.name === 'ADMIN') {
        throw new BadRequestException('不能删除管理员账户');
      }

      await this.prisma.user.update({
        where: { id },
        data: { 
          deletedAt: new Date(),
          phone: null,
          phoneVerified: false,
          wechatId: null,
          email: null,
          emailVerified: false,
        },
      });

      this.logger.log(`用户注销成功：${existingUser.email}`);
      return { message: '用户已注销，30天后自动清理数据' };
    } catch (error) {
      this.logger.error(`用户注销失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 立即注销用户（管理员操作）
   * 清理用户数据后直接物理删除用户记录，无法恢复
   */
  async deleteImmediately(id: string) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
        include: { role: true },
      });

      if (!existingUser) {
        throw new NotFoundException('用户不存在');
      }

      if (existingUser.deletedAt) {
        throw new BadRequestException('用户已注销');
      }

      // 防止删除管理员账户
      if (existingUser.role.name === 'ADMIN') {
        throw new BadRequestException('不能删除管理员账户');
      }

      // 1. 立即清理用户数据
      await this.userCleanupService.cleanupUser(id);

      // 2. 物理删除用户记录
      await this.prisma.user.delete({
        where: { id },
      });

      this.logger.log(`用户立即注销成功：${existingUser.email}`);
      return { message: '用户已立即注销并彻底删除数据' };
    } catch (error) {
      this.logger.error(`用户立即注销失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 恢复用户（清除 deletedAt，冷静期内可恢复）
   */
  async restore(id: string) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        throw new NotFoundException('用户不存在');
      }

      if (!existingUser.deletedAt) {
        throw new BadRequestException('用户未注销，无法恢复');
      }

      await this.prisma.user.update({
        where: { id },
        data: { deletedAt: null },
      });

      this.logger.log(`用户恢复成功：${existingUser.email}`);
      return { message: '用户已恢复' };
    } catch (error) {
      this.logger.error(`用户恢复失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 物理删除用户（保留方法，暂不使用）
   */
  async remove(id: string) {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        throw new NotFoundException('用户不存在');
      }

      await this.prisma.user.delete({
        where: { id },
      });

      this.logger.log(`用户删除成功：${existingUser.email}`);
      return { message: '用户删除成功' };
    } catch (error) {
      this.logger.error(`用户删除失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 注销用户账户（软删除）
   * 支持多种验证方式：密码、手机验证码、邮箱验证码、微信扫码
   * 用户可以选择任意一种他们拥有的验证方式
   */
  async deactivateAccount(
    userId: string,
    password?: string,
    phoneCode?: string,
    emailCode?: string,
    wechatConfirm?: string
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      if (user.deletedAt) {
        throw new BadRequestException('账户已注销');
      }

      let verified = false;

      // 根据用户提供的验证方式进行验证
      if (password) {
        // 密码验证 - 用户必须有密码
        if (!user.password) {
          throw new BadRequestException('该账户未设置密码，请选择其他验证方式');
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          throw new UnauthorizedException('密码不正确');
        }
        verified = true;
      } else if (phoneCode) {
        // 手机验证码 - 用户必须有已验证的手机
        if (!user.phone || !user.phoneVerified) {
          throw new BadRequestException('该账户未绑定手机，请选择其他验证方式');
        }
        const result = await this.smsVerificationService.verifyCode(
          user.phone,
          phoneCode
        );
        if (!result.valid) {
          throw new UnauthorizedException(result.message);
        }
        verified = true;
      } else if (emailCode) {
        // 邮箱验证码 - 用户必须有邮箱
        if (!user.email) {
          throw new BadRequestException('该账户未绑定邮箱，请选择其他验证方式');
        }
        const isEmailValid = await this.verifyEmailCode(user.email, emailCode);
        if (!isEmailValid) {
          throw new UnauthorizedException('邮箱验证码不正确或已过期');
        }
        verified = true;
      } else if (wechatConfirm === 'confirmed') {
        // 微信扫码验证（兼容旧版）- 用户必须有微信绑定
        if (!user.wechatId) {
          throw new BadRequestException('该账户未绑定微信，请选择其他验证方式');
        }
        verified = true;
      }

      if (!verified) {
        throw new BadRequestException('请选择一种验证方式');
      }

      // 执行软删除，同时解绑手机号、微信号和邮箱，以便用户重新注册
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          status: 'INACTIVE',
          phone: null,
          phoneVerified: false,
          wechatId: null,
          email: null,
          emailVerified: false,
        },
      });

      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });

      this.logger.log(`用户账户已注销：${user.email || user.phone}`);
      return { message: '账户注销成功' };
    } catch (error) {
      this.logger.error(`账户注销失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 恢复已注销账户（冷静期内自助恢复）
   */
  async restoreAccount(
    userId: string,
    verificationMethod: 'password' | 'phoneCode' | 'emailCode',
    code: string
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      if (!user.deletedAt) {
        throw new BadRequestException('账户未注销，无需恢复');
      }

      const cleanupDelayDays = this.configService.get<number>(
        'userCleanup.delayDays',
        30
      );
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - cleanupDelayDays);

      if (user.deletedAt < expiryDate) {
        throw new BadRequestException('已过冷静期，无法恢复');
      }

      let verified = false;

      if (verificationMethod === 'password') {
        if (!user.password) {
          throw new BadRequestException('该账户未设置密码');
        }
        const isPasswordValid = await bcrypt.compare(code, user.password);
        if (!isPasswordValid) {
          throw new UnauthorizedException('密码不正确');
        }
        verified = true;
      } else if (verificationMethod === 'phoneCode') {
        if (!user.phone || !user.phoneVerified) {
          throw new BadRequestException('该账户未绑定手机');
        }
        const result = await this.smsVerificationService.verifyCode(
          user.phone,
          code
        );
        if (!result.valid) {
          throw new UnauthorizedException(result.message);
        }
        verified = true;
      } else if (verificationMethod === 'emailCode') {
        if (!user.email) {
          throw new BadRequestException('该账户未绑定邮箱');
        }
        const isEmailValid = await this.verifyEmailCode(user.email, code);
        if (!isEmailValid) {
          throw new UnauthorizedException('邮箱验证码不正确或已过期');
        }
        verified = true;
      }

      if (!verified) {
        throw new BadRequestException('验证方式无效');
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: null,
          status: 'ACTIVE',
        },
      });

      this.logger.log(`用户账户已恢复：${user.email || user.phone}`);
      return { message: '账户恢复成功' };
    } catch (error) {
      this.logger.error(`账户恢复失败：${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 验证邮箱验证码（复用邮箱验证服务）
   */
  private async verifyEmailCode(email: string, code: string): Promise<boolean> {
    try {
      const result = await this.emailVerificationService.verifyEmail(email, code);
      return result.valid;
    } catch {
      return false;
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
          phone: true,
          phoneVerified: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      this.logger.log(`用户状态更新成功：${user.email} -> ${status}`);
      return user;
    } catch (error) {
      this.logger.error(`用户状态更新失败：${error.message}`, error.stack);
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
   * - 有密码用户：需要验证旧密码
   * - 无密码用户（手机/微信自动注册）：可以直接设置密码
   */
  async changePassword(
    userId: string,
    oldPassword: string | undefined,
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

      // 判断用户是否已有密码
      const hasPassword = !!user.password;

      if (hasPassword) {
        // 有密码：必须验证旧密码
        if (!oldPassword) {
          throw new BadRequestException('请输入当前密码');
        }
        const isPasswordValid = await bcrypt.compare(
          oldPassword,
          user.password
        );
        if (!isPasswordValid) {
          throw new ConflictException('当前密码不正确');
        }
      }
      // 无密码用户：可以直接设置新密码（不需要验证旧密码）

      const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);

      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
      this.logger.log(`已删除用户的所有刷新令牌：${user.email}`);

      this.logger.log(
        `用户密码${hasPassword ? '修改' : '设置'}成功：${user.email}`
      );

      return {
        message: `密码${hasPassword ? '修改' : '设置'}成功，请重新登录`,
      };
    } catch (error) {
      this.logger.error(`用户密码修改失败：${error.message}`, error.stack);
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
            OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
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

        // 5. 存储空间使用量（用户所有文件的总大小）
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

      // 获取用户个人空间的配额（GB）
      const personalSpace = await this.prisma.fileSystemNode.findUnique({
        where: { personalSpaceKey: userId },
        select: { storageQuota: true },
      });

      // 计算配额：个人空间 storageQuota（GB）> RuntimeConfig 默认值
      let quotaGB = await this.runtimeConfigService.getValue<number>(
        'userStorageQuota',
        10
      );
      if (personalSpace?.storageQuota && personalSpace.storageQuota > 0) {
        quotaGB = personalSpace.storageQuota;
      }
      const totalStorage = quotaGB * 1024 * 1024 * 1024; // GB 转字节

      const usedStorage = storageUsed._sum.size || 0;
      const remainingStorage = Math.max(0, totalStorage - usedStorage);
      const usagePercent =
        totalStorage > 0 ? (usedStorage / totalStorage) * 100 : 0;

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
      this.logger.error(`获取仪表盘统计失败：${error.message}`, error.stack);
      throw error;
    }
  }
}
