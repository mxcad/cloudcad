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
    scan: jest.fn(),
    get: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Re-establish the default config value — resetMocks: true in jest.config.ts
    // wipes mock implementations, and the constructor reads cacheTTL on init.
    mockConfigService.get.mockReturnValue({ tokenBlacklist: 3600 });
    // Default: scan returns an empty page — prevents a destructure TypeError in
    // getBlacklistStats when resetMocks wipes per-test mockResolvedValueOnce.
    mockRedis.scan.mockResolvedValue(['0', []]);

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

    it('should not throw when Redis setex fails (graceful degradation)', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(service.addToBlacklist(token)).resolves.toBeUndefined();
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

    it('should fail open (return false) when Redis fails', async () => {
      // 刻意 fail-open：写入方是登出/改密/会话转移三条真实路径，作用域只有单个 token，
      // 放行的代价是「一次登出没生效」，远小于 Redis 一抖就全平台拒绝。
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));

      const result = await service.isBlacklisted(token);

      expect(result).toBe(false);
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
    it('should count only token-level entries', async () => {
      mockRedis.scan.mockResolvedValueOnce([
        '0',
        ['token:blacklist:abc', 'token:blacklist:def'],
      ]);

      const result = await service.getBlacklistStats();

      expect(result).toEqual({ totalTokens: 2 });
      expect(Object.keys(result)).toEqual(['totalTokens']);
      // 用户级计数已随 Gitea #484 退役；只扫 token 前缀，别让它被加回来
      expect(mockRedis.scan.mock.calls[0][2]).toBe('token:blacklist:*');
    });

    it('should return zero counts when no entries exist', async () => {
      mockRedis.scan.mockResolvedValue(['0', []]);

      const result = await service.getBlacklistStats();

      expect(result).toEqual({ totalTokens: 0 });
    });

    it('should return zero counts when Redis fails (graceful degradation)', async () => {
      mockRedis.scan.mockRejectedValue(new Error('Redis error'));

      const result = await service.getBlacklistStats();

      expect(result).toEqual({ totalTokens: 0 });
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
