import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SystemRole } from '../enums/permissions.enum';
import { PermissionCacheService } from '../services/permission-cache.service';
import { RolesCacheService } from '../services/roles-cache.service';
import {
  PermissionService,
  UserWithPermissions,
} from '../services/permission.service';
import { RolesGuard } from './roles.guard';

export interface Role {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isSystem: boolean;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;
  let permissionService: jest.Mocked<PermissionService>;
  let cacheService: jest.Mocked<PermissionCacheService>;
  let rolesCacheService: jest.Mocked<RolesCacheService>;
  let mockContext: ExecutionContext;

  const mockUser: UserWithPermissions = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: undefined,
    role: {
      id: 'user-role-id',
      name: SystemRole.USER,
      description: '普通用户',
      category: 'SYSTEM',
      isSystem: true,
    },
    status: 'ACTIVE',
  };

  const mockAdminUser: UserWithPermissions = {
    ...mockUser,
    role: {
      id: 'admin-role-id',
      name: SystemRole.ADMIN,
      description: '系统管理员',
      category: 'SYSTEM',
      isSystem: true,
    },
  };

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    const mockPermissionService = {
      hasRole: jest.fn(),
    } as any;

    const mockCacheService = {
      getUserRole: jest.fn(),
      cacheUserRole: jest.fn(),
    } as any;

    const mockRolesCacheService = {
      getRoleId: jest.fn(),
      getSystemRoleNames: jest.fn(),
      isSystemRole: jest.fn(),
      refresh: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: PermissionService,
          useValue: mockPermissionService,
        },
        {
          provide: PermissionCacheService,
          useValue: mockCacheService,
        },
        {
          provide: RolesCacheService,
          useValue: mockRolesCacheService,
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

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);
    permissionService = module.get(PermissionService);
    cacheService = module.get(PermissionCacheService);
    rolesCacheService = module.get(RolesCacheService);

    // Create mock execution context
    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: mockUser,
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should return true when no roles are required', async () => {
      reflector.getAllAndOverride.mockReturnValue(null);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        mockContext.getHandler(),
        mockContext.getClass(),
      ]);
    });

    it('should return true when user has required role', async () => {
      reflector.getAllAndOverride.mockReturnValue([SystemRole.USER]);
      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasRole).toHaveBeenCalledWith(mockUser, [
        SystemRole.USER,
      ]);
    });

    it('should return true when admin user has required admin role', async () => {
      // Update context to have admin user
      mockContext.switchToHttp().getRequest().user = mockAdminUser;

      reflector.getAllAndOverride.mockReturnValue([SystemRole.ADMIN]);
      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasRole).toHaveBeenCalledWith(mockAdminUser, [
        SystemRole.ADMIN,
      ]);
    });

    it('should return false when user does not have required role', async () => {
      reflector.getAllAndOverride.mockReturnValue([SystemRole.ADMIN]);
      permissionService.hasRole.mockReturnValue(false);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(false);
      expect(permissionService.hasRole).toHaveBeenCalledWith(mockUser, [
        SystemRole.ADMIN,
      ]);
    });

    it('should return true when user has one of multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        SystemRole.ADMIN,
        SystemRole.USER,
      ]);
      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasRole).toHaveBeenCalledWith(mockUser, [
        SystemRole.ADMIN,
        SystemRole.USER,
      ]);
    });

    it('should return false when user has none of multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        SystemRole.ADMIN,
        SystemRole.USER,
      ]);
      permissionService.hasRole.mockReturnValue(false);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(false);
    });

    it('should return false when no user is present in request', async () => {
      // Update context to have no user
      mockContext.switchToHttp().getRequest().user = null;

      reflector.getAllAndOverride.mockReturnValue([SystemRole.USER]);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(false);
      expect(permissionService.hasRole).not.toHaveBeenCalled();
    });

    it('should return false when user is undefined', async () => {
      // Update context to have undefined user
      mockContext.switchToHttp().getRequest().user = undefined;

      reflector.getAllAndOverride.mockReturnValue([SystemRole.USER]);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(false);
      expect(permissionService.hasRole).not.toHaveBeenCalled();
    });

    it('should handle empty roles array', async () => {
      reflector.getAllAndOverride.mockReturnValue([]);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasRole).not.toHaveBeenCalled();
    });

    it('should work with class-level role metadata', async () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === ROLES_KEY) {
          // Simulate getting roles from class when handler returns undefined
          return [SystemRole.USER];
        }
        return null;
      });

      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        mockContext.getHandler(),
        mockContext.getClass(),
      ]);
    });

    it('should work with method-level role metadata', async () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === ROLES_KEY) {
          // Simulate getting roles from handler when class returns undefined
          return [SystemRole.ADMIN];
        }
        return null;
      });

      // Update user to admin for this test
      mockContext.switchToHttp().getRequest().user = mockAdminUser;
      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should prioritize method-level roles over class-level roles', async () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === ROLES_KEY) {
          // Simulate method roles taking precedence
          return [SystemRole.USER]; // Method level
        }
        return null;
      });

      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasRole).toHaveBeenCalledWith(mockUser, [
        SystemRole.USER,
      ]);
    });
  });

  describe('error handling', () => {
    it('should handle errors in reflector gracefully', async () => {
      reflector.getAllAndOverride.mockImplementation(() => {
        throw new Error('Reflector error');
      });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Reflector error'
      );
    });

    it('should handle errors in permission service gracefully', async () => {
      reflector.getAllAndOverride.mockReturnValue([SystemRole.USER]);
      permissionService.hasRole.mockImplementation(() => {
        throw new Error('Permission service error');
      });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Permission service error'
      );
    });
  });

  describe('integration scenarios', () => {
    it('should allow admin access to admin-only endpoints', async () => {
      mockContext.switchToHttp().getRequest().user = mockAdminUser;
      reflector.getAllAndOverride.mockReturnValue([SystemRole.ADMIN]);
      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should deny user access to admin-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([SystemRole.ADMIN]);
      permissionService.hasRole.mockReturnValue(false);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(false);
    });

    it('should allow user access to user-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([SystemRole.USER]);
      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should deny admin access to user-only endpoints if not configured', async () => {
      mockContext.switchToHttp().getRequest().user = mockAdminUser;
      reflector.getAllAndOverride.mockReturnValue([SystemRole.USER]);
      permissionService.hasRole.mockReturnValue(false);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(false);
    });

    it('should allow access to endpoints requiring multiple roles if user has any', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        SystemRole.USER,
        SystemRole.ADMIN,
      ]);
      permissionService.hasRole.mockReturnValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });
  });
});
