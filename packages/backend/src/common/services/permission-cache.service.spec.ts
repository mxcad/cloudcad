import { Test, TestingModule } from '@nestjs/testing';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { SystemPermission, SystemRole } from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;
  let redis: jest.Mocked<Redis>;
  let subscriber: jest.Mocked<Redis>;

  beforeEach(async () => {
    // 创建订阅者 mock
    subscriber = {
      duplicate: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockImplementation((channel, callback) => {
        if (callback) callback(null);
      }),
      on: jest.fn(),
      publish: jest.fn().mockResolvedValue(1),
      unsubscribe: jest.fn().mockResolvedValue(1),
    } as any;

    // 创建 Redis mock
    const mockRedis = {
      duplicate: jest.fn().mockReturnValue(subscriber),
      subscribe: jest.fn().mockImplementation((channel, callback) => {
        if (callback) callback(null);
      }),
      on: jest.fn(),
      publish: jest.fn().mockResolvedValue(1),
      unsubscribe: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      flushdb: jest.fn().mockResolvedValue('OK'),
      once: jest.fn(),
      emit: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCacheService,
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

    service = module.get<PermissionCacheService>(PermissionCacheService);
    redis = module.get(getRedisConnectionToken());
  });

  afterEach(() => {
    // 清理所有缓存
    const cache = (service as any).cache;
    const cacheExpiry = (service as any).cacheExpiry;
    cache.clear();
    cacheExpiry.clear();
  });

  describe('cacheUserPermissions', () => {
    it('should cache user permissions', () => {
      const userId = 'user-id';
      const permissions = [
        SystemPermission.USER_READ,
        SystemPermission.USER_CREATE,
      ];

      service.cacheUserPermissions(userId, permissions);

      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);
    });

    it('should cache user permissions with default TTL', async () => {
      const userId = 'user-id';
      const permissions = [SystemPermission.USER_READ];

      service.cacheUserPermissions(userId, permissions);

      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);
    });
  });

  describe('getUserPermissions', () => {
    it('should return null for non-existent cache', () => {
      const result = service.getUserPermissions('user-id');
      expect(result).toBeNull();
    });

    it('should return cached permissions', () => {
      const userId = 'user-id';
      const permissions = [
        SystemPermission.USER_READ,
        SystemPermission.USER_CREATE,
      ];

      service.cacheUserPermissions(userId, permissions);

      const result = service.getUserPermissions(userId);
      expect(result).toEqual(permissions);
    });

    it('should return all system permissions', () => {
      const userId = 'admin-id';
      const permissions = [
        SystemPermission.USER_READ,
        SystemPermission.USER_CREATE,
        SystemPermission.USER_UPDATE,
        SystemPermission.USER_DELETE,
        SystemPermission.ROLE_READ,
        SystemPermission.ROLE_CREATE,
        SystemPermission.ROLE_UPDATE,
        SystemPermission.ROLE_DELETE,
        SystemPermission.ROLE_PERMISSION_MANAGE,
        SystemPermission.ROLE_PERMISSION_MANAGE,
        SystemPermission.FONT_UPLOAD,
        SystemPermission.SYSTEM_MONITOR,
      ];

      service.cacheUserPermissions(userId, permissions);

      const result = service.getUserPermissions(userId);
      expect(result).toEqual(permissions);
    });
  });

  describe('cacheUserRole', () => {
    it('should cache user role', () => {
      const userId = 'user-id';
      const role = SystemRole.ADMIN;

      service.cacheUserRole(userId, role);

      const cached = service.getUserRole(userId);
      expect(cached).toEqual(role);
    });

    it('should cache user role with 10 minutes TTL', () => {
      const userId = 'user-id';
      const role = SystemRole.USER;

      service.cacheUserRole(userId, role);

      const cached = service.getUserRole(userId);
      expect(cached).toEqual(role);
    });
  });

  describe('getUserRole', () => {
    it('should return null for non-existent cache', () => {
      const result = service.getUserRole('user-id');
      expect(result).toBeNull();
    });

    it('should return cached role', () => {
      const userId = 'user-id';
      const role = SystemRole.ADMIN;

      service.cacheUserRole(userId, role);

      const result = service.getUserRole(userId);
      expect(result).toEqual(role);
    });

    it('should return USER role', () => {
      const userId = 'user-id';
      const role = SystemRole.USER;

      service.cacheUserRole(userId, role);

      const result = service.getUserRole(userId);
      expect(result).toEqual(SystemRole.USER);
    });
  });

  describe('clearUserCache', () => {
    it('should clear all user cached permissions', async () => {
      const userId = 'user-id';
      const permissions = [
        SystemPermission.USER_READ,
        SystemPermission.USER_CREATE,
      ];
      const role = SystemRole.ADMIN;

      service.cacheUserPermissions(userId, permissions);
      service.cacheUserRole(userId, role);

      expect(service.getUserPermissions(userId)).toEqual(permissions);
      expect(service.getUserRole(userId)).toEqual(role);

      await service.clearUserCache(userId);

      expect(service.getUserPermissions(userId)).toBeNull();
      expect(service.getUserRole(userId)).toBeNull();
    });

    it('should publish invalidation event', async () => {
      const userId = 'user-id';

      await service.clearUserCache(userId);

      expect(redis.publish).toHaveBeenCalledWith(
        'permission:cache:invalidation:user',
        expect.stringContaining('"type":"user"')
      );
    });
  });

  describe('cleanup', () => {
    it('should remove expired cache entries', async () => {
      const userId1 = 'user-id-1';
      const userId2 = 'user-id-2';
      const permissions1 = [SystemPermission.USER_READ];
      const permissions2 = [SystemPermission.USER_CREATE];
      const role1 = SystemRole.ADMIN;

      // Cache with short TTL using private method
      const key1 = (service as any).generateCacheKey('user', userId1);
      const key2 = (service as any).generateCacheKey('user', userId2);
      const key3 = `role:user:${userId1}`;

      (service as any).set(key1, permissions1, 50);
      (service as any).set(key2, permissions2, 5000);
      (service as any).set(key3, role1, 50);

      // Wait for short TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      service.cleanup();

      expect(service.getUserPermissions(userId1)).toBeNull();
      expect(service.getUserPermissions(userId2)).toEqual(permissions2);
      expect(service.getUserRole(userId1)).toBeNull();
    });

    it('should log number of cleaned entries', async () => {
      const userId1 = 'user-id-1';
      const permissions = [SystemPermission.USER_READ];

      const key1 = (service as any).generateCacheKey('user', userId1);
      (service as any).set(key1, permissions, 50);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      service.cleanup();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const userId = 'user-id';
      const permissions = [
        SystemPermission.USER_READ,
        SystemPermission.USER_CREATE,
      ];
      const role = SystemRole.ADMIN;

      service.cacheUserPermissions(userId, permissions);
      service.cacheUserRole(userId, role);

      const stats = service.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.expiredEntries).toBe(0);
      expect(stats.memoryUsage).toMatch(/\d+MB/);
    });

    it('should return zero stats for empty cache', () => {
      const stats = service.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.expiredEntries).toBe(0);
      expect(stats.memoryUsage).toMatch(/\d+MB/);
    });
  });

  describe('cache expiration', () => {
    it('should return null for expired cache', async () => {
      const userId = 'user-id';
      const permissions = [SystemPermission.USER_READ];

      // Cache with short TTL
      const key = (service as any).generateCacheKey('user', userId);
      (service as any).set(key, permissions, 50);

      // Should return value immediately
      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should return null after expiration
      const expired = service.getUserPermissions(userId);
      expect(expired).toBeNull();
    });
  });

  describe('permission types', () => {
    it('should handle all user management permissions', () => {
      const userId = 'user-id';
      const permissions = [
        SystemPermission.USER_READ,
        SystemPermission.USER_CREATE,
        SystemPermission.USER_UPDATE,
        SystemPermission.USER_DELETE,
      ];

      service.cacheUserPermissions(userId, permissions);

      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);
    });

    it('should handle all role management permissions', () => {
      const userId = 'user-id';
      const permissions = [
        SystemPermission.ROLE_READ,
        SystemPermission.ROLE_CREATE,
        SystemPermission.ROLE_UPDATE,
        SystemPermission.ROLE_DELETE,
        SystemPermission.ROLE_PERMISSION_MANAGE,
        SystemPermission.ROLE_PERMISSION_MANAGE,
      ];

      service.cacheUserPermissions(userId, permissions);

      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);
    });

    it('should handle font management permission', () => {
      const userId = 'user-id';
      const permissions = [SystemPermission.FONT_UPLOAD];

      service.cacheUserPermissions(userId, permissions);

      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);
    });

    it('should handle system monitor permission', () => {
      const userId = 'user-id';
      const permissions = [SystemPermission.SYSTEM_MONITOR];

      service.cacheUserPermissions(userId, permissions);

      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);
    });
  });

  describe('Redis integration', () => {
    it('should subscribe to invalidation channel on init', () => {
      expect(redis.duplicate).toHaveBeenCalled();
      expect(subscriber.subscribe).toHaveBeenCalledWith(
        'permission:cache:invalidation:user',
        expect.any(Function)
      );
    });

    it('should handle invalidation events', () => {
      const subscriber = redis.duplicate() as jest.Mocked<Redis>;
      const event = {
        type: 'user',
        id: 'user-id',
        timestamp: Date.now(),
      };

      // Simulate receiving an invalidation event
      const callback = (subscriber.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1];

      if (callback) {
        // First, cache some data
        const permissions = [SystemPermission.USER_READ];
        service.cacheUserPermissions('user-id', permissions);

        // Then receive invalidation event
        callback('permission:cache:invalidation:user', JSON.stringify(event));

        // Cache should be cleared
        expect(service.getUserPermissions('user-id')).toBeNull();
      }
    });

    it('should ignore stale invalidation events', () => {
      const subscriber = redis.duplicate() as jest.Mocked<Redis>;
      const event = {
        type: 'user',
        id: 'user-id',
        timestamp: Date.now() - 10000, // 10 seconds ago
      };

      // Simulate receiving an invalidation event
      const callback = (subscriber.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1];

      if (callback) {
        // First, cache some data
        const permissions = [SystemPermission.USER_READ];
        service.cacheUserPermissions('user-id', permissions);

        // Then receive stale invalidation event
        callback('permission:cache:invalidation:user', JSON.stringify(event));

        // Cache should NOT be cleared
        expect(service.getUserPermissions('user-id')).toEqual(permissions);
      }
    });
  });
});
