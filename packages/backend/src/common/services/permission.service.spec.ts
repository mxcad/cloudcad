import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import {
  FILE_ACCESS_PERMISSIONS,
  FileAccessRole,
  Permission,
  PROJECT_MEMBER_PERMISSIONS,
  ProjectMemberRole,
  ROLE_PERMISSIONS,
  UserRole,
} from '../enums/permissions.enum';
import { PermissionService, UserWithPermissions } from './permission.service';
import { PermissionCacheService } from './permission-cache.service';

describe('PermissionService', () => {
  let service: PermissionService;
  let prisma: jest.Mocked<DatabaseService>;
  let cacheService: jest.Mocked<PermissionCacheService>;

  const mockUser: UserWithPermissions = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: undefined,
    role: UserRole.USER,
    status: 'ACTIVE',
  };

  const mockAdminUser: UserWithPermissions = {
    ...mockUser,
    role: UserRole.ADMIN,
  };

  const mockProjectMember = {
    userId: 'user-id',
    projectId: 'project-id',
    role: ProjectMemberRole.MEMBER,
  };

  const mockFileAccess = {
    userId: 'user-id',
    fileId: 'file-id',
    role: FileAccessRole.EDITOR,
  };

  const mockFile = {
    id: 'file-id',
    ownerId: 'user-id',
    projectId: 'project-id',
  };

  beforeEach(async () => {
    const mockPrisma = {
      projectMember: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      fileAccess: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      file: {
        findUnique: jest.fn(),
      },
    } as any;

    const mockCacheService = {
      getProjectPermissions: jest.fn(),
      cacheProjectPermissions: jest.fn(),
      getFilePermissions: jest.fn(),
      cacheFilePermissions: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: PermissionCacheService,
          useValue: mockCacheService,
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

    service = module.get<PermissionService>(PermissionService);
    prisma = module.get(DatabaseService);
    cacheService = module.get(PermissionCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hasPermission', () => {
    it('should return true for admin user with any permission', async () => {
      const result = await service.hasPermission(
        mockAdminUser,
        Permission.USER_DELETE
      );

      expect(result).toBe(true);
    });

    it('should return true for user with role-based permission', async () => {
      const result = await service.hasPermission(
        mockUser,
        Permission.PROJECT_CREATE
      );

      expect(result).toBe(true);
    });

    it('should return false for user without permission', async () => {
      const result = await service.hasPermission(
        mockUser,
        Permission.USER_DELETE
      );

      expect(result).toBe(false);
    });

    it('should return false when resourceId provided as project/file permissions are migrated', async () => {
      const result = await service.hasPermission(
        mockUser,
        Permission.PROJECT_DELETE,
        { projectId: 'project-id' }
      );

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      // 创建一个无效的用户对象来触发错�?      const invalidUser = { ...mockUser, role: null as any };

      const result = await service.hasPermission(
        invalidUser,
        Permission.PROJECT_READ
      );

      expect(result).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true when user has required role', () => {
      const result = service.hasRole(mockUser, [UserRole.USER]);

      expect(result).toBe(true);
    });

    it('should return true when user has one of multiple required roles', () => {
      const result = service.hasRole(mockUser, [UserRole.ADMIN, UserRole.USER]);

      expect(result).toBe(true);
    });

    it('should return false when user does not have required role', () => {
      const result = service.hasRole(mockUser, [UserRole.ADMIN]);

      expect(result).toBe(false);
    });
  });

  describe('hasProjectRole', () => {
    it('should return false as method is deprecated', async () => {
      const result = await service.hasProjectRole(mockUser, 'project-id', [
        ProjectMemberRole.MEMBER,
      ]);

      expect(result).toBe(false);
    });
  });

  describe('getProjectPermissions', () => {
    it('should return empty array as method is deprecated', async () => {
      const result = await service.getProjectPermissions(
        mockUser,
        'project-id'
      );

      expect(result).toEqual([]);
    });
  });

  describe('getFilePermissions', () => {
    it('should return empty array as method is deprecated', async () => {
      const result = await service.getFilePermissions(mockUser, 'file-id');

      expect(result).toEqual([]);
    });
  });

  describe('checkProjectPermission', () => {
    it('should return false as method is deprecated', async () => {
      const result = await service.checkProjectPermission(
        mockUser,
        'project-id',
        Permission.PROJECT_READ
      );

      expect(result).toBe(false);
    });
  });

  describe('checkFilePermission', () => {
    it('should return false as method is deprecated', async () => {
      const result = await service.checkFilePermission(
        mockUser,
        'file-id',
        Permission.FILE_READ
      );

      expect(result).toBe(false);
    });
  });
});
