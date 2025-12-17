import { Test, TestingModule } from '@nestjs/testing';
import { Permission } from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionCacheService],
    }).setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() }).compile();

    service = module.get<PermissionCacheService>(PermissionCacheService);
  });

  afterEach(() => {
    // Clear all cache entries
    const cache = (service as any).cache;
    const cacheExpiry = (service as any).cacheExpiry;
    cache.clear();
    cacheExpiry.clear();
  });

  describe('cacheProjectPermissions', () => {
    it('should cache project permissions', () => {
      const userId = 'user-id';
      const projectId = 'project-id';
      const permissions = [Permission.PROJECT_READ, Permission.PROJECT_WRITE];

      service.cacheProjectPermissions(userId, projectId, permissions);

      const cached = service.getProjectPermissions(userId, projectId);
      expect(cached).toEqual(permissions);
    });

    it('should cache project permissions with TTL', async () => {
      const userId = 'user-id';
      const projectId = 'project-id';
      const permissions = [Permission.PROJECT_READ];

      // Use private method to set with custom TTL
      const key = (service as any).generateCacheKey(
        'project',
        userId,
        projectId
      );
      (service as any).set(key, permissions, 50);

      const cached = service.getProjectPermissions(userId, projectId);
      expect(cached).toEqual(permissions);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const expired = service.getProjectPermissions(userId, projectId);
      expect(expired).toBeNull();
    });
  });

  describe('getProjectPermissions', () => {
    it('should return null for non-existent cache', () => {
      const result = service.getProjectPermissions('user-id', 'project-id');
      expect(result).toBeNull();
    });

    it('should return cached permissions', () => {
      const userId = 'user-id';
      const projectId = 'project-id';
      const permissions = [Permission.PROJECT_READ];

      service.cacheProjectPermissions(userId, projectId, permissions);

      const result = service.getProjectPermissions(userId, projectId);
      expect(result).toEqual(permissions);
    });
  });

  describe('invalidateProjectPermissions', () => {
    it('should clear user project permissions cache', () => {
      const userId = 'user-id';
      const projectId = 'project-id';
      const permissions = [Permission.PROJECT_READ];

      service.cacheProjectPermissions(userId, projectId, permissions);
      expect(service.getProjectPermissions(userId, projectId)).toEqual(
        permissions
      );

      service.clearUserCache(userId);
      expect(service.getProjectPermissions(userId, projectId)).toBeNull();
    });
  });

  describe('cacheFilePermissions', () => {
    it('should cache file permissions', () => {
      const userId = 'user-id';
      const fileId = 'file-id';
      const permissions = [Permission.FILE_READ, Permission.FILE_WRITE];

      service.cacheFilePermissions(userId, fileId, permissions);

      const cached = service.getFilePermissions(userId, fileId);
      expect(cached).toEqual(permissions);
    });

    it('should cache file permissions with TTL', async () => {
      const userId = 'user-id';
      const fileId = 'file-id';
      const permissions = [Permission.FILE_READ];

      // Use private method to set with custom TTL
      const key = (service as any).generateCacheKey('file', userId, fileId);
      (service as any).set(key, permissions, 50);

      const cached = service.getFilePermissions(userId, fileId);
      expect(cached).toEqual(permissions);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const expired = service.getFilePermissions(userId, fileId);
      expect(expired).toBeNull();
    });
  });

  describe('getFilePermissions', () => {
    it('should return null for non-existent cache', () => {
      const result = service.getFilePermissions('user-id', 'file-id');
      expect(result).toBeNull();
    });

    it('should return cached permissions', () => {
      const userId = 'user-id';
      const fileId = 'file-id';
      const permissions = [Permission.FILE_READ];

      service.cacheFilePermissions(userId, fileId, permissions);

      const result = service.getFilePermissions(userId, fileId);
      expect(result).toEqual(permissions);
    });
  });

  describe('invalidateFilePermissions', () => {
    it('should clear user file permissions cache', () => {
      const userId = 'user-id';
      const fileId = 'file-id';
      const permissions = [Permission.FILE_READ];

      service.cacheFilePermissions(userId, fileId, permissions);
      expect(service.getFilePermissions(userId, fileId)).toEqual(permissions);

      service.clearUserCache(userId);
      expect(service.getFilePermissions(userId, fileId)).toBeNull();
    });
  });

  describe('clearUserCache', () => {
    it('should clear all user cached permissions', () => {
      const userId = 'user-id';
      const projectId = 'project-id';
      const fileId = 'file-id';
      const permissions = [Permission.PROJECT_READ, Permission.FILE_READ];

      service.cacheProjectPermissions(userId, projectId, permissions);
      service.cacheFilePermissions(userId, fileId, permissions);

      expect(service.getProjectPermissions(userId, projectId)).toEqual(
        permissions
      );
      expect(service.getFilePermissions(userId, fileId)).toEqual(permissions);

      service.clearUserCache(userId);

      expect(service.getProjectPermissions(userId, projectId)).toBeNull();
      expect(service.getFilePermissions(userId, fileId)).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove expired cache entries', async () => {
      const userId = 'user-id';
      const projectId = 'project-id';
      const fileId = 'file-id';
      const permissions = [Permission.PROJECT_READ, Permission.FILE_READ];

      // Cache with short TTL using private method
      const key1 = (service as any).generateCacheKey(
        'project',
        userId,
        projectId
      );
      const key2 = (service as any).generateCacheKey('file', userId, fileId);
      const key3 = (service as any).generateCacheKey(
        'project',
        userId,
        'project-id-2'
      );
      const key4 = (service as any).generateCacheKey(
        'file',
        userId,
        'file-id-2'
      );

      (service as any).set(key1, permissions, 50);
      (service as any).set(key2, permissions, 50);
      (service as any).set(key3, permissions, 5000);
      (service as any).set(key4, permissions, 5000);

      // Wait for short TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      service.cleanup();

      expect(service.getProjectPermissions(userId, projectId)).toBeNull();
      expect(service.getFilePermissions(userId, fileId)).toBeNull();
      expect(service.getProjectPermissions(userId, 'project-id-2')).toEqual(
        permissions
      );
      expect(service.getFilePermissions(userId, 'file-id-2')).toEqual(
        permissions
      );
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const userId = 'user-id';
      const projectId = 'project-id';
      const fileId = 'file-id';
      const permissions = [Permission.PROJECT_READ, Permission.FILE_READ];

      service.cacheProjectPermissions(userId, projectId, permissions);
      service.cacheFilePermissions(userId, fileId, permissions);

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
});

