import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { NODE_PERMISSION_KEY } from '../decorators/project-permission.decorator';
import { ProjectRole } from '../enums/permissions.enum';
import { ProjectPermissionService } from '../../roles/project-permission.service';
import { ProjectPermissionGuard } from './project-permission.guard';

export interface Role {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isSystem: boolean;
}

export interface UserWithPermissions {
  id: string;
  email: string;
  username: string;
  nickname?: string;
  avatar?: string;
  role: Role;
  status: string;
}

describe('ProjectPermissionGuard', () => {
  let guard: ProjectPermissionGuard;
  let reflector: jest.Mocked<Reflector>;
  let projectPermissionService: jest.Mocked<ProjectPermissionService>;
  let mockContext: ExecutionContext;

  const mockUser: UserWithPermissions = {
    id: 'user-id',
    email: 'test@example.com',
    username: 'testuser',
    nickname: 'Test User',
    avatar: undefined,
    role: {
      id: 'role-id',
      name: 'USER',
      description: '普通用户',
      category: 'SYSTEM',
      isSystem: true,
    },
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    const mockProjectPermissionService = {
      hasRole: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectPermissionGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: ProjectPermissionService,
          useValue: mockProjectPermissionService,
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
    projectPermissionService = module.get(ProjectPermissionService);

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

    it('should return true when user has required project role', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      // Add projectId to params
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(projectPermissionService.hasRole).toHaveBeenCalledWith(
        mockUser.id,
        'project-id',
        [ProjectRole.EDITOR]
      );
    });

    it('should throw ForbiddenException when user is not authenticated', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);

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

    it('should throw BadRequestException when projectId is missing', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        BadRequestException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '缺少项目ID参数'
      );
    });

    it('should throw ForbiddenException when user lacks required project role', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.OWNER]);
      projectPermissionService.hasRole.mockResolvedValue(false);

      // Add projectId to params
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '您没有权限执行此操作'
      );
    });

    it('should extract projectId from route parameters', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(projectPermissionService.hasRole).toHaveBeenCalledWith(
        mockUser.id,
        'route-project-id',
        [ProjectRole.EDITOR]
      );
    });

    it('should extract projectId from query parameters', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.projectId = 'query-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(projectPermissionService.hasRole).toHaveBeenCalledWith(
        mockUser.id,
        'query-project-id',
        [ProjectRole.EDITOR]
      );
    });

    it('should extract projectId from request body', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.projectId = 'body-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(projectPermissionService.hasRole).toHaveBeenCalledWith(
        mockUser.id,
        'body-project-id',
        [ProjectRole.EDITOR]
      );
    });

    it('should prioritize route params over query and body', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(projectPermissionService.hasRole).toHaveBeenCalledWith(
        mockUser.id,
        'route-project-id',
        [ProjectRole.EDITOR]
      );
    });

    it('should handle multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        ProjectRole.OWNER,
        ProjectRole.EDITOR,
      ]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(projectPermissionService.hasRole).toHaveBeenCalledWith(
        mockUser.id,
        'project-id',
        [ProjectRole.OWNER, ProjectRole.EDITOR]
      );
    });

    it('should work with owner role', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.OWNER]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(projectPermissionService.hasRole).toHaveBeenCalledWith(
        mockUser.id,
        'project-id',
        [ProjectRole.OWNER]
      );
    });

    it('should work with viewer role', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.VIEWER]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(projectPermissionService.hasRole).toHaveBeenCalledWith(
        mockUser.id,
        'project-id',
        [ProjectRole.VIEWER]
      );
    });
  });

  describe('extractProjectId', () => {
    it('should extract projectId from params when available', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'route-project-id';
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractProjectId'](mockRequest)).toBe('route-project-id');
    });

    it('should extract projectId from query when params not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.projectId = 'query-project-id';
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractProjectId'](mockRequest)).toBe('query-project-id');
    });

    it('should extract projectId from body when params and query not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.projectId = 'body-project-id';

      await guard.canActivate(mockContext);

      expect(guard['extractProjectId'](mockRequest)).toBe('body-project-id');
    });

    it('should return null when projectId not found anywhere', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);

      const mockRequest = mockContext.switchToHttp().getRequest();

      expect(guard['extractProjectId'](mockRequest)).toBeNull();
    });

    it('should handle empty strings by returning null (empty string is invalid)', async () => {
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = '';
      mockRequest.query.projectId = '';
      mockRequest.body.projectId = '';

      // 空字符串被视为无效的 projectId，应该返回 null
      expect(guard['extractProjectId'](mockRequest)).toBeNull();
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

    it('should handle errors in project permission service gracefully', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockRejectedValue(
        new Error('Project permission service error')
      );

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Project permission service error'
      );
    });

    it('should handle project permission service returning rejection', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockRejectedValue(
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
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.OWNER]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should deny project editor access to owner-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.OWNER]);
      projectPermissionService.hasRole.mockResolvedValue(false);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should allow project editor access to editor endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([ProjectRole.EDITOR]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        ProjectRole.OWNER,
        ProjectRole.EDITOR,
      ]);
      projectPermissionService.hasRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.projectId = 'project-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });
  });
});
