import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { FILE_PERMISSION_KEY } from '../decorators/file-permission.decorator';
import { FileAccessRole } from '../enums/permissions.enum';
import { PermissionCacheService } from '../services/permission-cache.service';
import {
  PermissionService,
  UserWithPermissions,
} from '../services/permission.service';
import { FilePermissionGuard } from './file-permission.guard';

describe('FilePermissionGuard', () => {
  let guard: FilePermissionGuard;
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
      hasFileRole: jest.fn(),
    } as any;

    const mockCacheService = {
      getFileAccessRole: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilePermissionGuard,
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
    }).compile();

    guard = module.get<FilePermissionGuard>(FilePermissionGuard);
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
    it('should return true when no file permissions are required', async () => {
      reflector.getAllAndOverride.mockReturnValue(null);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        FILE_PERMISSION_KEY,
        [mockContext.getHandler(), mockContext.getClass()]
      );
    });

    it('should return true when user has required file role', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      // Add fileId to params
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'file-id',
        [FileAccessRole.EDITOR]
      );
      expect(mockRequest.fileId).toBe('file-id');
    });

    it('should throw ForbiddenException when user is not authenticated', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);

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

    it('should throw BadRequestException when fileId is missing', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        BadRequestException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '缺少文件ID参数'
      );
    });

    it('should throw ForbiddenException when user lacks required file role', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.OWNER]);
      permissionService.hasFileRole.mockResolvedValue(false);

      // Add fileId to params
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        '用户没有足够的文件权限'
      );
    });

    it('should extract fileId from route parameters', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'route-file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'route-file-id',
        [FileAccessRole.EDITOR]
      );
    });

    it('should extract fileId from query parameters', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.fileId = 'query-file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'query-file-id',
        [FileAccessRole.EDITOR]
      );
    });

    it('should extract fileId from request body', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.fileId = 'body-file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'body-file-id',
        [FileAccessRole.EDITOR]
      );
    });

    it('should extract fileId from files array in request body', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.files = ['file-id-1', 'file-id-2', 'file-id-3'];

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'file-id-1', // First file from array
        [FileAccessRole.EDITOR]
      );
    });

    it('should prioritize route params over query and body', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'route-file-id';
      mockRequest.query.fileId = 'query-file-id';
      mockRequest.body.fileId = 'body-file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'route-file-id',
        [FileAccessRole.EDITOR]
      );
    });

    it('should handle multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        FileAccessRole.OWNER,
        FileAccessRole.EDITOR,
      ]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'file-id',
        [FileAccessRole.OWNER, FileAccessRole.EDITOR]
      );
    });

    it('should work with owner role', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.OWNER]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'file-id',
        [FileAccessRole.OWNER]
      );
    });

    it('should work with viewer role', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.VIEWER]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'file-id',
        [FileAccessRole.VIEWER]
      );
    });

    it('should handle empty files array', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.files = [];

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should handle null files array', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.files = null;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('extractFileId', () => {
    it('should extract fileId from params when available', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'route-file-id';
      mockRequest.query.fileId = 'query-file-id';
      mockRequest.body.fileId = 'body-file-id';

      await guard.canActivate(mockContext);

      expect(guard['extractFileId'](mockRequest)).toBe('route-file-id');
    });

    it('should extract fileId from query when params not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.fileId = 'query-file-id';
      mockRequest.body.fileId = 'body-file-id';

      await guard.canActivate(mockContext);

      expect(guard['extractFileId'](mockRequest)).toBe('query-file-id');
    });

    it('should extract fileId from body when params and query not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.fileId = 'body-file-id';

      await guard.canActivate(mockContext);

      expect(guard['extractFileId'](mockRequest)).toBe('body-file-id');
    });

    it('should extract fileId from files array when other sources not available', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.files = ['file-1', 'file-2'];

      await guard.canActivate(mockContext);

      expect(guard['extractFileId'](mockRequest)).toBe('file-1');
    });

    it('should return null when fileId not found anywhere', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);

      const mockRequest = mockContext.switchToHttp().getRequest();

      expect(guard['extractFileId'](mockRequest)).toBeNull();
    });

    it('should handle empty strings', async () => {
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = '';
      mockRequest.query.fileId = '';
      mockRequest.body.fileId = '';

      expect(guard['extractFileId'](mockRequest)).toBe('');
    });

    it('should handle null/undefined values', async () => {
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = null;
      mockRequest.query.fileId = undefined;
      mockRequest.body.fileId = null;

      expect(guard['extractFileId'](mockRequest)).toBeNull();
    });

    it('should handle mixed array with non-string values', async () => {
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.files = [null, undefined, '', 'valid-file-id'];

      expect(guard['extractFileId'](mockRequest)).toBeNull();
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
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockRejectedValue(
        new Error('Permission service error')
      );

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Permission service error'
      );
    });

    it('should handle permission service returning rejection', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockRejectedValue(
        new ForbiddenException('Access denied')
      );

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('integration scenarios', () => {
    it('should allow file owner access to owner-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.OWNER]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should deny file editor access to owner-only endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.OWNER]);
      permissionService.hasFileRole.mockResolvedValue(false);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should allow file editor access to editor endpoints', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', async () => {
      reflector.getAllAndOverride.mockReturnValue([
        FileAccessRole.OWNER,
        FileAccessRole.EDITOR,
      ]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should set fileId in request object when access is granted', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      await guard.canActivate(mockContext);

      expect(mockRequest.fileId).toBe('file-id');
    });

    it('should handle batch file operations', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      permissionService.hasFileRole.mockResolvedValue(true);

      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.files = ['file-1', 'file-2', 'file-3'];

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(permissionService.hasFileRole).toHaveBeenCalledWith(
        mockUser,
        'file-1',
        [FileAccessRole.EDITOR]
      );
      expect(mockRequest.fileId).toBe('file-1');
    });
  });
});
