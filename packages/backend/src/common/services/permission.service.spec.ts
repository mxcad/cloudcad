import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import {
  NodeAccessRole,
  Permission,
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

  const mockNode = {
    id: 'node-id',
    ownerId: 'owner-id',
    deletedAt: null,
  };

  const mockFileAccess = {
    userId: 'user-id',
    nodeId: 'node-id',
    role: NodeAccessRole.EDITOR,
  };

  beforeEach(async () => {
    const mockPrisma = {
      fileSystemNode: {
        findUnique: jest.fn(),
      },
      fileAccess: {
        findUnique: jest.fn(),
      },
    } as any;

    const mockCacheService = {
      getNodeAccessRole: jest.fn(),
      cacheNodeAccessRole: jest.fn(),
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

    it('should check node permission when nodeId is provided', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(NodeAccessRole.EDITOR);

      const result = await service.hasPermission(
        mockUser,
        Permission.FILE_WRITE,
        { nodeId: 'node-id' }
      );

      expect(result).toBe(true);
    });

    it('should return false when node permission check fails', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(null);

      const result = await service.hasPermission(
        mockUser,
        Permission.PROJECT_DELETE, // 使用用户没有的权限
        { nodeId: 'node-id' }
      );

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const invalidUser = { ...mockUser, role: null as any };

      const result = await service.hasPermission(
        invalidUser,
        Permission.PROJECT_READ
      );

      expect(result).toBe(false);
    });
  });

  describe('checkNodePermission', () => {
    it('should return true when user has node role with required permission', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(NodeAccessRole.EDITOR);

      const result = await service.checkNodePermission(
        mockUser,
        'node-id',
        Permission.FILE_WRITE
      );

      expect(result).toBe(true);
    });

    it('should return false when user has no role on node', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(null);

      const result = await service.checkNodePermission(
        mockUser,
        'node-id',
        Permission.FILE_READ
      );

      expect(result).toBe(false);
    });

    it('should return false when node does not exist', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(null);
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);

      const result = await service.checkNodePermission(
        mockUser,
        'node-id',
        Permission.FILE_READ
      );

      expect(result).toBe(false);
    });

    it('should return false when node is deleted', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(null);
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        ...mockNode,
        deletedAt: new Date(),
      });

      const result = await service.checkNodePermission(
        mockUser,
        'node-id',
        Permission.FILE_READ
      );

      expect(result).toBe(false);
    });
  });

  describe('getNodeAccessRole', () => {
    it('should return OWNER when user is node owner', async () => {
      const ownerNode = { ...mockNode, ownerId: 'user-id' };
      prisma.fileSystemNode.findUnique.mockResolvedValue(ownerNode);

      const result = await service.getNodeAccessRole('user-id', 'node-id');

      expect(result).toBe(NodeAccessRole.OWNER);
      expect(cacheService.cacheNodeAccessRole).toHaveBeenCalledWith(
        'user-id',
        'node-id',
        NodeAccessRole.OWNER
      );
    });

    it('should return role from FileAccess when user is not owner', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      prisma.fileAccess.findUnique.mockResolvedValue(mockFileAccess);

      const result = await service.getNodeAccessRole('user-id', 'node-id');

      expect(result).toBe(NodeAccessRole.EDITOR);
      expect(cacheService.cacheNodeAccessRole).toHaveBeenCalledWith(
        'user-id',
        'node-id',
        NodeAccessRole.EDITOR
      );
    });

    it('should return null when node does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);

      const result = await service.getNodeAccessRole('user-id', 'node-id');

      expect(result).toBeNull();
    });

    it('should return cached role when available', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(NodeAccessRole.EDITOR);

      const result = await service.getNodeAccessRole('user-id', 'node-id');

      expect(result).toBe(NodeAccessRole.EDITOR);
      expect(prisma.fileSystemNode.findUnique).not.toHaveBeenCalled();
    });

    it('should return null when user has no access', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      prisma.fileAccess.findUnique.mockResolvedValue(null);

      const result = await service.getNodeAccessRole('user-id', 'node-id');

      expect(result).toBeNull();
    });
  });

  describe('hasNodeAccessRole', () => {
    it('should return true when user has one of required roles', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(NodeAccessRole.EDITOR);

      const result = await service.hasNodeAccessRole(mockUser, 'node-id', [
        NodeAccessRole.EDITOR,
        NodeAccessRole.OWNER,
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user has none of required roles', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(NodeAccessRole.VIEWER);

      const result = await service.hasNodeAccessRole(mockUser, 'node-id', [
        NodeAccessRole.EDITOR,
        NodeAccessRole.OWNER,
      ]);

      expect(result).toBe(false);
    });

    it('should return false when user has no role', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(null);

      const result = await service.hasNodeAccessRole(mockUser, 'node-id', [
        NodeAccessRole.EDITOR,
      ]);

      expect(result).toBe(false);
    });
  });

  describe('getNodePermissions', () => {
    it('should return permissions for node role', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(NodeAccessRole.EDITOR);

      const result = await service.getNodePermissions('user-id', 'node-id');

      expect(result).toContain(Permission.FILE_READ);
      expect(result).toContain(Permission.FILE_WRITE);
    });

    it('should return empty array when user has no role', async () => {
      cacheService.getNodeAccessRole.mockReturnValue(null);

      const result = await service.getNodePermissions('user-id', 'node-id');

      expect(result).toEqual([]);
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

  describe('getUserPermissions', () => {
    it('should return permissions for user role', async () => {
      const result = await service.getUserPermissions(mockUser);

      expect(result).toContain(Permission.PROJECT_CREATE);
      expect(result).toContain(Permission.PROJECT_READ);
    });

    it('should return empty array for invalid user role', async () => {
      const invalidUser = { ...mockUser, role: 'INVALID' as UserRole };

      const result = await service.getUserPermissions(invalidUser);

      expect(result).toEqual([]);
    });
  });
});
