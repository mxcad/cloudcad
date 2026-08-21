import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import type { IUserRepository, UserRecord } from '@cloudcad/contracts';

@Injectable()
export class UserRepository implements IUserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(private readonly prisma: DatabaseService) {}

  private toUserRecord(raw: any): UserRecord {
    if (!raw) return null;
    return {
      id: raw.id,
      email: raw.email ?? null,
      username: raw.username,
      nickname: raw.nickname ?? null,
      avatar: raw.avatar ?? null,
      password: raw.password ?? null,
      phone: raw.phone ?? null,
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
    const raw = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
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
    const raw = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
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
    const raw = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: account },
          { username: account },
          ...(isPhone ? [{ phone: formattedPhone }] : []),
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
    const raw = await this.prisma.user.findFirst({
      where: { phone },
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
    const raw = await this.prisma.user.create({
      data: data as any,
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async update(id: string, data: Record<string, unknown>): Promise<UserRecord> {
    const raw = await this.prisma.user.update({
      where: { id },
      data: data as any,
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async markPhoneVerified(id: string, phone: string): Promise<UserRecord> {
    const raw = await this.prisma.user.update({
      where: { id },
      data: { phone, phoneVerified: true, phoneVerifiedAt: new Date() },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }

  async markEmailVerified(id: string, email: string): Promise<UserRecord> {
    const raw = await this.prisma.user.update({
      where: { id },
      data: { email, emailVerified: true, emailVerifiedAt: new Date() },
      include: {
        role: { select: { id: true, name: true, description: true, isSystem: true, permissions: { select: { permission: true } } } },
      },
    });
    return this.toUserRecord(raw as any);
  }
}
