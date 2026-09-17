import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IUserService,
  ICreatedUser,
  IUserDetail,
  IUserActionResponse,
} from '../common/interfaces/user-service.interface';
import { UserCrudService } from './services/user-crud.service';
import { UserStatusService } from './services/user-status.service';
import { UserPasswordService } from './services/user-password.service';
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_EXTENSIONS,
  normalizeAvatarExtension,
} from './avatar-extensions';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserMembershipDto } from './dto/update-user-membership.dto';
import { DatabaseService } from '../database/database.service';
import { PiiCryptoService } from '../common/pii/pii-crypto.service';
import { Prisma } from '@cloudcad/db';
import { I18nContext } from 'nestjs-i18n';
import * as path from 'path';
import * as fs from 'fs';
import { ClsService } from 'nestjs-cls';
import { buildOutboundTraceHeaders } from '../common/utils/outbound-trace';

@Injectable()
export class UsersService implements IUserService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly crudService: UserCrudService,
    private readonly statusService: UserStatusService,
    private readonly passwordService: UserPasswordService,
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
    private readonly databaseService: DatabaseService,
    private readonly pii: PiiCryptoService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<ICreatedUser> {
    return this.crudService.create(createUserDto);
  }

  async findAll(query: QueryUsersDto, userId?: string) {
    return this.crudService.findAll(query, userId);
  }

  async findById(id: string): Promise<IUserDetail> {
    return this.crudService.findById(id);
  }

  async findOne(id: string) {
    return this.crudService.findOne(id);
  }

  async findByEmail(email: string): Promise<IUserDetail> {
    return this.crudService.findByEmail(email);
  }

  async findByEmailWithPassword(email: string) {
    return this.crudService.findByEmailWithPassword(email);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<ICreatedUser> {
    return this.crudService.update(id, updateUserDto);
  }

  /**
   * 用户修改自己资料（含用户名修改限额检查）。
   * 业务规则 + 事务边界全部在此方法内，控制器只做路由委托。
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ICreatedUser> {
    return this.databaseService.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
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
          usernameChangeCount: true,
          lastUsernameChangeAt: true,
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

      const usernameChanged =
        dto.username != null && dto.username !== user.username;

      const now = new Date();
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const data: Prisma.UserUpdateInput = { ...dto };

      if (usernameChanged) {
        // 检查用户名唯一性
        const usernameExists = await tx.user.findUnique({
          where: { username: dto.username },
        });
        if (usernameExists && usernameExists.id !== userId) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.user.username_exists') ??
              '用户名已存在'
          );
        }

        // 判断是否需要重置计数（上次修改超过一个月）
        const expired =
          !user.lastUsernameChangeAt || user.lastUsernameChangeAt < oneMonthAgo;
        const effectiveCount = expired ? 0 : user.usernameChangeCount;

        if (effectiveCount >= 3) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.user.username_change_limit') ??
              '用户名一月内只能修改3次'
          );
        }

        data.usernameChangeCount = expired ? 1 : { increment: 1 };
        data.lastUsernameChangeAt = now;
      }

      // 检查邮箱唯一性（#417：查重走 HMAC 归一化索引列，大小写不敏感）
      if (dto.email && dto.email !== user.email) {
        const emailExists = await tx.user.findFirst({
          where: {
            emailHmac: this.pii.emailHmacIndex(dto.email),
            deletedAt: null,
          },
        });
        if (emailExists) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.user.email_exists') ?? '邮箱已存在'
          );
        }
      }

      // 检查手机号唯一性（#417：查重走 HMAC 归一化索引列，兼容 +86/空白）
      if (dto.phone && dto.phone !== user.phone) {
        const phoneExists = await tx.user.findFirst({
          where: {
            phoneHmac: this.pii.phoneHmacIndex(dto.phone),
            deletedAt: null,
          },
        });
        if (phoneExists) {
          throw new BadRequestException(
            I18nContext.current()?.t('error.user.phone_exists') ?? '手机号已存在'
          );
        }
      }

      // #417 双写：dto 涉及 email/phone 时同步补齐派生列（解绑传 null 时清空派生列）；
      // 未涉及字段传 undefined，derivePiiFields 不触碰其派生列
      Object.assign(
        data,
        this.pii.derivePiiFields({
          email:
            dto.email !== undefined ? dto.email || null : undefined,
          phone:
            dto.phone !== undefined ? dto.phone || null : undefined,
        })
      );

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data,
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

      // 扁平化 membership 字段
      const { membership: membershipRow, ...userWithoutMembership } = updatedUser;
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
      };
    });
  }

  async updateMembership(id: string, dto: UpdateUserMembershipDto) {
    return this.crudService.updateMembership(id, dto.tierLevel, dto.expiresAt, dto.adjustDays);
  }

  async getDashboardStats(userId: string) {
    return this.crudService.getDashboardStats(userId);
  }

  async softDelete(id: string, operatorId?: string) {
    return this.statusService.softDelete(id, operatorId);
  }

  async deleteImmediately(id: string, operatorId?: string) {
    return this.statusService.deleteImmediately(id, operatorId);
  }

  async restore(id: string): Promise<IUserActionResponse> {
    return this.statusService.restore(id);
  }

  async remove(id: string) {
    return this.statusService.remove(id);
  }

  async deactivate(
    userId: string,
    password?: string,
    phoneCode?: string,
    emailCode?: string,
    wechatCode?: string
  ): Promise<IUserActionResponse> {
    return this.statusService.deactivate(userId, password, phoneCode, emailCode, wechatCode);
  }

  async restoreAccount(
    userId: string,
    verificationMethod: 'password' | 'phoneCode' | 'emailCode',
    code: string
  ) {
    return this.statusService.restoreAccount(userId, verificationMethod, code);
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') {
    return this.statusService.updateStatus(id, status);
  }

  async validatePassword(
    plainPassword: string,
    hashedPassword: string
  ): Promise<boolean> {
    return this.passwordService.validatePassword(plainPassword, hashedPassword);
  }

  async uploadAvatar(userId: string, buffer: Buffer, ext: string, mimetype?: string): Promise<ICreatedUser> {
    if (mimetype && !AVATAR_ALLOWED_MIME_TYPES.includes(mimetype)) {
      throw new BadRequestException('仅支持 PNG、JPEG、GIF、WebP 格式的图片');
    }

    const maxSize = 5 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new BadRequestException('头像文件大小不能超过 5MB');
    }

    const avatarUrl = await this.saveAvatarToDisk(userId, buffer, ext);
    this.logger.log(`头像上传成功：userId=${userId}`);

    return this.crudService.update(userId, { avatar: avatarUrl });
  }

  /**
   * 同步微信头像到本地存储（方案：登录时落盘，避免前端直连微信头像域名）。
   * 下载微信头像 → 校验 → 落盘 → 更新 avatar 为本地 URL。
   * 任何失败（网络/格式/域名不符）都降级返回 null，永不抛错（3s 超时兜底，
   * 登录流程最多等待 3s 且不会因头像问题失败）。
   */
  async syncWechatAvatar(
    userId: string,
    wechatAvatarUrl: string
  ): Promise<string | null> {
    if (!wechatAvatarUrl || !this.isWechatAvatarUrl(wechatAvatarUrl)) {
      this.logger.warn(
        `同步微信头像跳过：非微信头像域名 url=${wechatAvatarUrl}, userId=${userId}`
      );
      return null;
    }

    let response: Response;
    try {
      // redirect: 'error' — 微信头像为最终 CDN URL 不应重定向；
      // 拒绝跟随重定向，避免初始域名白名单校验被 302 绕过
      response = await fetch(wechatAvatarUrl, {
        signal: AbortSignal.timeout(3_000),
        redirect: 'error',
        // X-Request-Id/X-Trace-Id 透传（#309）：微信 CDN 侧网关日志可关联
        headers: buildOutboundTraceHeaders(
          {
            requestId: this.cls?.get<string>('requestId'),
            traceId: this.cls?.get<string>('traceId'),
          },
          'wechat-avatar',
        ),
      });
    } catch (error) {
      this.logger.warn(
        `同步微信头像失败（网络异常），保留原头像: userId=${userId}, ${(error as Error).message}`
      );
      return null;
    }

    if (!response.ok) {
      this.logger.warn(
        `同步微信头像失败（HTTP ${response.status}），保留原头像: userId=${userId}`
      );
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    const ext = extMap[contentType.split(';')[0].trim()];
    if (!ext) {
      this.logger.warn(
        `同步微信头像失败（非图片类型 ${contentType}），保留原头像: userId=${userId}`
      );
      return null;
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(
        `同步微信头像失败（读取响应异常），保留原头像: userId=${userId}, ${(error as Error).message}`
      );
      return null;
    }

    const maxSize = 5 * 1024 * 1024;
    if (buffer.length > maxSize) {
      this.logger.warn(
        `同步微信头像失败（超过 5MB），保留原头像: userId=${userId}`
      );
      return null;
    }

    try {
      const avatarUrl = await this.saveAvatarToDisk(userId, buffer, ext);
      await this.crudService.update(userId, { avatar: avatarUrl });
      this.logger.log(`微信头像已同步到本地：userId=${userId}`);
      return avatarUrl;
    } catch (error) {
      this.logger.warn(
        `同步微信头像失败（落盘异常），保留原头像: userId=${userId}, ${(error as Error).message}`
      );
      return null;
    }
  }

  /** 仅允许微信头像域名（qlogo.cn / qpic.cn），防御性校验，杜绝 SSRF */
  private isWechatAvatarUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      return host.endsWith('.qlogo.cn') || host.endsWith('.qpic.cn');
    } catch {
      return false;
    }
  }

  /** 将头像 buffer 落盘，返回本地可访问 URL */
  private async saveAvatarToDisk(
    userId: string,
    buffer: Buffer,
    ext: string
  ): Promise<string> {
    // 路径遍历防护：userId 可能来自管理员端点 URL 参数（Express 解码 %2f/%5c），
    // basename 剥离路径段，确保头像落盘不逃逸 avatarDir
    userId = path.basename(userId);
    const avatarDir = this.configService.get('avatarPath', { infer: true });
    await fs.promises.mkdir(avatarDir, { recursive: true }).catch(() => {});

    // 覆盖全部历史后缀（含 `.jfif`/`.jpeg`）：旧实现漏清 `.jfif`，移动端换头像后残留孤儿文件
    const cleanups = AVATAR_EXTENSIONS.map((oldExt) => {
      const oldPath = path.join(avatarDir, `${userId}${oldExt}`);
      return fs.promises.unlink(oldPath).catch(() => {});
    });
    await Promise.all(cleanups);

    const filePath = path.join(avatarDir, `${userId}${normalizeAvatarExtension(ext)}`);
    await fs.promises.writeFile(filePath, buffer);

    return `/api/v1/users/avatar/${userId}`;
  }

  async changePassword(
    userId: string,
    oldPassword: string | undefined,
    newPassword: string
  ): Promise<{ message: string }> {
    return this.passwordService.changePassword(userId, oldPassword, newPassword);
  }
}
