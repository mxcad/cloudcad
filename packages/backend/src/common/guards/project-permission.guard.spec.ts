import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PROJECT_PERMISSION_KEY } from '../decorators/project-permission.decorator';
import { ProjectMemberRole } from '../enums/permissions.enum';
import { PermissionCacheService } from '../services/permission-cache.service';
import {
  PermissionService,
  UserWithPermissions,
} from '../services/permission.service';
import { ProjectPermissionGuard } from './project-permission.guard';

describe('ProjectPermissionGuard', () => {
  let guard: ProjectPermissionGuard;
  let reflector: jest.Mocked<Reflector>;
  let permissionService: jest.Mocked<PermissionService>;
  let cacheService: jest.Mocked<PermissionCacheService>;
  let mockContext: ExecutionContext;

  const mockUser: UserWithPermissions = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: null,
    role: 'USER',
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    const mockPermissionService = {
      hasProjectRole: jest.fn(),
    } as any;

    const mockCacheService = {
      getProjectMemberRole: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectPermissionGuard,
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
      ],
    }).setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() }).compile();

    guard = module.get<ProjectPermissionGuard>(ProjectPermissionGuard);
    reflector = module.get(Reflector);
    permissionService = module.get(PermissionService);
    cacheService = module.get(PermissionCacheService);

    // Create mock execution context
    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: mockUser,
          params: {},
          query: {},
          body: {},
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
    it('should return true when no project permissions are required', async () => {
      reflector.getAllAndOverride.mockReturnValue(null);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        PROJECT_PERMISSION_KEY,
        [mockContext.getHandler(), mockContext.getClass()]
      );
    });

    it('should return true when user has required project role', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      // Add projectId to params
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasProjectRole).toHaveBeenCalledWith(
        mockUser,
        'project-id',
        [ProjectMemberRole.MEMBER]
      );
      expect(mockRequest.projectId).toBe('project-id');
    });

    it('should throw ForbiddenException when user is not authenticated', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);

      // Remove user from request
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.user = null;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '用户未认�?
      );
    });

    it('should throw BadRequestException when projectId is missing', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        BadRequestException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '缺少项目ID参数'
      );
    });

    it('should throw ForbiddenException when user lacks required project role', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.ADMIN]);
      permissionService.hasProjectRole.mockResolvedValue(false);

      // Add projectId to params
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '用户没有足够的项目权�?
      );
    });

    it('should extract projectId from route parameters', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasProjectRole).toHaveBeenCalledWith(
        mockUser,
        'route-project-id',
        [ProjectMemberRole.MEMBER]
      );
    });

    it('should extract projectId from query parameters', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.projectId = 'query-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasProjectRole).toHaveBeenCalledWith(
        mockUser,
        'query-project-id',
        [ProjectMemberRole.MEMBER]
      );
    });

    it('should extract projectId from request body', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.projectId = 'body-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasProjectRole).toHaveBeenCalledWith(
        mockUser,
        'body-project-id',
        [ProjectMemberRole.MEMBER]
      );
    });

    it('should prioritize route params over query and body', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasProjectRole).toHaveBeenCalledWith(
        mockUser,
        'route-project-id',
        [ProjectMemberRole.MEMBER]
      );
    });

    it('should handle multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        ProjectMemberRole.ADMIN,
        ProjectMemberRole.OWNER,
      ]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasProjectRole).toHaveBeenCalledWith(
        mockUser,
        'project-id',
        [ProjectMemberRole.ADMIN, ProjectMemberRole.OWNER]
      );
    });

    it('should work with owner role', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.OWNER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasProjectRole).toHaveBeenCalledWith(
        mockUser,
        'project-id',
        [ProjectMemberRole.OWNER]
      );
    });

    it('should work with viewer role', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.VIEWER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasProjectRole).toHaveBeenCalledWith(
        mockUser,
        'project-id',
        [ProjectMemberRole.VIEWER]
      );
    });
  });

  describe('extractProjectId', () => {
    it('should extract projectId from params when available', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractProjectId'](mockRequest)).toBe('route-project-id');
    });

    it('should extract projectId from query when params not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractProjectId'](mockRequest)).toBe('query-project-id');
    });

    it('should extract projectId from body when params and query not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractProjectId'](mockRequest)).toBe('body-project-id');
    });

    it('should return null when projectId not found anywhere', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);

      const mockRequest = mockContext.switchToHttp().getRequest();

      expect(guard['extractProjectId'](mockRequest)).toBeNull();
    });

    it('should handle empty strings', async () => {
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = '';
      mockRequest.query.projectId = '';
      mockRequest.body.projectId = '';

      expect(guard['extractProjectId'](mockRequest)).toBe('');
    });

    it('should handle null/undefined values', async () => {
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = null;
      mockRequest.query.projectId = undefined;
      mockRequest.body.projectId = null;

      expect(guard['extractProjectId'](mockRequest)).toBeNull();
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
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockRejectedValue(
        new Error('Permission service error')
      );

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Permission service error'
      );
    });

    it('should handle permission service returning rejection', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockRejectedValue(
        new ForbiddenException('Access denied')
      );

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('integration scenarios', () => {
    it('should allow project owner access to owner-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.OWNER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should deny project member access to owner-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.OWNER]);
      permissionService.hasProjectRole.mockResolvedValue(false);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should allow project admin access to admin endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.ADMIN]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        ProjectMemberRole.ADMIN,
        ProjectMemberRole.OWNER,
      ]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should set projectId in request object when access is granted', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectMemberRole.MEMBER]);
      permissionService.hasProjectRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await guard.canActivate(mockContext);

      expect(mockRequest.projectId).toBe('project-id');
    });
  });
});

