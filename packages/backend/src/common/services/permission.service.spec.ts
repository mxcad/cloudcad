import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { SystemPermission, SystemRole } from '../enums/permissions.enum';
import {
  PermissionService,
  UserWithPermissions,
  Role,
} from './permission.service';
import { PermissionCacheService } from './permission-cache.service';
import { AuditLogService } from '../../audit/audit-log.service';

describe('PermissionService', () => {
  let service: PermissionService;
  let mockPrisma: any;
  let cacheService: jest.Mocked<PermissionCacheService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockRole: Role = {
    id: 'role-id',
    name: SystemRole.USER,
    description: '普通用户',
    category: 'SYSTEM',
    isSystem: true,
    permissions: [
      { permission: SystemPermission.USER_READ },
      { permission: SystemPermission.FONT_UPLOAD },
    ],
  };

  const mockAdminRole: Role = {
    id: 'admin-role-id',
    name: SystemRole.ADMIN,
    description: '系统管理员',
    category: 'SYSTEM',
    isSystem: true,
    permissions: [
      { permission: SystemPermission.USER_READ },
      { permission: SystemPermission.USER_CREATE },
      { permission: SystemPermission.USER_UPDATE },
      { permission: SystemPermission.USER_DELETE },
      { permission: SystemPermission.ROLE_READ },
      { permission: SystemPermission.ROLE_CREATE },
      { permission: SystemPermission.ROLE_UPDATE },
      { permission: SystemPermission.ROLE_DELETE },
      { permission: SystemPermission.ROLE_PERMISSION_MANAGE },
      { permission: SystemPermission.ROLE_PERMISSION_MANAGE },
      { permission: SystemPermission.FONT_UPLOAD },
      { permission: SystemPermission.SYSTEM_MONITOR },
    ],
  };

  const mockUser: UserWithPermissions = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: undefined,
    role: mockRole,
    status: 'ACTIVE',
  };

  const mockAdminUser: UserWithPermissions = {
    ...mockUser,
    role: mockAdminRole,
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      clearUserCache: jest.fn(),
    } as any;

    const mockAuditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
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
    cacheService = module.get(
      PermissionCacheService
    ) as jest.Mocked<PermissionCacheService>;
    auditLogService = module.get(
      AuditLogService
    ) as jest.Mocked<AuditLogService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSystemPermission', () => {
    it('should return true for admin user with any permission', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: SystemRole.ADMIN },
      });

      const result = await service.checkSystemPermission(
        'admin-id',
        SystemPermission.USER_DELETE
      );

      expect(result).toBe(true);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should return true for user with specific permission', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockRole,
      });

      const result = await service.checkSystemPermission(
        'user-id',
        SystemPermission.USER_READ
      );

      expect(result).toBe(true);
      expect(cacheService.set).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should return false for user without permission', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockRole,
      });

      const result = await service.checkSystemPermission(
        'user-id',
        SystemPermission.USER_DELETE
      );

      expect(result).toBe(false);
      expect(cacheService.set).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should return true when cache hit', async () => {
      cacheService.get.mockReturnValue(true);

      const result = await service.checkSystemPermission(
        'user-id',
        SystemPermission.USER_READ
      );

      expect(result).toBe(true);
      expect(cacheService.get).toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should return false when cache hit with false value', async () => {
      cacheService.get.mockReturnValue(false);

      const result = await service.checkSystemPermission(
        'user-id',
        SystemPermission.USER_DELETE
      );

      expect(result).toBe(false);
      expect(cacheService.get).toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should return false when user does not exist', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.checkSystemPermission(
        'invalid-user-id',
        SystemPermission.USER_READ
      );

      expect(result).toBe(false);
    });

    it('should return false when user has no role', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: null,
      });

      const result = await service.checkSystemPermission(
        'user-id',
        SystemPermission.USER_READ
      );

      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await service.checkSystemPermission(
        'user-id',
        SystemPermission.USER_READ
      );

      expect(result).toBe(false);
      expect(auditLogService.log).toHaveBeenCalled();
    });
  });

  describe('checkSystemPermissionWithContext', () => {
    it('should return true when user has permission and context rules pass', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockRole,
      });

      const context = {
        time: new Date('2024-01-01T10:00:00Z'),
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const result = await service.checkSystemPermissionWithContext(
        'user-id',
        SystemPermission.USER_READ,
        context
      );

      expect(result).toBe(true);
    });

    it('should return false when user does not have permission', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockRole,
      });

      const context = {
        time: new Date('2024-01-01T10:00:00Z'),
      };

      const result = await service.checkSystemPermissionWithContext(
        'user-id',
        SystemPermission.USER_DELETE,
        context
      );

      expect(result).toBe(false);
    });

    it('should return false when sensitive operation is outside working hours', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockAdminRole,
      });

      const context = {
        time: new Date('2024-01-01T20:00:00Z'), // 20:00, outside 9-18
        ipAddress: '192.168.1.1',
      };

      const result = await service.checkSystemPermissionWithContext(
        'admin-id',
        SystemPermission.USER_DELETE,
        context
      );

      expect(result).toBe(false);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should allow sensitive operation during working hours', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockAdminRole,
      });

      // 使用本地时间，确保在工作时间内（9:00 - 18:00）
      const workTime = new Date();
      workTime.setHours(10, 0, 0, 0); // 设置为 10:00

      const context = {
        time: workTime,
        ipAddress: '192.168.1.1',
      };

      const result = await service.checkSystemPermissionWithContext(
        'admin-id',
        SystemPermission.USER_DELETE,
        context
      );

      expect(result).toBe(true);
    });

    it('should allow non-sensitive operations outside working hours', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockRole,
      });

      const context = {
        time: new Date('2024-01-01T20:00:00Z'),
        ipAddress: '192.168.1.1',
      };

      const result = await service.checkSystemPermissionWithContext(
        'user-id',
        SystemPermission.USER_READ,
        context
      );

      expect(result).toBe(true);
    });
  });

  describe('getUserPermissions', () => {
    it('should return user permissions', async () => {
      const result = await service.getUserPermissions(mockUser);

      expect(result).toContain(SystemPermission.USER_READ);
      expect(result).toContain(SystemPermission.FONT_UPLOAD);
    });

    it('should return empty array for user without role', async () => {
      const userWithoutRole: UserWithPermissions = {
        ...mockUser,
        role: null as any,
      };

      const result = await service.getUserPermissions(userWithoutRole);

      expect(result).toEqual([]);
    });

    it('should return empty array for user without permissions', async () => {
      const userWithoutPermissions: UserWithPermissions = {
        ...mockUser,
        role: { ...mockRole, permissions: [] },
      };

      const result = await service.getUserPermissions(userWithoutPermissions);

      expect(result).toEqual([]);
    });
  });

  describe('hasRole', () => {
    it('should return true when user has required role', () => {
      const result = service.hasRole(mockUser, [SystemRole.USER]);

      expect(result).toBe(true);
    });

    it('should return true when user has one of multiple required roles', () => {
      const result = service.hasRole(mockUser, [
        SystemRole.ADMIN,
        SystemRole.USER,
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user does not have required role', () => {
      const result = service.hasRole(mockUser, [SystemRole.ADMIN]);

      expect(result).toBe(false);
    });

    it('should return false when user has no role', () => {
      const userWithoutRole: UserWithPermissions = {
        ...mockUser,
        role: null as any,
      };

      const result = service.hasRole(userWithoutRole, [SystemRole.ADMIN]);

      expect(result).toBe(false);
    });
  });

  describe('clearUserCache', () => {
    it('should clear user cache', async () => {
      await service.clearUserCache('user-id');

      expect(cacheService.clearUserCache).toHaveBeenCalledWith('user-id');
    });
  });

  describe('cache behavior', () => {
    it('should cache admin check result', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: { name: SystemRole.ADMIN },
      });

      // First call - should check database
      await service.checkSystemPermission(
        'admin-id',
        SystemPermission.USER_READ
      );

      // Second call - should use cache
      cacheService.get.mockReturnValue(true);
      await service.checkSystemPermission(
        'admin-id',
        SystemPermission.USER_READ
      );

      // Database should only be called once for the first request
      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should cache permission check result', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockRole,
      });

      // First call - should check database and set cache
      await service.checkSystemPermission(
        'user-id',
        SystemPermission.USER_READ
      );

      // Reset all mocks after first call
      jest.clearAllMocks();

      // Set cache to return cached value for second call
      cacheService.get.mockReturnValue(true);

      // Second call - should use cache
      await service.checkSystemPermission(
        'user-id',
        SystemPermission.USER_READ
      );

      // Database should not be called again
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('permission types', () => {
    it('should handle all user management permissions', async () => {
      const userPermissions = [
        SystemPermission.USER_READ,
        SystemPermission.USER_CREATE,
        SystemPermission.USER_UPDATE,
        SystemPermission.USER_DELETE,
      ];

      for (const permission of userPermissions) {
        cacheService.get.mockReturnValue(null);
        mockPrisma.user.findUnique.mockResolvedValue({
          role: mockAdminRole,
        });

        const result = await service.checkSystemPermission(
          'admin-id',
          permission
        );
        expect(result).toBe(true);
      }
    });

    it('should handle all role management permissions', async () => {
      const rolePermissions = [
        SystemPermission.ROLE_READ,
        SystemPermission.ROLE_CREATE,
        SystemPermission.ROLE_UPDATE,
        SystemPermission.ROLE_DELETE,
        SystemPermission.ROLE_PERMISSION_MANAGE,
        SystemPermission.ROLE_PERMISSION_MANAGE,
      ];

      for (const permission of rolePermissions) {
        cacheService.get.mockReturnValue(null);
        mockPrisma.user.findUnique.mockResolvedValue({
          role: mockAdminRole,
        });

        const result = await service.checkSystemPermission(
          'admin-id',
          permission
        );
        expect(result).toBe(true);
      }
    });

    it('should handle font management permission', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockRole,
      });

      const result = await service.checkSystemPermission(
        'user-id',
        SystemPermission.FONT_UPLOAD
      );

      expect(result).toBe(true);
    });

    it('should handle system monitor permission', async () => {
      cacheService.get.mockReturnValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: mockAdminRole,
      });

      const result = await service.checkSystemPermission(
        'admin-id',
        SystemPermission.SYSTEM_MONITOR
      );

      expect(result).toBe(true);
    });
  });
});
