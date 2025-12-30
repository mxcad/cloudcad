import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { NODE_PERMISSION_KEY } from '../decorators/project-permission.decorator';
import { NodeAccessRole } from '../enums/permissions.enum';
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
    avatar: undefined,
    role: 'USER',
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    const mockPermissionService = {
      hasNodeAccessRole: jest.fn(),
    } as any;

    const mockCacheService = {
      getNodeAccessRole: jest.fn(),
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
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

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
        NODE_PERMISSION_KEY,
        [mockContext.getHandler(), mockContext.getClass()]
      );
    });

    it('should return true when user has required node role', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      // Add projectId to params
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasNodeAccessRole).toHaveBeenCalledWith(
        mockUser,
        'project-id',
        [NodeAccessRole.EDITOR]
      );
      expect(mockRequest.nodeId).toBe('project-id');
    });

    it('should throw ForbiddenException when user is not authenticated', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);

      // Remove user from request
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.user = null;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '用户未认证'
      );
    });

    it('should throw BadRequestException when nodeId is missing', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        BadRequestException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '缺少节点ID参数'
      );
    });

    it('should throw ForbiddenException when user lacks required node role', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.OWNER]);
      permissionService.hasNodeAccessRole.mockResolvedValue(false);

      // Add projectId to params
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '用户没有足够的节点访问权限'
      );
    });

    it('should extract nodeId from route parameters', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasNodeAccessRole).toHaveBeenCalledWith(
        mockUser,
        'route-project-id',
        [NodeAccessRole.EDITOR]
      );
    });

    it('should extract nodeId from query parameters', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.projectId = 'query-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasNodeAccessRole).toHaveBeenCalledWith(
        mockUser,
        'query-project-id',
        [NodeAccessRole.EDITOR]
      );
    });

    it('should extract nodeId from request body', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.projectId = 'body-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasNodeAccessRole).toHaveBeenCalledWith(
        mockUser,
        'body-project-id',
        [NodeAccessRole.EDITOR]
      );
    });

    it('should prioritize route params over query and body', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasNodeAccessRole).toHaveBeenCalledWith(
        mockUser,
        'route-project-id',
        [NodeAccessRole.EDITOR]
      );
    });

    it('should handle multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        NodeAccessRole.OWNER,
        NodeAccessRole.EDITOR,
      ]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasNodeAccessRole).toHaveBeenCalledWith(
        mockUser,
        'project-id',
        [NodeAccessRole.OWNER, NodeAccessRole.EDITOR]
      );
    });

    it('should work with owner role', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.OWNER]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasNodeAccessRole).toHaveBeenCalledWith(
        mockUser,
        'project-id',
        [NodeAccessRole.OWNER]
      );
    });

    it('should work with viewer role', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.VIEWER]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasNodeAccessRole).toHaveBeenCalledWith(
        mockUser,
        'project-id',
        [NodeAccessRole.VIEWER]
      );
    });
  });

  describe('extractNodeId', () => {
    it('should extract nodeId from params when available', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractNodeId'](mockRequest)).toBe('route-project-id');
    });

    it('should extract nodeId from query when params not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractNodeId'](mockRequest)).toBe('query-project-id');
    });

    it('should extract nodeId from body when params and query not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractNodeId'](mockRequest)).toBe('body-project-id');
    });

    it('should return null when nodeId not found anywhere', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);

      const mockRequest = mockContext.switchToHttp().getRequest();

      expect(guard['extractNodeId'](mockRequest)).toBeNull();
    });

    it('should handle empty strings', async () => {
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = '';
      mockRequest.query.projectId = '';
      mockRequest.body.projectId = '';

      expect(guard['extractNodeId'](mockRequest)).toBe('');
    });

    it('should handle null/undefined values', async () => {
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = null;
      mockRequest.query.projectId = undefined;
      mockRequest.body.projectId = null;

      expect(guard['extractNodeId'](mockRequest)).toBeNull();
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
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockRejectedValue(
        new Error('Permission service error')
      );

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Permission service error'
      );
    });

    it('should handle permission service returning rejection', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockRejectedValue(
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
    it('should allow node owner access to owner-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.OWNER]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should deny node editor access to owner-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.OWNER]);
      permissionService.hasNodeAccessRole.mockResolvedValue(false);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should allow node editor access to editor endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        NodeAccessRole.OWNER,
        NodeAccessRole.EDITOR,
      ]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should set nodeId in request object when access is granted', async () => {
      reflector.getAllAndOverride.mockReturnValue([NodeAccessRole.EDITOR]);
      permissionService.hasNodeAccessRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await guard.canActivate(mockContext);

      expect(mockRequest.nodeId).toBe('project-id');
    });
  });
});
