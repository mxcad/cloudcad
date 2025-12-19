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

describe('FilePermissionGuard (Deprecated)', () => {
  let guard: FilePermissionGuard;
  let reflector: jest.Mocked<Reflector>;
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

    const mockPermissionService = {} as any;

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
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    guard = module.get<FilePermissionGuard>(FilePermissionGuard);
    reflector = module.get(Reflector);
    cacheService = module.get(PermissionCacheService);

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
    });

    it('should throw ForbiddenException when user is not authenticated', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.user = null;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw BadRequestException when fileId is missing', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should return true when fileId is provided (deprecated behavior)', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.fileId).toBe('file-id');
    });

    it('should extract fileId from params', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-from-params';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.fileId).toBe('file-from-params');
    });

    it('should extract fileId from query', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.query.fileId = 'file-from-query';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.fileId).toBe('file-from-query');
    });

    it('should extract fileId from body', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.fileId = 'file-from-body';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.fileId).toBe('file-from-body');
    });

    it('should extract fileId from files array', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.body.files = ['file-1', 'file-2', 'file-3'];

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.fileId).toBe('file-1');
    });

    it('should use cached role when available', async () => {
      reflector.getAllAndOverride.mockReturnValue([FileAccessRole.EDITOR]);
      cacheService.getFileAccessRole.mockReturnValue(FileAccessRole.EDITOR);
      const mockRequest = mockContext.switchToHttp().getRequest();
      mockRequest.params.fileId = 'file-id';

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.fileId).toBe('file-id');
    });
  });
});
