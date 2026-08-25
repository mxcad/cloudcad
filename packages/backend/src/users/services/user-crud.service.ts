import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PermissionCacheService } from '../../permission/services/permission-cache.service';
import { DatabaseService } from '../../database/database.service';
import { PERSONAL_SPACE_NAME } from '../../personal-space/personal-space.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { MembershipService, DAY_MS } from '../../vip/membership.service';
import { StorageInfoService } from '../../file-system/storage-quota/storage-info.service';
import { StorageUsageService } from '../../vip/storage-usage/storage-usage.service';
import { membershipTierOf } from '../../vip/membership-tier';
import { QUOTA_KEYS } from '../../vip/quota-keys';
import { CreateUserDto } from '../dto/create-user.dto';
import { QueryUsersDto } from '../dto/query-users.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { NodeType, Prisma, ProjectStatus } from '@cloudcad/db';
import {
  ICreatedUser,
  IUserDetail,
} from '../../common/interfaces/user-service.interface';
import {
  PASSWORD_HASHER,
  IPasswordHasher,
} from '../interfaces/password-hasher.interface';
import { UserLifecycleEventPayload } from '../interfaces/user-lifecycle-event.interface';

import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class UserCrudService {
  private readonly logger = new Logger(UserCrudService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly runtimeConfigService: RuntimeConfigService,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly eventEmitter: EventEmitter2,
    private readonly membershipService: MembershipService,
    private readonly storageInfoService: StorageInfoService,
    private readonly storageUsageService: StorageUsageService
  ) {}

  async create(createUserDto: CreateUserDto): Promise<ICreatedUser> {
    try {
      const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
        'mailEnabled',
        false
      );
      const requireEmailVerification =
        await this.runtimeConfigService.getValue<boolean>(
          'requireEmailVerification',
          false
        );

      if (requireEmailVerification && !createUserDto.email) {
        throw new BadRequestException(
          I18nContext.current()?.t('error.user.email_required') ??
            '邮箱验证已启用，邮箱为必填项'
        );
      }

      if (createUserDto.email) {
        const existingEmail = await this.prisma.user.findFirst({
          where: { email: createUserDto.email, deletedAt: null },
        });
        if (existingEmail) {
          throw new ConflictException(
            I18nContext.current()?.t('error.user.email_exists') ?? '邮箱已存在'
          );
        }
      }

      const existingUsername = await this.prisma.user.findUnique({
        where: { username: createUserDto.username },
      });
      if (existingUsername) {
        throw new ConflictException(
          I18nContext.current()?.t('error.user.username_exists') ??
            '用户名已存在'
        );
      }

      if (createUserDto.phone) {
        const existingPhone = await this.prisma.user.findFirst({
          where: { phone: createUserDto.phone, deletedAt: null },
        });
        if (existingPhone) {
          throw new ConflictException(
            I18nContext.current()?.t('error.user.phone_exists') ??
              '手机号已存在'
          );
        }
      }

      const defaultRole = await this.prisma.role.findFirst({
        where: { name: 'USER' },
      });
      if (!defaultRole) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.user.default_role_not_found') ??
            '默认角色不存在，请联系管理员'
        );
      }

      const hashedPassword = await this.passwordHasher.hash(
        createUserDto.password
      );

      const user = await this.prisma.$transaction(async (tx) => {
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
            wechatId: true,
            provider: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isSystem: true,
                permissions: { select: { permission: true } },
              },
            },
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        const ownerRole = await tx.projectRole.findFirst({
          where: { name: 'PROJECT_OWNER', isSystem: true },
        });
        if (!ownerRole) {
          throw new NotFoundException(
            I18nContext.current()?.t(
              'error.user.project_owner_role_not_found'
            ) ?? 'PROJECT_OWNER 角色不存在'
          );
        }

        await tx.fileSystemNode.create({
          data: {
            name: PERSONAL_SPACE_NAME,
            nodeType: NodeType.PERSONAL_SPACE,
            projectStatus: ProjectStatus.ACTIVE,
            ownerId: newUser.id,
            projectMembers: {
              create: { userId: newUser.id, projectRoleId: ownerRole.id },
            },
          },
        });

        return newUser;
      });

      this.logger.log(
        `用户创建成功：${user.username}${user.email ? ` (${user.email})` : ''}`
      );
      this.eventEmitter.emit('user.created', {
        userId: user.id,
        email: user.email,
        username: user.username,
        timestamp: new Date(),
      } satisfies UserLifecycleEventPayload);

      return user;
    } catch (error) {
      this.logger.error(`用户创建失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(query: QueryUsersDto, userId?: string) {
    try {
      const {
        search,
        roleId,
        page = 1,
        limit = 10,
        sortBy,
        sortOrder,
        projectId,
        tierLevel,
      } = query;
      const safePage = Number(page) || 1;
      const safeLimit = Number(limit) || 10;
      const skip = (safePage - 1) * safeLimit;

      const where: Prisma.UserWhereInput = {};

      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { nickname: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (roleId) {
        where.roleId = roleId;
      }

      if (query.status === 'DELETED') {
        where.deletedAt = { not: null };
      } else {
        where.deletedAt = null;
        if (query.status) {
          where.status = query.status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
        }
      }

      // 会员等级筛选
      if (tierLevel !== undefined && tierLevel !== '') {
        // 统一用 AND 包裹，避免与 search/role 等条件的 OR 冲突或覆盖 where.membership
        const andList = Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : [];
        if (tierLevel === '0') {
          // 免费用户：无会员记录或 tierLevel=0
          andList.push({
            OR: [{ membership: null }, { membership: { tierLevel: 0 } }],
          });
        } else if (tierLevel === 'expired') {
          // 已过期：tierLevel > 0 且 expiresAt < 现在
          andList.push({
            membership: { tierLevel: { gt: 0 }, expiresAt: { lt: new Date() } },
          });
        } else {
          // 特定等级
          const level = Number(tierLevel);
          if (!isNaN(level)) {
            andList.push({ membership: { tierLevel: level } });
          }
        }
        if (andList.length > 0) where.AND = andList;
      }

      if (projectId && userId) {
        const project = await this.prisma.fileSystemNode.findFirst({
          where: { id: projectId, nodeType: NodeType.PROJECT, deletedAt: null },
          select: { ownerId: true },
        });
        if (!project) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.project.not_found') ?? '项目不存在'
          );
        }
        if (project.ownerId !== userId) {
          const isMember = await this.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId } },
          });
          if (!isMember) {
            throw new BadRequestException(
              I18nContext.current()?.t('error.user.not_project_member') ??
                '您不是该项目的成员'
            );
          }
        }
      }

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          skip,
          take: safeLimit,
          orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            phone: true,
            phoneVerified: true,
            username: true,
            nickname: true,
            avatar: true,
            wechatId: true,
            provider: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isSystem: true,
                permissions: { select: { permission: true } },
              },
            },
            membership: { select: { tierLevel: true, expiresAt: true } },
            status: true,
            deletedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.user.count({ where }),
      ]);

      const usersWithMembership = users.map((user) =>
        this.flattenMembership(user)
      );

      return {
        users: usersWithMembership,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (error) {
      this.logger.error(`查询用户列表失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async findById(id: string): Promise<IUserDetail> {
    return this.findByIdInternal(id);
  }

  async findOne(id: string) {
    return this.findByIdInternal(id);
  }

  private async findByIdInternal(id: string) {
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
          password: true,
          wechatId: true,
          provider: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
              permissions: { select: { permission: true } },
            },
          },
          membership: { select: { tierLevel: true, expiresAt: true } },
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'
        );
      }

      const hasPassword = !!user.password;
      const {
        password: _,
        membership: membershipRow,
        ...userWithoutPassword
      } = user;

      return {
        ...userWithoutPassword,
        hasPassword,
        membershipTierLevel: membershipRow?.tierLevel ?? 0,
        membershipExpiresAt: membershipRow?.expiresAt ?? null,
      };
    } catch (error) {
      this.logger.error(`查询用户失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async findByEmail(email: string): Promise<IUserDetail> {
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
          password: true,
          wechatId: true,
          provider: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
              permissions: { select: { permission: true } },
            },
          },
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'
        );
      }

      const hasPassword = !!user.password;
      const { password: _, ...userWithoutPassword } = user;

      return { ...userWithoutPassword, hasPassword };
    } catch (error) {
      this.logger.error(`查询用户失败：${error.message}`, error.stack);
      throw error;
    }
  }

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
          wechatId: true,
          provider: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
              permissions: { select: { permission: true } },
            },
          },
          status: true,
          password: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      this.logger.error(`根据邮箱查询用户失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto
  ): Promise<ICreatedUser> {
    try {
      const existingUser = await this.prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'
        );
      }

      if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
        const emailExists = await this.prisma.user.findFirst({
          where: { email: updateUserDto.email, deletedAt: null },
        });
        if (emailExists) {
          throw new ConflictException(
            I18nContext.current()?.t('error.user.email_exists') ?? '邮箱已存在'
          );
        }
      }

      if (
        updateUserDto.username &&
        updateUserDto.username !== existingUser.username
      ) {
        const usernameExists = await this.prisma.user.findUnique({
          where: { username: updateUserDto.username },
        });
        if (usernameExists) {
          throw new ConflictException(
            I18nContext.current()?.t('error.user.username_exists') ??
              '用户名已存在'
          );
        }
      }

      if (updateUserDto.phone && updateUserDto.phone !== existingUser.phone) {
        const phoneExists = await this.prisma.user.findFirst({
          where: { phone: updateUserDto.phone, deletedAt: null },
        });
        if (phoneExists) {
          throw new ConflictException(
            I18nContext.current()?.t('error.user.phone_exists') ??
              '手机号已存在'
          );
        }
      }

      const updateData: Prisma.UserUpdateInput = {};
      if (updateUserDto.email) updateData.email = updateUserDto.email;
      if (updateUserDto.username) updateData.username = updateUserDto.username;
      if (updateUserDto.phone !== undefined) {
        updateData.phone = updateUserDto.phone || null;
        updateData.phoneVerified = !!updateUserDto.phone;
        if (updateUserDto.phone) updateData.phoneVerifiedAt = new Date();
      }
      if (updateUserDto.nickname !== undefined)
        updateData.nickname = updateUserDto.nickname;
      if (updateUserDto.avatar !== undefined)
        updateData.avatar = updateUserDto.avatar;
      if (updateUserDto.roleId)
        updateData.role = { connect: { id: updateUserDto.roleId } };
      if (updateUserDto.status) updateData.status = updateUserDto.status;
      if (updateUserDto.password) {
        updateData.password = await this.passwordHasher.hash(
          updateUserDto.password
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
          wechatId: true,
          provider: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
              permissions: { select: { permission: true } },
            },
          },
          membership: { select: { tierLevel: true, expiresAt: true } },
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const userWithMembership = this.flattenMembership(user);

      this.logger.log(`用户更新成功：${user.email}`);

      if (updateUserDto.roleId || updateUserDto.status) {
        this.permissionCacheService.clearUserCache(id);
      }

      return userWithMembership;
    } catch (error) {
      this.logger.error(`用户更新失败：${error.message}`, error.stack);
      throw error;
    }
  }

  async updateMembership(
    id: string,
    tierLevel: number,
    expiresAt?: string,
    adjustDays?: number
  ) {
    try {
      const existingUser = await this.prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.user.not_found') ?? '用户不存在'
        );
      }

      // 计算最终到期时间：adjustDays 模式下基于当前到期时间增减
      let finalExpiresAt = expiresAt;
      if (adjustDays !== undefined && adjustDays !== 0 && tierLevel > 0) {
        const existingMembership = await this.prisma.userMembership.findUnique({
          where: { userId: id },
        });
        const now = new Date();
        const base =
          existingMembership?.expiresAt && existingMembership.expiresAt > now
            ? existingMembership.expiresAt
            : now;
        const adjusted = new Date(base.getTime() + adjustDays * DAY_MS);
        // 调整后不能早于现在（不设已过期时间）
        finalExpiresAt =
          adjusted > now ? adjusted.toISOString() : now.toISOString();
      }

      if (tierLevel > 0) {
        if (!finalExpiresAt) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.vip.expires_at_required') ??
              '有效会员必须设置到期时间'
          );
        }
        const maxTier = await this.prisma.vipTier.aggregate({
          _max: { level: true },
        });
        const maxLevel = maxTier._max.level ?? 0;
        if (tierLevel > maxLevel) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.vip.tier_not_found') ??
              `VIP 等级不能超过 ${maxLevel}`
          );
        }
      }

      if (tierLevel === 0) {
        await this.prisma.userMembership.deleteMany({ where: { userId: id } });
        this.logger.log(`用户会员已移除：${id}`);
      } else {
        await this.prisma.userMembership.upsert({
          where: { userId: id },
          create: {
            userId: id,
            tierLevel,
            expiresAt: finalExpiresAt ? new Date(finalExpiresAt) : null,
          },
          update: {
            tierLevel,
            expiresAt: finalExpiresAt ? new Date(finalExpiresAt) : null,
          },
        });
        this.logger.log(
          `用户会员已更新：id=${id}, tierLevel=${tierLevel}, expiresAt=${finalExpiresAt}`
        );
      }

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
          wechatId: true,
          provider: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
              permissions: { select: { permission: true } },
            },
          },
          membership: { select: { tierLevel: true, expiresAt: true } },
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // 会员等级/到期时间变化会影响存储额度，立即失效配额缓存保证前端即时生效
      await this.storageInfoService.invalidateQuotaCache(id);

      return this.flattenMembership(user!);
    } catch (error) {
      this.logger.error(`用户会员更新失败：${error.message}`, error.stack);
      throw error;
    }
  }

  private flattenMembership<
    T extends {
      membership?: { tierLevel: number; expiresAt: Date | null } | null;
    },
  >(
    user: T
  ): Omit<T, 'membership'> & {
    membershipTierLevel: number;
    membershipExpiresAt: Date | null;
    isVip: boolean;
    membershipTier: string;
  } {
    const { membership: membershipRow, ...userWithoutMembership } = user;
    // 有效会员判定（与 AuthService / restriction-engine / storage-info 语义一致）：
    // membership 存在 && (expiresAt === null 永久 || expiresAt > now)，过期/失效统一降级为 0/null
    const membershipValid =
      !!membershipRow &&
      (membershipRow.expiresAt === null ||
        membershipRow.expiresAt > new Date());
    const membershipTierLevel = membershipValid ? membershipRow.tierLevel : 0;
    return {
      ...userWithoutMembership,
      membershipTierLevel,
      membershipExpiresAt: membershipValid ? membershipRow.expiresAt : null,
      isVip: membershipTierLevel > 0,
      membershipTier: membershipTierOf(membershipTierLevel),
    };
  }

  async getDashboardStats(userId: string) {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        projectCount,
        totalFiles,
        todayUploads,
        fileTypeStats,
        storageUsed,
      ] = await Promise.all([
        this.prisma.fileSystemNode.count({
          where: {
            nodeType: NodeType.PROJECT,
            deletedAt: null,
            OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
          },
        }),
        this.prisma.fileSystemNode.count({
          where: {
            nodeType: NodeType.FILE,
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
        this.prisma.fileSystemNode.count({
          where: {
            nodeType: NodeType.FILE,
            deletedAt: null,
            createdAt: { gte: todayStart },
            ownerId: userId,
          },
        }),
        this.prisma.fileSystemNode.groupBy({
          by: ['extension'],
          where: { nodeType: NodeType.FILE, deletedAt: null, ownerId: userId },
          _count: { extension: true },
        }),
        this.storageUsageService.usageSize({ kind: 'owned', userId }),
      ]);

      const fileTypeResult = { dwg: 0, dxf: 0, other: 0 };
      for (const item of fileTypeStats) {
        const ext = item.extension?.toLowerCase();
        if (ext === 'dwg') fileTypeResult.dwg = item._count.extension;
        else if (ext === 'dxf') fileTypeResult.dxf = item._count.extension;
        else fileTypeResult.other += item._count.extension;
      }

      const limitMB = await this.membershipService.getQuota(
        userId,
        QUOTA_KEYS.PERSONAL_STORAGE
      );
      const totalStorage = limitMB * 1024 * 1024;
      const usedStorage = storageUsed;
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
