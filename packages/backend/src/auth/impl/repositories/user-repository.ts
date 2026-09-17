import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { PiiCryptoService } from '../../../common/pii/pii-crypto.service';
import type { IUserRepository, UserRecord } from '@cloudcad/contracts';

@Injectable()
export class UserRepository implements IUserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly pii: PiiCryptoService
  ) {}

  /**
   * PII 显示读（#426 步骤③ 读切换）：优先解密 enc 列，未迁移记录（enc 空）降级读明文列。
   * 双写过渡期任何时刻保证至少有一份可读数据；enc 非空但解密失败（密文损坏）同样降级读明文列。
   * 明文列将于收缩阶段（步骤⑤）删除，届时降级分支自然失效（enc 恒非空）。
   */
  private resolvePii(
    enc: string | null | undefined,
    plaintext: string | null | undefined
  ): string | null {
    if (enc) {
      try {
        return this.pii.decrypt(enc);
      } catch (error) {
        this.logger.warn(`PII 解密失败，降级读明文列: ${(error as Error).message}`);
        return plaintext ?? null;
      }
    }
    return plaintext ?? null;
  }

  private toUserRecord(raw: any): UserRecord {
    if (!raw) return null;
    return {
      id: raw.id,
      email: this.resolvePii(raw.emailEnc, raw.email),
      username: raw.username,
      nickname: raw.nickname ?? null,
      avatar: raw.avatar ?? null,
      password: raw.password ?? null,
      phone: this.resolvePii(raw.phoneEnc, raw.phone),
      phoneVerified: raw.phoneVerified ?? false,
      emailVerified: raw.emailVerified ?? false,
      emailVerifiedAt: raw.emailVerifiedAt ?? null,
      phoneVerifiedAt: raw.phoneVerifiedAt ?? null,
      wechatId: raw.wechatId ?? null,
      provider: raw.provider ?? null,
      roleId: raw.roleId ?? null,
      status: raw.status,
      deletedAt: raw.deletedAt ?? null,
      deactivatedBy: raw.deactivatedBy ?? null,
      totpEnabled: raw.totpEnabled ?? false,
      passwordChangedAt: raw.passwordChangedAt ?? null,
      role: raw.role ? {
        id: raw.role.id,
        name: raw.role.name,
        description: raw.role.description ?? null,
        isSystem: raw.role.isSystem,
        permissions: raw.role.permissions?.map((p: any) => ({ permission: p.permission })) ?? [],
      } : null,
    };
  }

  async findById(id: string): Promise<UserRecord | null> {
    const raw = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    // #417：查询走 HMAC 归一化索引列等值匹配（不再读明文列）
    const raw = await this.prisma.user.findFirst({
      where: {
        emailHmac: this.pii.emailHmacIndex(email),
        deletedAt: null,
      },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const raw = await this.prisma.user.findUnique({
      where: { username, deletedAt: null },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async findByPhone(phone: string): Promise<UserRecord | null> {
    // #417：查询走 HMAC 归一化索引列等值匹配（不再读明文列）
    const raw = await this.prisma.user.findFirst({
      where: {
        phoneHmac: this.pii.phoneHmacIndex(phone),
        deletedAt: null,
      },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async findByWechatId(wechatId: string): Promise<UserRecord | null> {
    const raw = await this.prisma.user.findUnique({
      where: { wechatId, deletedAt: null },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async findLoginUserIncludingDeleted(account: string): Promise<UserRecord | null> {
    const isPhone = /^(\+86)?1[3-9]\d{9}$/.test(account);
    const formattedPhone = account.replace(/^\+86/, '');
    // #417：email/phone 走 HMAC 归一化索引列（归一化后等值匹配，兼容 +86/空白/大小写输入）；
    // username 保留原值精确匹配
    const raw = await this.prisma.user.findFirst({
      where: {
        OR: [
          { emailHmac: this.pii.emailHmacIndex(account) },
          { username: account },
          ...(isPhone ? [{ phoneHmac: this.pii.phoneHmacIndex(formattedPhone) }] : []),
        ],
      },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
        membership: { select: { tierLevel: true, expiresAt: true } },
      },
    });
    const record = this.toUserRecord(raw as any);
    if (!record) return null;
    return {
      ...record,
      membership: raw?.membership ?? null,
    } as UserRecord & { membership?: { tierLevel: number; expiresAt: Date | null } | null };
  }

  async findByPhoneIncludingDeleted(phone: string): Promise<UserRecord | null> {
    // #417：查询走 HMAC 归一化索引列等值匹配（不再读明文列）
    const raw = await this.prisma.user.findFirst({
      where: { phoneHmac: this.pii.phoneHmacIndex(phone) },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async findByWechatIdIncludingDeleted(wechatId: string): Promise<UserRecord | null> {
    const raw = await this.prisma.user.findUnique({
      where: { wechatId },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async create(data: Record<string, unknown>): Promise<UserRecord> {
    // #417 双写：明文列保留至收缩阶段，同步补齐加密列与 HMAC 索引列
    const merged = {
      ...data,
      ...this.pii.derivePiiFields(data as { phone?: string | null; email?: string | null }),
    };
    const raw = await this.prisma.user.create({
      data: merged as any,
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async update(id: string, data: Record<string, unknown>): Promise<UserRecord> {
    // #417 双写：data 含 phone/email 键时同步补齐派生列（null 时清空派生列）
    const merged = {
      ...data,
      ...this.pii.derivePiiFields(data as { phone?: string | null; email?: string | null }),
    };
    const raw = await this.prisma.user.update({
      where: { id },
      data: merged as any,
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async markPhoneVerified(id: string, phone: string): Promise<UserRecord> {
    const raw = await this.prisma.user.update({
      where: { id },
      data: {
        phone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        ...this.pii.derivePiiFields({ phone }),
      },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async markEmailVerified(id: string, email: string): Promise<UserRecord> {
    const raw = await this.prisma.user.update({
      where: { id },
      data: {
        email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        ...this.pii.derivePiiFields({ email }),
      },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }
}
