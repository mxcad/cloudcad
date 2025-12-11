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
    avatar: null,
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
    creatorId: 'user-id',
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
    }).compile();

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

    it('should check project permissions when projectId provided', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(mockProjectMember);
      cacheService.getProjectPermissions.mockReturnValue(null);

      const result = await service.hasPermission(
        mockUser,
        Permission.PROJECT_READ,
        { projectId: 'project-id' }
      );

      expect(result).toBe(true);
      expect(prisma.projectMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId_projectId: {
            userId: mockUser.id,
            projectId: 'project-id',
          },
        },
        select: { role: true },
      });
    });

    it('should check file permissions when fileId provided', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(mockFileAccess);
      prisma.file.findUnique.mockResolvedValue(mockFile);
      cacheService.getFilePermissions.mockReturnValue(null);

      const result = await service.hasPermission(
        mockUser,
        Permission.FILE_READ,
        { fileId: 'file-id' }
      );

      expect(result).toBe(true);
    });

    it('should return false when project member not found', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(null);
      cacheService.getProjectPermissions.mockReturnValue(null);

      const result = await service.hasPermission(
        mockUser,
        Permission.PROJECT_READ,
        { projectId: 'project-id' }
      );

      expect(result).toBe(false);
    });

    it('should use cached project permissions', async () => {
      const cachedPermissions = [Permission.PROJECT_READ];
      cacheService.getProjectPermissions.mockReturnValue(cachedPermissions);

      const result = await service.hasPermission(
        mockUser,
        Permission.PROJECT_READ,
        { projectId: 'project-id' }
      );

      expect(result).toBe(true);
      expect(prisma.projectMember.findFirst).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      prisma.projectMember.findFirst.mockRejectedValue(
        new Error('Database error')
      );
      cacheService.getProjectPermissions.mockReturnValue(null);

      const result = await service.hasPermission(
        mockUser,
        Permission.PROJECT_READ,
        { projectId: 'project-id' }
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
    it('should return true when user has required project role', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(mockProjectMember);

      const result = await service.hasProjectRole(mockUser, 'project-id', [
        ProjectMemberRole.MEMBER,
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user is not project member', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(null);

      const result = await service.hasProjectRole(mockUser, 'project-id', [
        ProjectMemberRole.MEMBER,
      ]);

      expect(result).toBe(false);
    });

    it('should return true when user has one of multiple required roles', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(mockProjectMember);

      const result = await service.hasProjectRole(mockUser, 'project-id', [
        ProjectMemberRole.ADMIN,
        ProjectMemberRole.MEMBER,
      ]);

      expect(result).toBe(true);
    });

    it('should handle database errors', async () => {
      prisma.projectMember.findFirst.mockRejectedValue(
        new Error('Database error')
      );

      const result = await service.hasProjectRole(mockUser, 'project-id', [
        ProjectMemberRole.MEMBER,
      ]);

      expect(result).toBe(false);
    });
  });

  describe('hasFileRole', () => {
    it('should return true when user has required file access role', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(mockFileAccess);

      const result = await service.hasFileRole(mockUser, 'file-id', [
        FileAccessRole.EDITOR,
      ]);

      expect(result).toBe(true);
    });

    it('should return true when user is file owner', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(mockFile);

      const result = await service.hasFileRole(mockUser, 'file-id', [
        FileAccessRole.OWNER,
      ]);

      expect(result).toBe(true);
    });

    it('should return false when user is not file owner', async () => {
      const otherUserFile = { ...mockFile, creatorId: 'other-user-id' };
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(otherUserFile);

      const result = await service.hasFileRole(mockUser, 'file-id', [
        FileAccessRole.OWNER,
      ]);

      expect(result).toBe(false);
    });

    it('should return false when file not found', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(null);

      const result = await service.hasFileRole(mockUser, 'file-id', [
        FileAccessRole.OWNER,
      ]);

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      prisma.fileAccess.findFirst.mockRejectedValue(
        new Error('Database error')
      );

      const result = await service.hasFileRole(mockUser, 'file-id', [
        FileAccessRole.EDITOR,
      ]);

      expect(result).toBe(false);
    });
  });

  describe('getProjectPermissions', () => {
    it('should return project member permissions', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(mockProjectMember);

      const result = await service.getProjectPermissions(
        mockUser,
        'project-id'
      );

      expect(result).toEqual(
        PROJECT_MEMBER_PERMISSIONS[ProjectMemberRole.MEMBER]
      );
    });

    it('should return empty array when user is not project member', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(null);

      const result = await service.getProjectPermissions(
        mockUser,
        'project-id'
      );

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      prisma.projectMember.findFirst.mockRejectedValue(
        new Error('Database error')
      );

      const result = await service.getProjectPermissions(
        mockUser,
        'project-id'
      );

      expect(result).toEqual([]);
    });
  });

  describe('getFilePermissions', () => {
    it('should return file access permissions', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(mockFileAccess);

      const result = await service.getFilePermissions(mockUser, 'file-id');

      expect(result).toEqual(FILE_ACCESS_PERMISSIONS[FileAccessRole.EDITOR]);
    });

    it('should return owner permissions when user is file creator', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(mockFile);

      const result = await service.getFilePermissions(mockUser, 'file-id');

      expect(result).toEqual(FILE_ACCESS_PERMISSIONS[FileAccessRole.OWNER]);
    });

    it('should return project permissions when file belongs to project', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(mockFile);
      prisma.projectMember.findFirst.mockResolvedValue(mockProjectMember);

      const result = await service.getFilePermissions(mockUser, 'file-id');

      expect(result).toEqual(
        PROJECT_MEMBER_PERMISSIONS[ProjectMemberRole.MEMBER]
      );
    });

    it('should return empty array when file not found', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(null);

      const result = await service.getFilePermissions(mockUser, 'file-id');

      expect(result).toEqual([]);
    });

    it('should return empty array when user is not file owner and no project access', async () => {
      const otherUserFile = { ...mockFile, creatorId: 'other-user-id' };
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(otherUserFile);
      prisma.projectMember.findFirst.mockResolvedValue(null);

      const result = await service.getFilePermissions(mockUser, 'file-id');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      prisma.fileAccess.findFirst.mockRejectedValue(
        new Error('Database error')
      );

      const result = await service.getFilePermissions(mockUser, 'file-id');

      expect(result).toEqual([]);
    });
  });

  describe('checkProjectPermission', () => {
    it('should cache project permissions after checking', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(mockProjectMember);
      cacheService.getProjectPermissions.mockReturnValue(null);

      await service['checkProjectPermission'](
        mockUser,
        'project-id',
        Permission.PROJECT_READ
      );

      expect(cacheService.cacheProjectPermissions).toHaveBeenCalledWith(
        mockUser.id,
        'project-id',
        PROJECT_MEMBER_PERMISSIONS[ProjectMemberRole.MEMBER]
      );
    });

    it('should return false for non-existent project member', async () => {
      prisma.projectMember.findFirst.mockResolvedValue(null);
      cacheService.getProjectPermissions.mockReturnValue(null);

      const result = await service['checkProjectPermission'](
        mockUser,
        'project-id',
        Permission.PROJECT_READ
      );

      expect(result).toBe(false);
    });
  });

  describe('checkFilePermission', () => {
    it('should cache file permissions after checking', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(mockFileAccess);
      cacheService.getFilePermissions.mockReturnValue(null);

      await service['checkFilePermission'](
        mockUser,
        'file-id',
        Permission.FILE_READ
      );

      expect(cacheService.cacheFilePermissions).toHaveBeenCalledWith(
        mockUser.id,
        'file-id',
        FILE_ACCESS_PERMISSIONS[FileAccessRole.EDITOR]
      );
    });

    it('should check project permissions when file belongs to project and user is not owner', async () => {
      const otherUserFile = { ...mockFile, creatorId: 'other-user-id' };
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(otherUserFile);
      prisma.projectMember.findFirst.mockResolvedValue(mockProjectMember);
      cacheService.getFilePermissions.mockReturnValue(null);

      const result = await service['checkFilePermission'](
        mockUser,
        'file-id',
        Permission.PROJECT_READ
      );

      expect(result).toBe(true);
      expect(cacheService.cacheFilePermissions).toHaveBeenCalledWith(
        mockUser.id,
        'file-id',
        [Permission.PROJECT_READ]
      );
    });

    it('should return false for non-existent file', async () => {
      prisma.fileAccess.findFirst.mockResolvedValue(null);
      prisma.file.findUnique.mockResolvedValue(null);
      cacheService.getFilePermissions.mockReturnValue(null);

      const result = await service['checkFilePermission'](
        mockUser,
        'file-id',
        Permission.FILE_READ
      );

      expect(result).toBe(false);
    });
  });
});
