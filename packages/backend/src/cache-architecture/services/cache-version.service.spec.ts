///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { CacheVersionService, CacheVersionType } from './cache-version.service';
import { getRedisToken } from '@nestjs-modules/ioredis';

describe('CacheVersionService', () => {
  let service: CacheVersionService;
  let mockRedis: jest.Mocked<any>;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      publish: jest.fn(),
      duplicate: jest.fn(),
      eval: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheVersionService,
        {
          provide: getRedisToken(),
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

    service = module.get<CacheVersionService>(CacheVersionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getVersion', () => {
    it('should return version info for existing version', async () => {
      const mockVersionInfo = {
        version: 'v1234567890_abc123',
        updatedAt: Date.now(),
        description: 'Test version',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(mockVersionInfo));

      const result = await service.getVersion(
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toEqual(mockVersionInfo);
      expect(mockRedis.get).toHaveBeenCalledWith(
        'cache:version:user_permissions:user-id'
      );
    });

    it('should return null for non-existing version', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getVersion(
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getVersion(
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toBeNull();
    });
  });

  describe('createVersion', () => {
    it('should create a new version', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const version = await service.createVersion(
        CacheVersionType.USER_PERMISSIONS,
        'user-id',
        'Test version'
      );

      expect(version).toMatch(/^v\d+_[a-z0-9]+$/);
      expect(mockRedis.setex).toHaveBeenCalled();
      const data = JSON.parse(String(mockRedis.setex.mock.calls[0][2]));
      expect(data).toMatchObject({
        version,
        description: 'Test version',
      });
    });

    it('should create a version without key', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const version = await service.createVersion(
        CacheVersionType.USER_PERMISSIONS,
        undefined,
        'Global version'
      );

      expect(version).toMatch(/^v\d+_[a-z0-9]+$/);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'cache:version:user_permissions:global',
        expect.any(String),
        expect.any(String)
      );
    });

    it('should generate unique version IDs', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const version1 = await service.createVersion(
        CacheVersionType.USER_PERMISSIONS
      );
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      const version2 = await service.createVersion(
        CacheVersionType.USER_PERMISSIONS
      );

      expect(version1).not.toBe(version2);
    });
  });

  describe('updateVersion', () => {
    it('should create a new version (alias for createVersion)', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const version = await service.updateVersion(
        CacheVersionType.USER_PERMISSIONS,
        'user-id',
        'Updated version'
      );

      expect(version).toMatch(/^v\d+_[a-z0-9]+$/);
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('deleteVersion', () => {
    it('should delete a version', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.deleteVersion(CacheVersionType.USER_PERMISSIONS, 'user-id');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'cache:version:user_permissions:user-id'
      );
    });

    it('should handle delete errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.deleteVersion(CacheVersionType.USER_PERMISSIONS, 'user-id')
      ).resolves.not.toThrow();
    });
  });

  describe('deleteVersions', () => {
    it('should delete multiple versions', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.deleteVersions(CacheVersionType.USER_PERMISSIONS, [
        'user-1',
        'user-2',
        'user-3',
      ]);

      expect(mockRedis.del).toHaveBeenCalledTimes(3);
    });
  });

  describe('isVersionExpired', () => {
    it('should return true for expired version', async () => {
      const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          version: 'v123',
          updatedAt: oldTimestamp,
        })
      );

      const result = await service.isVersionExpired(
        CacheVersionType.USER_PERMISSIONS,
        'user-id',
        5 * 60 * 1000 // 5 minutes max age
      );

      expect(result).toBe(true);
    });

    it('should return false for fresh version', async () => {
      const freshTimestamp = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          version: 'v123',
          updatedAt: freshTimestamp,
        })
      );

      const result = await service.isVersionExpired(
        CacheVersionType.USER_PERMISSIONS,
        'user-id',
        5 * 60 * 1000 // 5 minutes max age
      );

      expect(result).toBe(false);
    });

    it('should return true for non-existing version', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isVersionExpired(
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toBe(true);
    });
  });

  describe('getVersionedKey', () => {
    it('should return versioned key with existing version', async () => {
      const mockVersionInfo = {
        version: 'v1234567890_abc123',
        updatedAt: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(mockVersionInfo));

      const result = await service.getVersionedKey(
        'user:permissions',
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toBe('user:permissions:v1234567890_abc123');
    });

    it('should create new version and return versioned key', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await service.getVersionedKey(
        'user:permissions',
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toMatch(/^user:permissions:v\d+_[a-z0-9]+$/);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should return original key on error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getVersionedKey(
        'user:permissions',
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toBe('user:permissions');
    });
  });

  describe('validateKey', () => {
    it('should return true for valid versioned key', async () => {
      const mockVersionInfo = {
        version: 'v1234567890_abc123',
        updatedAt: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(mockVersionInfo));

      const result = await service.validateKey(
        'user:permissions:v1234567890_abc123',
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toBe(true);
    });

    it('should return false for invalid versioned key', async () => {
      const mockVersionInfo = {
        version: 'v1234567890_abc123',
        updatedAt: Date.now(),
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(mockVersionInfo));

      const result = await service.validateKey(
        'user:permissions:v9999999999_xyz999',
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toBe(false);
    });

    it('should return false when version does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.validateKey(
        'user:permissions:v1234567890_abc123',
        CacheVersionType.USER_PERMISSIONS,
        'user-id'
      );

      expect(result).toBe(false);
    });
  });

  describe('getAllVersions', () => {
    it('should return all versions for a type', async () => {
      mockRedis.keys.mockResolvedValue([
        'cache:version:user_permissions:user-1',
        'cache:version:user_permissions:user-2',
      ]);
      mockRedis.get
        .mockResolvedValueOnce(
          JSON.stringify({
            version: 'v1',
            updatedAt: Date.now(),
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            version: 'v2',
            updatedAt: Date.now(),
          })
        );

      const result = await service.getAllVersions(
        CacheVersionType.USER_PERMISSIONS
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        key: 'user-1',
        version: 'v1',
      });
      expect(result[1]).toMatchObject({
        key: 'user-2',
        version: 'v2',
      });
    });

    it('should return empty array when no versions exist', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const result = await service.getAllVersions(
        CacheVersionType.USER_PERMISSIONS
      );

      expect(result).toEqual([]);
    });
  });

  describe('cleanupExpiredVersions', () => {
    it('should clean up expired versions', async () => {
      const oldTimestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      const freshTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago

      mockRedis.keys.mockResolvedValue([
        'cache:version:user_permissions:user-1',
        'cache:version:user_permissions:user-2',
      ]);
      mockRedis.get
        .mockResolvedValueOnce(
          JSON.stringify({
            version: 'v1',
            updatedAt: oldTimestamp,
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            version: 'v2',
            updatedAt: freshTimestamp,
          })
        );
      mockRedis.del.mockResolvedValue(1);

      const result = await service.cleanupExpiredVersions(
        CacheVersionType.USER_PERMISSIONS,
        60 * 60 * 1000 // 1 hour max age
      );

      expect(result).toBe(1);
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
    });

    it('should not clean up fresh versions', async () => {
      const freshTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago

      mockRedis.keys.mockResolvedValue([
        'cache:version:user_permissions:user-1',
      ]);
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          version: 'v1',
          updatedAt: freshTimestamp,
        })
      );

      const result = await service.cleanupExpiredVersions(
        CacheVersionType.USER_PERMISSIONS,
        60 * 60 * 1000 // 1 hour max age
      );

      expect(result).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('cache version types', () => {
    it('should handle all cache version types', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const types = [
        CacheVersionType.USER_PERMISSIONS,
        CacheVersionType.USER_ROLE,
        CacheVersionType.PROJECT_PERMISSIONS,
        CacheVersionType.PROJECT_MEMBERS,
        CacheVersionType.ROLE_PERMISSIONS,
        CacheVersionType.SYSTEM_CONFIG,
      ];

      for (const type of types) {
        const version = await service.createVersion(type);
        expect(version).toMatch(/^v\d+_[a-z0-9]+$/);
      }
    });
  });

  describe('concurrent version creation', () => {
    it('should handle concurrent version creation with lock', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      // Create multiple versions concurrently
      const promises = Array(10)
        .fill(null)
        .map(() => service.createVersion(CacheVersionType.USER_PERMISSIONS));

      const versions = await Promise.all(promises);

      // All versions should be unique
      const uniqueVersions = new Set(versions);
      expect(uniqueVersions.size).toBe(versions.length);
    });
  });
});
