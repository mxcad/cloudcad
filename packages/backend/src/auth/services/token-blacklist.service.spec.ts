///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from './token-blacklist.service';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue({ tokenBlacklist: 3600 }),
  };

  const mockRedis = {
    setex: jest.fn(),
    exists: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    get: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Re-establish the default config value — resetMocks: true in jest.config.ts
    // wipes mock implementations, and the constructor reads cacheTTL on init.
    mockConfigService.get.mockReturnValue({ tokenBlacklist: 3600 });
    // Default: keys returns empty array — prevents TypeError in getBlacklistStats
    // when resetMocks wipes per-test mockResolvedValueOnce before it runs.
    mockRedis.keys.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // addToBlacklist
  // =========================================================================

  describe('addToBlacklist', () => {
    const token = 'jwt-token-abc123';
    const expiresIn = 7200;

    it('should add token to blacklist with provided expiresIn', async () => {
      await service.addToBlacklist(token, expiresIn);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'token:blacklist:jwt-token-abc123',
        7200,
        '1'
      );
    });

    it('should use default TTL when expiresIn not provided', async () => {
      mockConfigService.get.mockReturnValue({ tokenBlacklist: 3600 });

      await service.addToBlacklist(token);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'token:blacklist:jwt-token-abc123',
        3600,
        '1'
      );
    });

    it('should throw error when Redis setex fails', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(service.addToBlacklist(token)).rejects.toThrow('Redis error');
    });
  });

  // =========================================================================
  // isBlacklisted
  // =========================================================================

  describe('isBlacklisted', () => {
    const token = 'jwt-token-blacklisted';

    it('should return true when token is in blacklist', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await service.isBlacklisted(token);

      expect(mockRedis.exists).toHaveBeenCalledWith('token:blacklist:jwt-token-blacklisted');
      expect(result).toBe(true);
    });

    it('should return false when token is not in blacklist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.isBlacklisted(token);

      expect(result).toBe(false);
    });

    it('should return false when Redis fails (graceful degradation)', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const result = await service.isBlacklisted(token);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // blacklistUserTokens
  // =========================================================================

  describe('blacklistUserTokens', () => {
    const userId = 'user-001';

    it('should set user blacklist key in Redis', async () => {
      await service.blacklistUserTokens(userId);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'user:blacklist:user-001',
        3600,
        '1'
      );
    });

    it('should throw error when Redis setex fails', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(service.blacklistUserTokens(userId)).rejects.toThrow('Redis error');
    });
  });

  // =========================================================================
  // isUserBlacklisted
  // =========================================================================

  describe('isUserBlacklisted', () => {
    const userId = 'user-001';

    it('should return true when user is blacklisted', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await service.isUserBlacklisted(userId);

      expect(mockRedis.exists).toHaveBeenCalledWith('user:blacklist:user-001');
      expect(result).toBe(true);
    });

    it('should return false when user is not blacklisted', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.isUserBlacklisted(userId);

      expect(result).toBe(false);
    });

    it('should return false when Redis fails (graceful degradation)', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const result = await service.isUserBlacklisted(userId);

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // removeUserFromBlacklist
  // =========================================================================

  describe('removeUserFromBlacklist', () => {
    const userId = 'user-001';

    it('should delete user blacklist key from Redis', async () => {
      await service.removeUserFromBlacklist(userId);

      expect(mockRedis.del).toHaveBeenCalledWith('user:blacklist:user-001');
    });

    it('should throw error when Redis del fails', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      await expect(service.removeUserFromBlacklist(userId)).rejects.toThrow('Redis error');
    });
  });

  // =========================================================================
  // removeFromBlacklist
  // =========================================================================

  describe('removeFromBlacklist', () => {
    const token = 'jwt-token-to-remove';

    it('should delete token from Redis blacklist', async () => {
      await service.removeFromBlacklist(token);

      expect(mockRedis.del).toHaveBeenCalledWith('token:blacklist:jwt-token-to-remove');
    });

    it('should throw error when Redis del fails', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      await expect(service.removeFromBlacklist(token)).rejects.toThrow('Redis error');
    });
  });

  // =========================================================================
  // getBlacklistStats
  // =========================================================================

  describe('getBlacklistStats', () => {
    it('should return counts of blacklisted tokens and users', async () => {
      mockRedis.keys
        .mockResolvedValueOnce(['token:blacklist:abc', 'token:blacklist:def'])
        .mockResolvedValueOnce(['user:blacklist:u1', 'user:blacklist:u2', 'user:blacklist:u3']);

      const result = await service.getBlacklistStats();

      expect(result).toEqual({ totalTokens: 2, blacklistedUsers: 3 });
    });

    it('should return zero counts when no entries exist', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const result = await service.getBlacklistStats();

      expect(result).toEqual({ totalTokens: 0, blacklistedUsers: 0 });
    });

    it('should return zero counts when Redis fails (graceful degradation)', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const result = await service.getBlacklistStats();

      expect(result).toEqual({ totalTokens: 0, blacklistedUsers: 0 });
    });
  });

  // =========================================================================
  // setTempData / getTempData / deleteTempData
  // =========================================================================

  describe('setTempData', () => {
    const key = 'temp-key';
    const value = 'temp-value';
    const ttl = 600;

    it('should store temporary data in Redis with TTL', async () => {
      await service.setTempData(key, value, ttl);

      expect(mockRedis.setex).toHaveBeenCalledWith(key, ttl, value);
    });

    it('should throw error when Redis setex fails', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(service.setTempData(key, value, ttl)).rejects.toThrow('Redis error');
    });
  });

  describe('getTempData', () => {
    const key = 'temp-key';

    it('should return value when key exists', async () => {
      mockRedis.get.mockResolvedValue('stored-value');

      const result = await service.getTempData(key);

      expect(result).toBe('stored-value');
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getTempData(key);

      expect(result).toBeNull();
    });

    it('should return null when Redis fails (graceful degradation)', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getTempData(key);

      expect(result).toBeNull();
    });
  });

  describe('deleteTempData', () => {
    const key = 'temp-key';

    it('should delete key from Redis', async () => {
      await service.deleteTempData(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });

    it('should not throw when Redis fails (silent failure)', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      await expect(service.deleteTempData(key)).resolves.toBeUndefined();
    });
  });
});
