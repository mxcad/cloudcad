import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserMembershipDto } from './dto/update-user-membership.dto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class UsersService implements IUserService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly crudService: UserCrudService,
    private readonly statusService: UserStatusService,
    private readonly passwordService: UserPasswordService,
    private readonly configService: ConfigService,
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
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (mimetype && !allowedMimeTypes.includes(mimetype)) {
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
    const avatarDir = this.configService.get('avatarPath', { infer: true });
    await fs.promises.mkdir(avatarDir, { recursive: true }).catch(() => {});

    const oldExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const cleanups = oldExtensions.map((oldExt) => {
      const oldPath = path.join(avatarDir, `${userId}${oldExt}`);
      return fs.promises.unlink(oldPath).catch(() => {});
    });
    await Promise.all(cleanups);

    const safeExt = ext.toLowerCase() || '.png';
    const filePath = path.join(avatarDir, `${userId}${safeExt}`);
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
