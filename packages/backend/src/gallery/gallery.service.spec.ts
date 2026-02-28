import { Test, TestingModule } from '@nestjs/testing';
import { GalleryService } from './gallery.service';
import { DatabaseService } from '../database/database.service';
import { PrismaClient } from '@prisma/client';

describe('GalleryService', () => {
  let service: GalleryService;
  let database: DatabaseService;
  let prisma: PrismaClient;

  const mockUserId = 'test-user-id';
  const mockProjectId = 'test-project-id';
  const mockNodeId = 'test-node-id';
  const mockGalleryType = 'drawings' as const;
  const mockFirstType = 1;
  const mockSecondType = 2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GalleryService,
        {
          provide: DatabaseService,
          useValue: {
            galleryType: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
            },
            galleryItem: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
            },
            fileSystemNode: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn(),
            },
            projectMember: {
              findFirst: jest.fn(),
            },
            role: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<GalleryService>(GalleryService);
    database = module.get<DatabaseService>(DatabaseService);
    prisma = database['prisma'];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTypes', () => {
    it('应该返回分类列表', async () => {
      const mockTypes = [
        {
          id: 1,
          pid: 0,
          name: '建筑',
          status: 1,
          galleryType: 'drawings',
          ownerId: mockUserId,
        },
        {
          id: 2,
          pid: 1,
          name: '门',
          status: 1,
          galleryType: 'drawings',
          ownerId: mockUserId,
        },
      ];

      jest
        .spyOn(prisma.galleryType, 'findMany')
        .mockResolvedValueOnce([mockTypes[0]])
        .mockResolvedValueOnce([mockTypes[1]]);

      const result = await service.getTypes('drawings', mockUserId);

      expect(result.code).toBe('success');
      expect(result.result.allblocks).toHaveLength(2);
      expect(result.result.allblocks[0].id).toBe(1);
      expect(result.result.allblocks[1].id).toBe(2);
    });
  });

  describe('addToGallery', () => {
    it('应该成功添加文件到图库', async () => {
      const mockNode = {
        id: mockNodeId,
        isFolder: false,
        parentId: mockProjectId,
        ownerId: mockUserId,
        isRoot: false,
      };

      const mockProject = {
        id: mockProjectId,
        ownerId: mockUserId,
        isRoot: true,
      };

      const mockType = {
        id: mockSecondType,
        pid: mockFirstType,
        name: '门',
        galleryType: 'drawings',
        ownerId: mockUserId,
      };

      const mockFirstTypeRecord = {
        id: mockFirstType,
        pid: 0,
        galleryType: 'drawings',
      };

      const mockCreatedItem = {
        id: 'gallery-item-id',
        userId: mockUserId,
        nodeId: mockNodeId,
        galleryType: 'drawings',
        firstType: mockFirstType,
        secondType: mockSecondType,
        thirdType: null,
        lookNum: 0,
      };

      jest
        .spyOn(prisma.fileSystemNode, 'findUnique')
        .mockResolvedValue(mockNode as any);
      jest
        .spyOn(prisma.fileSystemNode, 'findUnique')
        .mockResolvedValue(mockProject as any);
      jest
        .spyOn(prisma.galleryType, 'findUnique')
        .mockResolvedValueOnce(mockType as any)
        .mockResolvedValueOnce(mockFirstTypeRecord as any);
      jest.spyOn(prisma.galleryItem, 'findFirst').mockResolvedValue(null);
      jest
        .spyOn(prisma.galleryItem, 'create')
        .mockResolvedValue(mockCreatedItem as any);

      const result = await service.addToGallery(
        mockNodeId,
        mockFirstType,
        mockSecondType,
        undefined,
        'drawings',
        mockUserId
      );

      expect(result.nodeId).toBe(mockNodeId);
      expect(result.firstType).toBe(mockFirstType);
      expect(result.secondType).toBe(mockSecondType);
      expect(result.galleryType).toBe('drawings');
    });

    it('如果文件不存在应该抛出错误', async () => {
      jest.spyOn(prisma.fileSystemNode, 'findUnique').mockResolvedValue(null);

      await expect(
        service.addToGallery(
          mockNodeId,
          mockFirstType,
          mockSecondType,
          undefined,
          'drawings',
          mockUserId
        )
      ).rejects.toThrow('文件不存在');
    });

    it('如果是文件夹应该抛出错误', async () => {
      const mockNode = {
        id: mockNodeId,
        isFolder: true,
        parentId: mockProjectId,
        ownerId: mockUserId,
        isRoot: false,
      };

      jest
        .spyOn(prisma.fileSystemNode, 'findUnique')
        .mockResolvedValue(mockNode as any);

      await expect(
        service.addToGallery(
          mockNodeId,
          mockFirstType,
          mockSecondType,
          undefined,
          'drawings',
          mockUserId
        )
      ).rejects.toThrow('不能添加文件夹到图库');
    });

    it('如果文件已经在图库中应该抛出错误', async () => {
      const mockNode = {
        id: mockNodeId,
        isFolder: false,
        parentId: mockProjectId,
        ownerId: mockUserId,
        isRoot: false,
      };

      const mockProject = {
        id: mockProjectId,
        ownerId: mockUserId,
        isRoot: true,
      };

      const mockType = {
        id: mockSecondType,
        pid: mockFirstType,
        name: '门',
        galleryType: 'drawings',
        ownerId: mockUserId,
      };

      const mockFirstTypeRecord = {
        id: mockFirstType,
        pid: 0,
        galleryType: 'drawings',
      };

      const mockExistingItem = {
        id: 'existing-gallery-item-id',
        userId: mockUserId,
        nodeId: mockNodeId,
        galleryType: 'drawings',
        firstType: mockFirstType,
        secondType: mockSecondType,
      };

      jest
        .spyOn(prisma.fileSystemNode, 'findUnique')
        .mockResolvedValue(mockNode as any);
      jest
        .spyOn(prisma.fileSystemNode, 'findUnique')
        .mockResolvedValue(mockProject as any);
      jest
        .spyOn(prisma.galleryType, 'findUnique')
        .mockResolvedValueOnce(mockType as any)
        .mockResolvedValueOnce(mockFirstTypeRecord as any);
      jest
        .spyOn(prisma.galleryItem, 'findFirst')
        .mockResolvedValue(mockExistingItem as any);

      await expect(
        service.addToGallery(
          mockNodeId,
          mockFirstType,
          mockSecondType,
          undefined,
          'drawings',
          mockUserId
        )
      ).rejects.toThrow('该文件已经在您的图库中');
    });
  });

  describe('removeFromGallery', () => {
    it('应该成功从图库移除文件', async () => {
      jest
        .spyOn(prisma.galleryItem, 'deleteMany')
        .mockResolvedValue({ count: 1 });

      await expect(
        service.removeFromGallery(mockNodeId, 'drawings', mockUserId)
      ).resolves.not.toThrow();

      expect(prisma.galleryItem.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          nodeId: mockNodeId,
          galleryType: 'drawings',
        },
      });
    });
  });

  describe('incrementLookNum', () => {
    it('应该成功增加浏览次数', async () => {
      const mockGalleryItem = {
        id: 'gallery-item-id',
        nodeId: mockNodeId,
        galleryType: 'drawings',
        lookNum: 5,
      };

      jest
        .spyOn(prisma.galleryItem, 'findFirst')
        .mockResolvedValue(mockGalleryItem as any);
      jest.spyOn(prisma.galleryItem, 'update').mockResolvedValue({
        ...mockGalleryItem,
        lookNum: 6,
      } as any);

      await expect(
        service.incrementLookNum(mockNodeId, 'drawings')
      ).resolves.not.toThrow();

      expect(prisma.galleryItem.update).toHaveBeenCalledWith({
        where: { id: mockGalleryItem.id },
        data: { lookNum: { increment: 1 } },
      });
    });

    it('如果图库项不存在应该忽略', async () => {
      jest.spyOn(prisma.galleryItem, 'findFirst').mockResolvedValue(null);

      await expect(
        service.incrementLookNum(mockNodeId, 'drawings')
      ).resolves.not.toThrow();

      expect(prisma.galleryItem.update).not.toHaveBeenCalled();
    });
  });

  describe('createType', () => {
    it('应该成功创建一级分类', async () => {
      const mockCreatedType = {
        id: 1,
        pid: 0,
        name: '建筑',
        status: 1,
        galleryType: 'drawings',
        ownerId: mockUserId,
      };

      jest.spyOn(prisma.galleryType, 'findFirst').mockResolvedValue(null);
      jest
        .spyOn(prisma.galleryType, 'create')
        .mockResolvedValue(mockCreatedType as any);

      const result = await service.createType(
        'drawings',
        '建筑',
        0,
        mockUserId
      );

      expect(result.id).toBe(1);
      expect(result.name).toBe('建筑');
      expect(result.pid).toBe(0);
    });

    it('如果分类名称已存在应该抛出错误', async () => {
      const mockExistingType = {
        id: 1,
        pid: 0,
        name: '建筑',
        galleryType: 'drawings',
        ownerId: mockUserId,
      };

      jest
        .spyOn(prisma.galleryType, 'findFirst')
        .mockResolvedValue(mockExistingType as any);

      await expect(
        service.createType('drawings', '建筑', 0, mockUserId)
      ).rejects.toThrow('分类名称已存在');
    });
  });

  describe('updateType', () => {
    it('应该成功更新分类名称', async () => {
      const mockType = {
        id: 1,
        pid: 0,
        name: '建筑',
        galleryType: 'drawings',
        ownerId: mockUserId,
      };

      const mockUpdatedType = {
        ...mockType,
        name: '建筑设计',
      };

      jest
        .spyOn(prisma.galleryType, 'findUnique')
        .mockResolvedValue(mockType as any);
      jest.spyOn(prisma.galleryType, 'findFirst').mockResolvedValue(null);
      jest
        .spyOn(prisma.galleryType, 'update')
        .mockResolvedValue(mockUpdatedType as any);

      const result = await service.updateType(
        1,
        '建筑设计',
        'drawings',
        mockUserId
      );

      expect(result.name).toBe('建筑设计');
    });

    it('如果分类不存在应该抛出错误', async () => {
      jest.spyOn(prisma.galleryType, 'findUnique').mockResolvedValue(null);

      await expect(
        service.updateType(999, '建筑设计', 'drawings', mockUserId)
      ).rejects.toThrow('分类不存在');
    });
  });

  describe('deleteType', () => {
    it('应该成功删除分类', async () => {
      const mockType = {
        id: 1,
        pid: 0,
        name: '建筑',
        galleryType: 'drawings',
        ownerId: mockUserId,
      };

      jest
        .spyOn(prisma.galleryType, 'findUnique')
        .mockResolvedValue(mockType as any);
      jest.spyOn(prisma.galleryType, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.galleryItem, 'findMany').mockResolvedValue([]);
      jest
        .spyOn(prisma.galleryType, 'delete')
        .mockResolvedValue(mockType as any);

      await expect(
        service.deleteType(1, 'drawings', mockUserId)
      ).resolves.not.toThrow();

      expect(prisma.galleryType.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('如果分类下有子分类应该抛出错误', async () => {
      const mockType = {
        id: 1,
        pid: 0,
        name: '建筑',
        galleryType: 'drawings',
        ownerId: mockUserId,
      };

      const mockChildTypes = [
        {
          id: 2,
          pid: 1,
          name: '门',
          galleryType: 'drawings',
          ownerId: mockUserId,
        },
      ];

      jest
        .spyOn(prisma.galleryType, 'findUnique')
        .mockResolvedValue(mockType as any);
      jest
        .spyOn(prisma.galleryType, 'findMany')
        .mockResolvedValue(mockChildTypes as any);

      await expect(
        service.deleteType(1, 'drawings', mockUserId)
      ).rejects.toThrow('该分类下有子分类，无法删除');
    });

    it('如果分类下有文件应该抛出错误', async () => {
      const mockType = {
        id: 1,
        pid: 0,
        name: '建筑',
        galleryType: 'drawings',
        ownerId: mockUserId,
      };

      const mockItems = [
        {
          id: 'item-1',
          userId: mockUserId,
          nodeId: 'node-1',
          firstType: 1,
          secondType: 2,
          galleryType: 'drawings',
        },
      ];

      jest
        .spyOn(prisma.galleryType, 'findUnique')
        .mockResolvedValue(mockType as any);
      jest.spyOn(prisma.galleryType, 'findMany').mockResolvedValue([]);
      jest
        .spyOn(prisma.galleryItem, 'findMany')
        .mockResolvedValue(mockItems as any);

      await expect(
        service.deleteType(1, 'drawings', mockUserId)
      ).rejects.toThrow('该分类下有文件，无法删除');
    });
  });
});
