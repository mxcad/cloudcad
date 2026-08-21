import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import type { IRefreshTokenRepository, RefreshTokenRecord } from '@cloudcad/contracts';

@Injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async findValid(token: string, userId: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findFirst({
      where: { token, userId, expiresAt: { gt: new Date() } },
    }) as any;
  }

  async countByUser(userId: string, clientId?: string): Promise<number> {
    const where = clientId !== undefined ? { userId, clientId } : { userId };
    return this.prisma.refreshToken.count({ where });
  }

  async deleteByToken(token: string, userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { token, userId } });
  }

  async deleteByUserId(userId: string, clientId?: string): Promise<void> {
    const where = clientId !== undefined ? { userId, clientId } : { userId };
    await this.prisma.refreshToken.deleteMany({ where });
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { id: { in: ids } } });
  }

  async findOldestExcess(userId: string, clientId: string | null, limit: number): Promise<Array<{ id: string }>> {
    return this.prisma.refreshToken.findMany({
      where: { userId, clientId },
      orderBy: { expiresAt: 'asc' },
      take: limit,
      select: { id: true },
    }) as any;
  }

  async create(data: { token: string; userId: string; expiresAt: Date; clientId?: string | null }): Promise<RefreshTokenRecord> {
    return this.prisma.refreshToken.create({
      data: { token: data.token, userId: data.userId, expiresAt: data.expiresAt, clientId: data.clientId ?? null },
    }) as any;
  }

  async storeRefreshToken(data: { token: string; userId: string; expiresAt: Date; clientId?: string | null }, oldTokenToDelete?: string): Promise<void> {
    const MAX_REFRESH_TOKENS_PER_USER = 10;

    await this.prisma.$transaction(async (tx: any) => {
      if (oldTokenToDelete) {
        await tx.refreshToken.deleteMany({ where: { token: oldTokenToDelete, userId: data.userId } });
      }
      await tx.refreshToken.create({
        data: { token: data.token, userId: data.userId, expiresAt: data.expiresAt, clientId: data.clientId ?? null },
      });
      const count = await tx.refreshToken.count({ where: { userId: data.userId, clientId: data.clientId ?? null } });
      if (count > MAX_REFRESH_TOKENS_PER_USER) {
        const oldest = await tx.refreshToken.findMany({
          where: { userId: data.userId, clientId: data.clientId ?? null },
          orderBy: { expiresAt: 'asc' },
          take: count - MAX_REFRESH_TOKENS_PER_USER,
          select: { id: true },
        });
        if (oldest.length > 0) {
          await tx.refreshToken.deleteMany({ where: { id: { in: oldest.map((r: any) => r.id) } } });
        }
      }
    });
  }
}
