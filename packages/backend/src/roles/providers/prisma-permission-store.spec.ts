///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPermissionStore } from './prisma-permission-store';
import { DatabaseService } from '../../database/database.service';
import { PermissionCacheService } from '../../permission/services/permission-cache.service';
import { RoleInheritanceService } from '../../permission/services/role-inheritance.service';
import { ProjectPermission, ProjectRole } from '../../common/enums/permissions.enum';

describe('PrismaPermissionStore', () => {
  let store: PrismaPermissionStore;

  const mockPrisma = {
    projectMember: {
      findUnique: jest.fn(),
    },
    fileSystemNode: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clearUserCache: jest.fn(),
    clearProjectCache: jest.fn(),
  };

  const mockRoleInheritanceService = {
    getRolePermissions: jest.fn(),
    checkUserPermissionWithInheritance: jest.fn(),
    clearRoleCache: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaPermissionStore,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockCacheService },
        { provide: RoleInheritanceService, useValue: mockRoleInheritanceService },
      ],
    }).compile();

    store = module.get<PrismaPermissionStore>(PrismaPermissionStore);
  });

  it('should be defined', () => {
    expect(store).toBeDefined();
  });

  describe('getUserProjectPermissions', () => {
    it('should return role permissions for normal project member', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: {
          permissions: [
            { permission: ProjectPermission.FILE_OPEN },
            { permission: ProjectPermission.FILE_DELETE },
          ],
        },
      });

      const result = await store.getUserProjectPermissions('user1', 'project1');

      expect(result).toEqual([
        ProjectPermission.FILE_OPEN,
        ProjectPermission.FILE_DELETE,
      ]);
      // 成员行存在时不触发私人空间兜底查询
      expect(mockPrisma.fileSystemNode.findUnique).not.toHaveBeenCalled();
    });

    it('should return all project permissions for personal space owner', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: 'PERSONAL_SPACE',
        ownerId: 'user1',
      });

      const result = await store.getUserProjectPermissions('user1', 'ps1');

      expect(result).toEqual(Object.values(ProjectPermission));
      expect(result).toContain(ProjectPermission.FILE_DELETE);
      expect(result).toContain(ProjectPermission.FILE_MOVE);
      expect(result).toContain(ProjectPermission.FILE_COPY);
    });

    it('should return empty array for personal space non-owner', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: 'PERSONAL_SPACE',
        ownerId: 'other-user',
      });

      const result = await store.getUserProjectPermissions('user1', 'ps1');

      expect(result).toEqual([]);
    });

    it('should return empty array when member missing and node is not personal space', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: 'PROJECT',
        ownerId: 'user1',
      });

      const result = await store.getUserProjectPermissions('user1', 'project1');

      expect(result).toEqual([]);
    });
  });

  describe('getUserProjectRole', () => {
    it('should return role name for normal project member', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        projectRole: { name: ProjectRole.EDITOR },
      });

      const result = await store.getUserProjectRole('user1', 'project1');

      expect(result).toBe(ProjectRole.EDITOR);
    });

    it('should return OWNER for personal space owner', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: 'PERSONAL_SPACE',
        ownerId: 'user1',
      });

      const result = await store.getUserProjectRole('user1', 'ps1');

      expect(result).toBe(ProjectRole.OWNER);
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should return null for personal space non-owner', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: 'PERSONAL_SPACE',
        ownerId: 'other-user',
      });

      const result = await store.getUserProjectRole('user1', 'ps1');

      expect(result).toBeNull();
    });
  });

  describe('checkProjectPermission', () => {
    it('should return true for personal space owner (via getUserProjectPermissions)', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: 'PERSONAL_SPACE',
        ownerId: 'user1',
      });

      const result = await store.checkProjectPermission(
        'user1',
        'ps1',
        ProjectPermission.FILE_DELETE
      );

      expect(result).toBe(true);
    });

    it('should return false for personal space non-owner', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: 'PERSONAL_SPACE',
        ownerId: 'other-user',
      });

      const result = await store.checkProjectPermission(
        'user1',
        'ps1',
        ProjectPermission.FILE_DELETE
      );

      expect(result).toBe(false);
    });
  });
});
