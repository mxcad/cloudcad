import { Test, TestingModule } from '@nestjs/testing';
import {
  NodeAccessRole,
  Permission,
  UserRole,
} from '../enums/permissions.enum';
import { PermissionCacheService } from './permission-cache.service';

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionCacheService],
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
  });

  afterEach(() => {
    // Clear all cache entries
    const cache = (service as any).cache;
    const cacheExpiry = (service as any).cacheExpiry;
    cache.clear();
    cacheExpiry.clear();
  });

  describe('cacheUserPermissions', () => {
    it('should cache user permissions', () => {
      const userId = 'user-id';
      const permissions = [Permission.PROJECT_READ, Permission.PROJECT_WRITE];

      service.cacheUserPermissions(userId, permissions);

      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);
    });

    it('should cache user permissions with TTL', async () => {
      const userId = 'user-id';
      const permissions = [Permission.PROJECT_READ];

      // Use private method to set with custom TTL
      const key = (service as any).generateCacheKey('user', userId);
      (service as any).set(key, permissions, 50);

      const cached = service.getUserPermissions(userId);
      expect(cached).toEqual(permissions);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const expired = service.getUserPermissions(userId);
      expect(expired).toBeNull();
    });
  });

  describe('getUserPermissions', () => {
    it('should return null for non-existent cache', () => {
      const result = service.getUserPermissions('user-id');
      expect(result).toBeNull();
    });

    it('should return cached permissions', () => {
      const userId = 'user-id';
      const permissions = [Permission.PROJECT_READ];

      service.cacheUserPermissions(userId, permissions);

      const result = service.getUserPermissions(userId);
      expect(result).toEqual(permissions);
    });
  });

  describe('cacheNodeAccessRole', () => {
    it('should cache node access role', () => {
      const userId = 'user-id';
      const nodeId = 'node-id';
      const role = NodeAccessRole.OWNER;

      service.cacheNodeAccessRole(userId, nodeId, role);

      const cached = service.getNodeAccessRole(userId, nodeId);
      expect(cached).toEqual(role);
    });

    it('should cache node access role with TTL', async () => {
      const userId = 'user-id';
      const nodeId = 'node-id';
      const role = NodeAccessRole.EDITOR;

      // Use private method to set with custom TTL
      const key = `role:node:${userId}:${nodeId}`;
      (service as any).set(key, role, 50);

      const cached = service.getNodeAccessRole(userId, nodeId);
      expect(cached).toEqual(role);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const expired = service.getNodeAccessRole(userId, nodeId);
      expect(expired).toBeNull();
    });
  });

  describe('getNodeAccessRole', () => {
    it('should return null for non-existent cache', () => {
      const result = service.getNodeAccessRole('user-id', 'node-id');
      expect(result).toBeNull();
    });

    it('should return cached role', () => {
      const userId = 'user-id';
      const nodeId = 'node-id';
      const role = NodeAccessRole.EDITOR;

      service.cacheNodeAccessRole(userId, nodeId, role);

      const result = service.getNodeAccessRole(userId, nodeId);
      expect(result).toEqual(role);
    });
  });

  describe('cacheUserRole', () => {
    it('should cache user role', () => {
      const userId = 'user-id';
      const role = UserRole.ADMIN;

      service.cacheUserRole(userId, role);

      const cached = service.getUserRole(userId);
      expect(cached).toEqual(role);
    });

    it('should cache user role with TTL', async () => {
      const userId = 'user-id';
      const role = UserRole.USER;

      // Use private method to set with custom TTL
      const key = `role:user:${userId}`;
      (service as any).set(key, role, 50);

      const cached = service.getUserRole(userId);
      expect(cached).toEqual(role);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const expired = service.getUserRole(userId);
      expect(expired).toBeNull();
    });
  });

  describe('getUserRole', () => {
    it('should return null for non-existent cache', () => {
      const result = service.getUserRole('user-id');
      expect(result).toBeNull();
    });

    it('should return cached role', () => {
      const userId = 'user-id';
      const role = UserRole.ADMIN;

      service.cacheUserRole(userId, role);

      const result = service.getUserRole(userId);
      expect(result).toEqual(role);
    });
  });

  describe('clearUserCache', () => {
    it('should clear all user cached permissions', () => {
      const userId = 'user-id';
      const nodeId = 'node-id';
      const permissions = [Permission.PROJECT_READ, Permission.FILE_READ];
      const role = NodeAccessRole.OWNER;

      service.cacheUserPermissions(userId, permissions);
      service.cacheNodeAccessRole(userId, nodeId, role);

      expect(service.getUserPermissions(userId)).toEqual(permissions);
      expect(service.getNodeAccessRole(userId, nodeId)).toEqual(role);

      service.clearUserCache(userId);

      expect(service.getUserPermissions(userId)).toBeNull();
      expect(service.getNodeAccessRole(userId, nodeId)).toBeNull();
    });
  });

  describe('clearNodeCache', () => {
    it('should clear node related cache', () => {
      const userId1 = 'user-id-1';
      const userId2 = 'user-id-2';
      const nodeId = 'node-id';
      const role1 = NodeAccessRole.OWNER;
      const role2 = NodeAccessRole.EDITOR;

      service.cacheNodeAccessRole(userId1, nodeId, role1);
      service.cacheNodeAccessRole(userId2, nodeId, role2);

      expect(service.getNodeAccessRole(userId1, nodeId)).toEqual(role1);
      expect(service.getNodeAccessRole(userId2, nodeId)).toEqual(role2);

      service.clearNodeCache(nodeId);

      expect(service.getNodeAccessRole(userId1, nodeId)).toBeNull();
      expect(service.getNodeAccessRole(userId2, nodeId)).toBeNull();
    });
  });

  describe('clearProjectCache', () => {
    it('should clear project cache (deprecated method)', () => {
      const userId = 'user-id';
      const projectId = 'project-id';
      const role = NodeAccessRole.OWNER;

      service.cacheNodeAccessRole(userId, projectId, role);
      expect(service.getNodeAccessRole(userId, projectId)).toEqual(role);

      service.clearProjectCache(projectId);
      expect(service.getNodeAccessRole(userId, projectId)).toBeNull();
    });
  });

  describe('clearFileCache', () => {
    it('should clear file cache (deprecated method)', () => {
      const userId = 'user-id';
      const fileId = 'file-id';
      const role = NodeAccessRole.EDITOR;

      service.cacheNodeAccessRole(userId, fileId, role);
      expect(service.getNodeAccessRole(userId, fileId)).toEqual(role);

      service.clearFileCache(fileId);
      expect(service.getNodeAccessRole(userId, fileId)).toBeNull();
    });
  });

  describe('getFileAccessRole', () => {
    it('should return file access role (deprecated method)', () => {
      const userId = 'user-id';
      const fileId = 'file-id';
      const role = NodeAccessRole.EDITOR;

      service.cacheNodeAccessRole(userId, fileId, role);
      expect(service.getFileAccessRole(userId, fileId)).toEqual(role);
    });
  });

  describe('cleanup', () => {
    it('should remove expired cache entries', async () => {
      const userId = 'user-id';
      const nodeId1 = 'node-id-1';
      const nodeId2 = 'node-id-2';
      const permissions = [Permission.PROJECT_READ, Permission.FILE_READ];
      const role = NodeAccessRole.OWNER;

      // Cache with short TTL using private method
      const key1 = (service as any).generateCacheKey('user', userId);
      const key2 = `role:node:${userId}:${nodeId1}`;
      const key3 = `role:node:${userId}:${nodeId2}`;

      (service as any).set(key1, permissions, 50);
      (service as any).set(key2, role, 50);
      (service as any).set(key3, role, 5000);

      // Wait for short TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      service.cleanup();

      expect(service.getUserPermissions(userId)).toBeNull();
      expect(service.getNodeAccessRole(userId, nodeId1)).toBeNull();
      expect(service.getNodeAccessRole(userId, nodeId2)).toEqual(role);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const userId = 'user-id';
      const nodeId = 'node-id';
      const permissions = [Permission.PROJECT_READ, Permission.FILE_READ];
      const role = NodeAccessRole.OWNER;

      service.cacheUserPermissions(userId, permissions);
      service.cacheNodeAccessRole(userId, nodeId, role);

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