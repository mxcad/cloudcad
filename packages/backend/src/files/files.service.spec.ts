import { Test, TestingModule } from '@nestjs/testing';
import { FilesService } from './files.service';
import { DatabaseService } from '../database/database.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('FilesService', () => {
  let service: FilesService;
  let prisma: DatabaseService;
  let permissionCacheService: PermissionCacheService;

  const mockPrisma = {
    file: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    fileAccess: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockPermissionCacheService = {
    clearUserCache: jest.fn(),
    clearFileCache: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: PermissionCacheService,
          useValue: mockPermissionCacheService,
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
    prisma = module.get<DatabaseService>(DatabaseService);
    permissionCacheService = module.get<PermissionCacheService>(PermissionCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    const userId = 'user1';
    const file = {
      originalname: 'test.dwg',
      mimetype: 'application/dwg',
      size: 1024,
      filename: 'test-file',
    } as Express.Multer.File;

    it('should upload file successfully', async () => {
      const expectedFile = {
        id: 'file1',
        name: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: `/uploads/${file.filename}`,
        projectId: null,
        ownerId: userId,
        owner: { id: userId, username: 'testuser', nickname: 'Test User' },
        project: null,
      };

      mockPrisma.file.create.mockResolvedValue(expectedFile);
      mockPrisma.fileAccess.create.mockResolvedValue({});

      const result = await service.upload(userId, file);

      expect(mockPrisma.file.create).toHaveBeenCalledWith({
        data: {
          name: file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: `/uploads/${file.filename}`,
          projectId: undefined,
          ownerId: userId,
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      expect(mockPrisma.fileAccess.create).toHaveBeenCalledWith({
        data: {
          fileId: expectedFile.id,
          userId,
          role: 'OWNER',
        },
      });

      expect(result).toEqual(expectedFile);
    });

    it('should upload file to project', async () => {
      const projectId = 'project1';
      const expectedFile = {
        id: 'file1',
        name: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: `/uploads/${file.filename}`,
        projectId,
        ownerId: userId,
        owner: { id: userId, username: 'testuser', nickname: 'Test User' },
        project: { id: projectId, name: 'Test Project' },
      };

      mockPrisma.file.create.mockResolvedValue(expectedFile);
      mockPrisma.fileAccess.create.mockResolvedValue({});

      const result = await service.upload(userId, file, projectId);

      expect(mockPrisma.file.create).toHaveBeenCalledWith({
        data: {
          name: file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: `/uploads/${file.filename}`,
          projectId,
          ownerId: userId,
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      expect(result).toEqual(expectedFile);
    });
  });

  describe('findAll', () => {
    const userId = 'user1';

    it('should return user files', async () => {
      const expectedFiles = [
        {
          id: 'file1',
          name: 'test.dwg',
          owner: { id: userId, username: 'testuser', nickname: 'Test User' },
          project: null,
          fileAccesses: [],
        },
      ];

      mockPrisma.file.findMany.mockResolvedValue(expectedFiles);

      const result = await service.findAll(userId);

      expect(mockPrisma.file.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { ownerId: userId },
            {
              fileAccesses: {
                some: {
                  userId,
                },
              },
            },
            {
              project: {
                members: {
                  some: {
                    userId,
                  },
                },
              },
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          fileAccesses: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(result).toEqual(expectedFiles);
    });
  });

  describe('findByProject', () => {
    const projectId = 'project1';

    it('should return project files', async () => {
      const expectedFiles = [
        {
          id: 'file1',
          name: 'test.dwg',
          owner: { id: 'user1', username: 'testuser', nickname: 'Test User' },
          fileAccesses: [],
        },
      ];

      mockPrisma.file.findMany.mockResolvedValue(expectedFiles);

      const result = await service.findByProject(projectId);

      expect(mockPrisma.file.findMany).toHaveBeenCalledWith({
        where: { projectId },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          fileAccesses: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(result).toEqual(expectedFiles);
    });
  });

  describe('findOne', () => {
    const fileId = 'file1';

    it('should return file when found', async () => {
      const expectedFile = {
        id: fileId,
        name: 'test.dwg',
        owner: { id: 'user1', username: 'testuser', nickname: 'Test User' },
        project: null,
        fileAccesses: [],
      };

      mockPrisma.file.findUnique.mockResolvedValue(expectedFile);

      const result = await service.findOne(fileId);

      expect(mockPrisma.file.findUnique).toHaveBeenCalledWith({
        where: { id: fileId },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          fileAccesses: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
        },
      });

      expect(result).toEqual(expectedFile);
    });

    it('should throw NotFoundException when file not found', async () => {
      mockPrisma.file.findUnique.mockResolvedValue(null);

      await expect(service.findOne(fileId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('download', () => {
    const fileId = 'file1';

    it('should return file info for download', async () => {
      const expectedFile = {
        id: fileId,
        name: 'test.dwg',
        originalName: 'test.dwg',
        mimeType: 'application/dwg',
        size: 1024,
        path: '/uploads/test-file',
      };

      mockPrisma.file.findUnique.mockResolvedValue(expectedFile);

      const result = await service.download(fileId);

      expect(mockPrisma.file.findUnique).toHaveBeenCalledWith({
        where: { id: fileId },
        select: {
          id: true,
          name: true,
          originalName: true,
          mimeType: true,
          size: true,
          path: true,
        },
      });

      expect(result).toEqual(expectedFile);
    });

    it('should throw NotFoundException when file not found', async () => {
      mockPrisma.file.findUnique.mockResolvedValue(null);

      await expect(service.download(fileId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const fileId = 'file1';
    const updateDto = { name: 'updated.dwg' };

    it('should update file successfully', async () => {
      const expectedFile = {
        id: fileId,
        name: 'updated.dwg',
        owner: { id: 'user1', username: 'testuser', nickname: 'Test User' },
        project: null,
      };

      mockPrisma.file.update.mockResolvedValue(expectedFile);

      const result = await service.update(fileId, updateDto);

      expect(mockPrisma.file.update).toHaveBeenCalledWith({
        where: { id: fileId },
        data: updateDto,
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      expect(result).toEqual(expectedFile);
    });
  });

  describe('remove', () => {
    const fileId = 'file1';

    it('should delete file successfully', async () => {
      mockPrisma.file.delete.mockResolvedValue({});

      const result = await service.remove(fileId);

      expect(mockPrisma.file.delete).toHaveBeenCalledWith({
        where: { id: fileId },
      });

      expect(result).toEqual({ message: '文件删除成功' });
    });
  });

  describe('shareFile', () => {
    const fileId = 'file1';
    const shareData = { userId: 'user2', role: 'VIEWER' };

    it('should share file successfully', async () => {
      const user = { id: 'user2', email: 'user2@example.com' };
      const expectedAccess = {
        id: 'access1',
        fileId,
        userId: 'user2',
        role: 'VIEWER',
        user,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.fileAccess.findUnique.mockResolvedValue(null);
      mockPrisma.fileAccess.create.mockResolvedValue(expectedAccess);

      const result = await service.shareFile(fileId, shareData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user2' },
      });

      expect(mockPrisma.fileAccess.findUnique).toHaveBeenCalledWith({
        where: {
          userId_fileId: {
            userId: 'user2',
            fileId,
          },
        },
      });

      expect(mockPrisma.fileAccess.create).toHaveBeenCalledWith({
        data: {
          fileId,
          userId: 'user2',
          role: 'VIEWER',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
        },
      });

      expect(mockPermissionCacheService.clearUserCache).toHaveBeenCalledWith('user2');
      expect(mockPermissionCacheService.clearFileCache).toHaveBeenCalledWith(fileId);

      expect(result).toEqual(expectedAccess);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.shareFile(fileId, shareData)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user already has access', async () => {
      const user = { id: 'user2', email: 'user2@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.fileAccess.findUnique.mockResolvedValue({ id: 'access1' });

      await expect(service.shareFile(fileId, shareData)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getFileAccess', () => {
    const fileId = 'file1';

    it('should return file access list', async () => {
      const expectedAccesses = [
        {
          id: 'access1',
          fileId,
          userId: 'user2',
          role: 'VIEWER',
          user: {
            id: 'user2',
            email: 'user2@example.com',
            username: 'user2',
            nickname: 'User 2',
            avatar: null,
            role: 'USER',
            status: 'ACTIVE',
          },
        },
      ];

      mockPrisma.fileAccess.findMany.mockResolvedValue(expectedAccesses);

      const result = await service.getFileAccess(fileId);

      expect(mockPrisma.fileAccess.findMany).toHaveBeenCalledWith({
        where: { fileId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
              role: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      expect(result).toEqual(expectedAccesses);
    });
  });

  describe('updateFileAccess', () => {
    const fileId = 'file1';
    const userId = 'user2';
    const role = 'EDITOR';

    it('should update file access successfully', async () => {
      const expectedAccess = {
        id: 'access1',
        fileId,
        userId,
        role: 'EDITOR',
        user: {
          id: 'user2',
          email: 'user2@example.com',
          username: 'user2',
          nickname: 'User 2',
          avatar: null,
        },
      };

      mockPrisma.fileAccess.update.mockResolvedValue(expectedAccess);

      const result = await service.updateFileAccess(fileId, userId, role);

      expect(mockPrisma.fileAccess.update).toHaveBeenCalledWith({
        where: {
          userId_fileId: {
            userId,
            fileId,
          },
        },
        data: { role: 'EDITOR' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
        },
      });

      expect(mockPermissionCacheService.clearUserCache).toHaveBeenCalledWith(userId);
      expect(mockPermissionCacheService.clearFileCache).toHaveBeenCalledWith(fileId);

      expect(result).toEqual(expectedAccess);
    });
  });

  describe('removeFileAccess', () => {
    const fileId = 'file1';
    const userId = 'user2';

    it('should remove file access successfully', async () => {
      mockPrisma.fileAccess.delete.mockResolvedValue({});

      const result = await service.removeFileAccess(fileId, userId);

      expect(mockPrisma.fileAccess.delete).toHaveBeenCalledWith({
        where: {
          userId_fileId: {
            userId,
            fileId,
          },
        },
      });

      expect(mockPermissionCacheService.clearUserCache).toHaveBeenCalledWith(userId);
      expect(mockPermissionCacheService.clearFileCache).toHaveBeenCalledWith(fileId);

      expect(result).toEqual({ message: '访问权限移除成功' });
    });
  });
});