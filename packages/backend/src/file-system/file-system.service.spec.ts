import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { FileSystemService } from './file-system.service';
import { DatabaseService } from '../database/database.service';
import { FileHashService } from './file-hash.service';
import { MinioStorageProvider } from '../storage/minio-storage.provider';
import { FileStatus, ProjectStatus } from '@prisma/client';

describe('FileSystemService', () => {
  let service: FileSystemService;
  let prisma: DatabaseService;

  const mockPrisma = {
    fileSystemNode: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback) => {
      return callback(mockPrisma);
    }),
  };

  beforeEach(async () => {
    const mockStorage = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      getFileStream: jest.fn(),
      fileExists: jest.fn(),
    };

    const mockFileHashService = {
      calculateHash: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSystemService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: MinioStorageProvider,
          useValue: mockStorage,
        },
        {
          provide: FileHashService,
          useValue: mockFileHashService,
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

    service = module.get<FileSystemService>(FileSystemService);
    prisma = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    it('应该成功创建项目', async () => {
      const userId = 'user-123';
      const dto = { name: '测试项目', description: '描述' };
      const mockProject = {
        id: 'project-123',
        ...dto,
        isFolder: true,
        isRoot: true,
        projectStatus: ProjectStatus.ACTIVE,
        ownerId: userId,
        nodeAccesses: [
          { userId, role: 'OWNER', user: { id: userId, username: 'test' } },
        ],
      };

      mockPrisma.fileSystemNode.create.mockResolvedValue(mockProject);

      const result = await service.createProject(userId, dto);

      expect(result).toEqual(mockProject);
      expect(mockPrisma.fileSystemNode.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          description: dto.description,
          isFolder: true,
          isRoot: true,
          projectStatus: ProjectStatus.ACTIVE,
          ownerId: userId,
          nodeAccesses: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
        },
        include: {
          nodeAccesses: {
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
          },
        },
      });
    });

    it('应该处理创建失败的情况', async () => {
      const userId = 'user-123';
      const dto = { name: '测试项目' };

      mockPrisma.fileSystemNode.create.mockRejectedValue(
        new Error('数据库错误')
      );

      await expect(service.createProject(userId, dto)).rejects.toThrow(
        '数据库错误'
      );
    });
  });

  describe('getUserProjects', () => {
    it('应该返回用户的所有项目', async () => {
      const userId = 'user-123';
      const mockProjects = [
        {
          id: 'project-1',
          name: '项目1',
          isRoot: true,
          nodeAccesses: [],
          _count: { children: 5, nodeAccesses: 2 },
        },
      ];

      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockProjects);

      const result = await service.getUserProjects(userId);

      expect(result).toEqual(mockProjects);
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledWith({
        where: {
          isRoot: true,
          deletedAt: null,
          nodeAccesses: {
            some: {
              userId,
            },
          },
        },
        include: expect.any(Object),
        orderBy: {
          updatedAt: 'desc',
        },
      });
    });
  });

  describe('getProject', () => {
    it('应该返回项目详情', async () => {
      const projectId = 'project-123';
      const mockProject = {
        id: projectId,
        name: '项目',
        isRoot: true,
        members: [],
        children: [],
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockProject);

      const result = await service.getProject(projectId);

      expect(result).toEqual(mockProject);
    });

    it('应该在项目不存在时抛出异常', async () => {
      const projectId = 'nonexistent';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(service.getProject(projectId)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateProject', () => {
    it('应该成功更新项目', async () => {
      const projectId = 'project-123';
      const dto = { name: '新名称', description: '新描述', status: 'ARCHIVED' };
      const mockUpdated = { id: projectId, ...dto };

      mockPrisma.fileSystemNode.update.mockResolvedValue(mockUpdated);

      const result = await service.updateProject(projectId, dto);

      expect(result).toEqual(mockUpdated);
      expect(mockPrisma.fileSystemNode.update).toHaveBeenCalledWith({
        where: { id: projectId, isRoot: true },
        data: {
          name: dto.name,
          description: dto.description,
          projectStatus: dto.status,
        },
        include: expect.any(Object),
      });
    });

    it('应该处理更新错误', async () => {
      const projectId = 'project-123';
      const dto = { name: '新名称' };

      mockPrisma.fileSystemNode.update.mockRejectedValue(
        new Error('Update failed')
      );

      await expect(service.updateProject(projectId, dto)).rejects.toThrow(
        'Update failed'
      );
    });
  });

  describe('deleteProject', () => {
    it('应该成功删除项目', async () => {
      const projectId = 'project-123';

      // Mock findMany 用于 softDeleteDescendants 递归调用
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      // Mock update 用于软删除子节点
      mockPrisma.fileSystemNode.updateMany.mockResolvedValue({});
      // Mock update 用于软删除根节点
      mockPrisma.fileSystemNode.update.mockResolvedValue({});

      const result = await service.deleteProject(projectId);

      expect(result).toEqual({ message: '项目已移至回收站' });
    });

    it('应该处理删除错误', async () => {
      const projectId = 'project-123';

      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      // 让 $transaction 抛出错误
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(service.deleteProject(projectId)).rejects.toThrow(
        'Delete failed'
      );
    });
  });

  describe('createFolder', () => {
    it('应该成功创建文件夹', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const dto = { name: '新文件夹' };
      const mockParent = { isFolder: true, isRoot: false };
      const mockFolder = {
        id: 'folder-123',
        name: dto.name,
        isFolder: true,
        parentId,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);
      mockPrisma.fileSystemNode.create.mockResolvedValue(mockFolder);

      const result = await service.createFolder(userId, parentId, dto);

      expect(result).toEqual(mockFolder);
    });

    it('应该在父节点不存在时抛出异常', async () => {
      const userId = 'user-123';
      const parentId = 'nonexistent';
      const dto = { name: '新文件夹' };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(service.createFolder(userId, parentId, dto)).rejects.toThrow(
        NotFoundException
      );
    });

    it('应该在父节点不是文件夹时抛出异常', async () => {
      const userId = 'user-123';
      const parentId = 'file-123';
      const dto = { name: '新文件夹' };
      const mockParent = { isFolder: false };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);

      await expect(service.createFolder(userId, parentId, dto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('应该处理创建文件夹时的数据库错误', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const dto = { name: '新文件夹' };
      const mockParent = { isFolder: true };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);
      mockPrisma.fileSystemNode.create.mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.createFolder(userId, parentId, dto)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('getNodeTree', () => {
    it('应该返回节点树结构', async () => {
      const nodeId = 'node-123';
      const mockNode = {
        id: nodeId,
        name: '节点',
        children: [],
        owner: { id: 'user-123', username: 'test' },
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);

      const result = await service.getNodeTree(nodeId);

      expect(result).toEqual(mockNode);
    });

    it('应该在节点不存在时抛出异常', async () => {
      const nodeId = 'nonexistent';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(service.getNodeTree(nodeId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('应该处理查询节点树时的错误', async () => {
      const nodeId = 'node-123';

      mockPrisma.fileSystemNode.findUnique.mockRejectedValue(
        new Error('Query error')
      );

      await expect(service.getNodeTree(nodeId)).rejects.toThrow('Query error');
    });
  });

  describe('getChildren', () => {
    it('应该返回子节点列表', async () => {
      const nodeId = 'node-123';
      const mockChildren = [
        { id: 'child-1', name: '子节点', isFolder: true },
        { id: 'child-2', name: '子节点', isFolder: false },
      ];

      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockChildren);

      const result = await service.getChildren(nodeId);

      expect(result).toEqual(mockChildren);
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledWith({
        where: { parentId: nodeId, deletedAt: null },
        include: expect.any(Object),
        orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
      });
    });

    it('应该处理查询子节点时的错误', async () => {
      const nodeId = 'node-123';

      mockPrisma.fileSystemNode.findMany.mockRejectedValue(
        new Error('Query error')
      );

      await expect(service.getChildren(nodeId)).rejects.toThrow('Query error');
    });
  });

  describe('updateNode', () => {
    it('应该成功更新节点', async () => {
      const nodeId = 'node-123';
      const dto = { name: '新名称' };
      const mockUpdated = { id: nodeId, ...dto };

      mockPrisma.fileSystemNode.update.mockResolvedValue(mockUpdated);

      const result = await service.updateNode(nodeId, dto);

      expect(result).toEqual(mockUpdated);
    });

    it('应该处理更新节点时的错误', async () => {
      const nodeId = 'node-123';
      const dto = { name: '新名称' };

      mockPrisma.fileSystemNode.update.mockRejectedValue(
        new Error('Update error')
      );

      await expect(service.updateNode(nodeId, dto)).rejects.toThrow(
        'Update error'
      );
    });
  });

  describe('deleteNode', () => {
    it('应该成功删除非根节点', async () => {
      const nodeId = 'node-123';
      const mockNode = {
        isRoot: false,
        isFolder: true,
        path: null,
        fileHash: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      // Mock findMany 用于 softDeleteDescendants 递归调用
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      // Mock update 用于软删除子节点
      mockPrisma.fileSystemNode.updateMany.mockResolvedValue({});
      // Mock update 用于软删除当前节点
      mockPrisma.fileSystemNode.update.mockResolvedValue({});

      const result = await service.deleteNode(nodeId);

      expect(result).toEqual({ message: '节点已移至回收站' });
    });

    it('应该禁止删除根节点', async () => {
      const nodeId = 'root-123';
      const mockNode = {
        isRoot: true,
        isFolder: true,
        path: null,
        fileHash: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);

      await expect(service.deleteNode(nodeId)).rejects.toThrow(
        BadRequestException
      );
    });

    it('应该处理删除节点时的错误', async () => {
      const nodeId = 'node-123';
      const mockNode = {
        isRoot: false,
        isFolder: false,
        path: null,
        fileHash: null,
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      // 让 $transaction 抛出错误
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('Delete error'));

      await expect(service.deleteNode(nodeId)).rejects.toThrow('Delete error');
    });
  });

  describe('moveNode', () => {
    it('应该成功移动节点', async () => {
      const nodeId = 'node-123';
      const targetParentId = 'target-123';
      const mockNode = { isRoot: false, parentId: 'old-parent' };
      const mockTargetParent = { isFolder: true };
      const mockMoved = { id: nodeId, parentId: targetParentId };

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(mockNode)
        .mockResolvedValueOnce(mockTargetParent);
      mockPrisma.fileSystemNode.update.mockResolvedValue(mockMoved);

      const result = await service.moveNode(nodeId, targetParentId);

      expect(result).toEqual(mockMoved);
    });

    it('应该在节点不存在时抛出异常', async () => {
      const nodeId = 'nonexistent';
      const targetParentId = 'target-123';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(service.moveNode(nodeId, targetParentId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('应该禁止移动根节点', async () => {
      const nodeId = 'root-123';
      const targetParentId = 'target-123';
      const mockNode = { isRoot: true };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);

      await expect(service.moveNode(nodeId, targetParentId)).rejects.toThrow(
        BadRequestException
      );
    });

    it('应该禁止移动到非文件夹节点', async () => {
      const nodeId = 'node-123';
      const targetParentId = 'file-123';
      const mockNode = { isRoot: false, parentId: 'old-parent' };
      const mockTargetParent = { isFolder: false };

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(mockNode)
        .mockResolvedValueOnce(mockTargetParent);

      await expect(service.moveNode(nodeId, targetParentId)).rejects.toThrow(
        BadRequestException
      );
    });

    it('应该禁止移动到自己', async () => {
      const nodeId = 'node-123';
      const mockNode = { isRoot: false, parentId: 'old-parent' };
      const mockTargetParent = { isFolder: true };

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(mockNode)
        .mockResolvedValueOnce(mockTargetParent);

      await expect(service.moveNode(nodeId, nodeId)).rejects.toThrow(
        BadRequestException
      );
    });

    it('应该在目标父节点不存在时抛出异常', async () => {
      const nodeId = 'node-123';
      const targetParentId = 'nonexistent';
      const mockNode = { isRoot: false, parentId: 'old-parent' };

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(mockNode)
        .mockResolvedValueOnce(null);

      await expect(service.moveNode(nodeId, targetParentId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('应该处理移动节点时的错误', async () => {
      const nodeId = 'node-123';
      const targetParentId = 'target-123';
      const mockNode = { isRoot: false, parentId: 'old-parent' };
      const mockTargetParent = { isFolder: true };

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(mockNode)
        .mockResolvedValueOnce(mockTargetParent);
      mockPrisma.fileSystemNode.update.mockRejectedValue(
        new Error('Move error')
      );

      await expect(service.moveNode(nodeId, targetParentId)).rejects.toThrow(
        'Move error'
      );
    });
  });

  describe('uploadFile', () => {
    it('应该成功上传文件', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const file = {
        originalname: 'test.dwg',
        filename: 'upload-123.dwg',
        mimetype: 'application/acad',
        size: 1024,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;
      const mockParent = { isFolder: true };
      const mockFileNode = {
        id: 'file-123',
        name: file.originalname,
        size: file.size,
        path: 'files/user-123/17670855557382-test.dwg',
        fileHash: 'abc123',
        fileStatus: FileStatus.COMPLETED,
        isFolder: false,
        isRoot: false,
        ownerId: userId,
        parentId,
        originalName: file.originalname,
        extension: 'dwg',
        mimeType: file.mimetype,
        owner: {
          id: userId,
          username: 'test',
          nickname: 'Test User',
        },
      };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue(null); // 无重复文件
      mockPrisma.fileSystemNode.create.mockResolvedValue(mockFileNode);

      const result = await service.uploadFile(userId, parentId, file);

      expect(result).toEqual(mockFileNode);
    });

    it('应该在父节点不存在时抛出异常', async () => {
      const userId = 'user-123';
      const parentId = 'nonexistent';
      const file = { originalname: 'test.dwg' } as Express.Multer.File;

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(service.uploadFile(userId, parentId, file)).rejects.toThrow(
        NotFoundException
      );
    });

    it('应该在父节点不是文件夹时抛出异常', async () => {
      const userId = 'user-123';
      const parentId = 'file-123';
      const file = { originalname: 'test.dwg' } as Express.Multer.File;
      const mockParent = { isFolder: false };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);

      await expect(service.uploadFile(userId, parentId, file)).rejects.toThrow(
        BadRequestException
      );
    });

    it('应该处理上传文件时的错误', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const file = {
        originalname: 'test.dwg',
        filename: 'upload-123.dwg',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;
      const mockParent = { isFolder: true };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);
      mockPrisma.fileSystemNode.create.mockRejectedValue(
        new Error('Upload error')
      );

      await expect(service.uploadFile(userId, parentId, file)).rejects.toThrow(
        'Upload error'
      );
    });
  });

  describe('getRootNode', () => {
    it('应该返回根节点', async () => {
      const nodeId = 'child-123';
      const mockNode = { id: nodeId, isRoot: false, parentId: 'parent-123' };
      const mockParent = {
        id: 'parent-123',
        isRoot: false,
        parentId: 'root-123',
      };
      const mockRoot = { id: 'root-123', isRoot: true, parentId: null };

      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(mockNode)
        .mockResolvedValueOnce(mockParent)
        .mockResolvedValueOnce(mockRoot);

      const result = await service.getRootNode(nodeId);

      expect(result).toEqual(mockRoot);
    });

    it('应该在节点不存在时抛出异常', async () => {
      const nodeId = 'nonexistent';

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(service.getRootNode(nodeId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('应该在未找到根节点时抛出异常', async () => {
      const nodeId = 'orphan-123';
      const mockNode = { id: nodeId, isRoot: false, parentId: null };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockNode);

      await expect(service.getRootNode(nodeId)).rejects.toThrow(
        NotFoundException
      );
    });

    it('应该处理节点本身就是根节点的情况', async () => {
      const nodeId = 'root-123';
      const mockRoot = { id: nodeId, isRoot: true, parentId: null };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockRoot);

      const result = await service.getRootNode(nodeId);

      expect(result).toEqual(mockRoot);
    });
  });

  describe('边界情况测试', () => {
    it('应该处理数据库查询错误', async () => {
      const userId = 'user-123';
      const dto = { name: '项目' };

      mockPrisma.fileSystemNode.create.mockRejectedValue(
        new Error('Connection refused')
      );

      await expect(service.createProject(userId, dto)).rejects.toThrow();
    });

    it('应该处理文件名包含路径分隔符', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const file = {
        originalname: 'path/to/file.dwg',
        filename: 'upload-123.dwg',
        mimetype: 'application/acad',
        size: 1024,
      } as Express.Multer.File;
      const mockParent = { isFolder: true };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);
      mockPrisma.fileSystemNode.create.mockResolvedValue({
        id: 'file-123',
        name: file.originalname,
      });

      const result = await service.uploadFile(userId, parentId, file);

      expect(result.name).toBe('path/to/file.dwg');
    });

    it('应该处理没有扩展名的文件', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const file = {
        originalname: 'noextension',
        filename: 'upload-123',
        mimetype: 'application/octet-stream',
        size: 1024,
      } as Express.Multer.File;
      const mockParent = { isFolder: true };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);
      mockPrisma.fileSystemNode.create.mockResolvedValue({
        id: 'file-123',
        extension: 'noextension',
      });

      const result = await service.uploadFile(userId, parentId, file);

      expect(mockPrisma.fileSystemNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            extension: 'noextension',
          }),
        })
      );
    });

    it('应该处理空字符串文件名的扩展名', async () => {
      const userId = 'user-123';
      const parentId = 'parent-123';
      const file = {
        originalname: '',
        filename: 'upload-123',
        mimetype: 'application/octet-stream',
        size: 1024,
      } as Express.Multer.File;
      const mockParent = { isFolder: true };

      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mockParent);
      mockPrisma.fileSystemNode.create.mockResolvedValue({
        id: 'file-123',
        extension: '',
      });

      const result = await service.uploadFile(userId, parentId, file);

      expect(mockPrisma.fileSystemNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            extension: '',
          }),
        })
      );
    });

    it('应该处理空描述的项目更新', async () => {
      const projectId = 'project-123';
      const dto = { name: '名称', description: undefined };

      mockPrisma.fileSystemNode.update.mockResolvedValue({
        id: projectId,
        name: dto.name,
      });

      const result = await service.updateProject(projectId, dto);

      expect(result.name).toBe(dto.name);
    });

    it('应该处理查询错误', async () => {
      const userId = 'user-123';

      mockPrisma.fileSystemNode.findMany.mockRejectedValue(
        new Error('Query timeout')
      );

      await expect(service.getUserProjects(userId)).rejects.toThrow();
    });
  });

  describe('getUserStorageInfo', () => {
    it('应该返回用户存储信息', async () => {
      const userId = 'user-123';
      const mockFiles = [{ size: 1024 }, { size: 2048 }, { size: 0 }];

      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockFiles);

      const result = await service.getUserStorageInfo(userId);

      expect(result.totalUsed).toBe(3072);
      expect(result.totalLimit).toBe(5 * 1024 * 1024 * 1024);
      expect(result.available).toBe(5 * 1024 * 1024 * 1024 - 3072);
      expect(result.usagePercentage).toBe(0);
      expect(result.formatted.totalUsed).toBe('3 KB');
      expect(result.formatted.totalLimit).toBe('5 GB');
      expect(result.formatted.available).toBe('5 GB');
    });

    it('应该处理用户没有文件的情况', async () => {
      const userId = 'user-123';

      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);

      const result = await service.getUserStorageInfo(userId);

      expect(result.totalUsed).toBe(0);
      expect(result.available).toBe(5 * 1024 * 1024 * 1024);
      expect(result.usagePercentage).toBe(0);
      expect(result.formatted.totalUsed).toBe('0 B');
    });

    it('应该正确计算存储使用百分比', async () => {
      const userId = 'user-123';
      const mockFiles = [
        { size: 1024 * 1024 * 1024 }, // 1GB
        { size: 1024 * 1024 * 1024 }, // 1GB
      ];

      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockFiles);

      const result = await service.getUserStorageInfo(userId);

      expect(result.totalUsed).toBe(2 * 1024 * 1024 * 1024);
      expect(result.usagePercentage).toBe(40);
      expect(result.formatted.totalUsed).toBe('2 GB');
    });

    it('应该处理查询错误', async () => {
      const userId = 'user-123';

      mockPrisma.fileSystemNode.findMany.mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.getUserStorageInfo(userId)).rejects.toThrow(
        'Database error'
      );
    });
  });
});
