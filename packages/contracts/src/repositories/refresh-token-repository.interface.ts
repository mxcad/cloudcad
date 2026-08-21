import type { RefreshTokenRecord } from '../domain/user.types';

export const REFRESH_TOKEN_REPOSITORY = 'REFRESH_TOKEN_REPOSITORY';

export interface IRefreshTokenRepository {
  findValid(token: string, userId: string): Promise<RefreshTokenRecord | null>;
  countByUser(userId: string, clientId?: string): Promise<number>;
  deleteByToken(token: string, userId: string): Promise<void>;
  deleteByUserId(userId: string, clientId?: string): Promise<void>;
  deleteByIds(ids: string[]): Promise<void>;
  findOldestExcess(userId: string, clientId: string | null, limit: number): Promise<Array<{ id: string }>>;
  create(data: { token: string; userId: string; expiresAt: Date; clientId?: string | null }): Promise<RefreshTokenRecord>;
  storeRefreshToken(data: { token: string; userId: string; expiresAt: Date; clientId?: string | null }, oldTokenToDelete?: string): Promise<void>;
}
