import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { TokenBlacklistService } from './token-blacklist.service';
import { Redis } from 'ioredis';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let redis: Redis;
  let configService: ConfigService;

  const mockRedis = {
    on: jest.fn(),
    setex: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    quit: jest.fn().mockResolvedValue('OK'),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'REDIS_HOST': 'localhost',
        'REDIS_PORT': 6379,
        'REDIS_PASSWORD': '',
        'REDIS_DB': 0,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRedisConnectionToken(),
          useValue: mockRedis,
        },
      ],
    })
    .setLogger({
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    })
    .compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
    redis = module.get<Redis>(getRedisConnectionToken());
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should set up Redis event listeners', () => {
      service.onModuleInit();
      
      expect(redis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(redis.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  describe('addToBlacklist', () => {
    const testToken = 'test.jwt.token';

    it('should add token to blacklist with default TTL', async () => {
      await service.addToBlacklist(testToken);

      expect(redis.setex).toHaveBeenCalledWith(
        `token:blacklist:${testToken}`,
        7 * 24 * 60 * 60, // 7 days
        '1'
      );
    });

    it('should add token to blacklist with custom TTL', async () => {
      const customTTL = 3600; // 1 hour
      await service.addToBlacklist(testToken, customTTL);

      expect(redis.setex).toHaveBeenCalledWith(
        `token:blacklist:${testToken}`,
        customTTL,
        '1'
      );
    });

    it('should throw error when Redis operation fails', async () => {
      const errorMessage = 'Redis connection failed';
      mockRedis.setex.mockRejectedValueOnce(new Error(errorMessage));

      await expect(service.addToBlacklist(testToken)).rejects.toThrow(errorMessage);
    });
  });

  describe('isBlacklisted', () => {
    const testToken = 'test.jwt.token';

    it('should return false when token is not blacklisted', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.isBlacklisted(testToken);

      expect(result).toBe(false);
      expect(redis.exists).toHaveBeenCalledWith(`token:blacklist:${testToken}`);
    });

    it('should return true when token is blacklisted', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await service.isBlacklisted(testToken);

      expect(result).toBe(true);
      expect(redis.exists).toHaveBeenCalledWith(`token:blacklist:${testToken}`);
    });

    it('should return false when Redis operation fails (graceful degradation)', async () => {
      mockRedis.exists.mockRejectedValueOnce(new Error('Redis error'));

      const result = await service.isBlacklisted(testToken);

      expect(result).toBe(false);
    });
  });

  describe('blacklistUserTokens', () => {
    const userId = 'user123';

    it('should add user to blacklist', async () => {
      await service.blacklistUserTokens(userId);

      expect(redis.setex).toHaveBeenCalledWith(
        `user:blacklist:${userId}`,
        7 * 24 * 60 * 60,
        '1'
      );
    });

    it('should throw error when Redis operation fails', async () => {
      const errorMessage = 'Redis connection failed';
      mockRedis.setex.mockRejectedValueOnce(new Error(errorMessage));

      await expect(service.blacklistUserTokens(userId)).rejects.toThrow(errorMessage);
    });
  });

  describe('isUserBlacklisted', () => {
    const userId = 'user123';

    it('should return false when user is not blacklisted', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.isUserBlacklisted(userId);

      expect(result).toBe(false);
      expect(redis.exists).toHaveBeenCalledWith(`user:blacklist:${userId}`);
    });

    it('should return true when user is blacklisted', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await service.isUserBlacklisted(userId);

      expect(result).toBe(true);
      expect(redis.exists).toHaveBeenCalledWith(`user:blacklist:${userId}`);
    });

    it('should return false when Redis operation fails (graceful degradation)', async () => {
      mockRedis.exists.mockRejectedValueOnce(new Error('Redis error'));

      const result = await service.isUserBlacklisted(userId);

      expect(result).toBe(false);
    });
  });

  describe('removeFromBlacklist', () => {
    const testToken = 'test.jwt.token';

    it('should remove token from blacklist', async () => {
      await service.removeFromBlacklist(testToken);

      expect(redis.del).toHaveBeenCalledWith(`token:blacklist:${testToken}`);
    });

    it('should throw error when Redis operation fails', async () => {
      const errorMessage = 'Redis connection failed';
      mockRedis.del.mockRejectedValueOnce(new Error(errorMessage));

      await expect(service.removeFromBlacklist(testToken)).rejects.toThrow(errorMessage);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should log current blacklist count', async () => {
      const mockKeys = ['token:blacklist:token1', 'token:blacklist:token2'];
      mockRedis.keys.mockResolvedValue(mockKeys);

      await service.cleanupExpiredTokens();

      expect(redis.keys).toHaveBeenCalledWith('token:blacklist:*');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.keys.mockRejectedValueOnce(new Error('Redis error'));

      await expect(service.cleanupExpiredTokens()).resolves.not.toThrow();
    });
  });

  describe('getBlacklistStats', () => {
    it('should return blacklist statistics', async () => {
      mockRedis.keys
        .mockResolvedValueOnce(['token:blacklist:token1', 'token:blacklist:token2'])
        .mockResolvedValueOnce(['user:blacklist:user1']);

      const result = await service.getBlacklistStats();

      expect(result).toEqual({
        totalTokens: 2,
        blacklistedUsers: 1,
      });
    });

    it('should return zero stats when Redis operation fails', async () => {
      mockRedis.keys.mockRejectedValueOnce(new Error('Redis error'));

      const result = await service.getBlacklistStats();

      expect(result).toEqual({
        totalTokens: 0,
        blacklistedUsers: 0,
      });
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit Redis connection', async () => {
      await service.onModuleDestroy();

      expect(redis.quit).toHaveBeenCalled();
    });
  });
});