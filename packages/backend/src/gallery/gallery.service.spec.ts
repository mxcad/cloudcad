import { Test, TestingModule } from '@nestjs/testing';
import { GalleryService } from './gallery.service';
import { DatabaseService } from '../database/database.service';
import { GalleryFileListDto } from './dto/gallery.dto';

describe('GalleryService', () => {
  let service: GalleryService;
  let databaseService: DatabaseService;

  const mockDatabaseService = {
    fileSystemNode: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    tag: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GalleryService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<GalleryService>(GalleryService);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTypes', () => {
    const mockUserId = 'user-123';

    it('应该成功获取图纸库分类列表', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: '建筑项目',
          ownerId: mockUserId,
          isRoot: true,
          isFolder: true,
          deletedAt: null,
          createdAt: new Date(),
        },
        {
          id: 'project-2',
          name: '机械项目',
          ownerId: mockUserId,
          isRoot: true,
          isFolder: true,
          deletedAt: null,
          createdAt: new Date(),
        },
      ];

      const mockTags = [
        {
          id: 'tag-1',
          name: '门',
          isSystem: false,
          createdAt: new Date(),
        },
        {
          id: 'tag-2',
          name: '窗',
          isSystem: false,
          createdAt: new Date(),
        },
      ];

      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(
        mockProjects
      );
      mockDatabaseService.tag.findMany.mockResolvedValue(mockTags);

      const result = await service.getTypes('drawings', mockUserId);

      expect(result).toBeDefined();
      expect(result.code).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.allblocks).toBeDefined();
      expect(Array.isArray(result.result.allblocks)).toBe(true);
      expect(result.result.allblocks.length).toBeGreaterThan(0);
    });

    it('应该成功获取图块库分类列表', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: '建筑项目',
          ownerId: mockUserId,
          isRoot: true,
          isFolder: true,
          deletedAt: null,
          createdAt: new Date(),
        },
      ];

      const mockTags = [
        {
          id: 'tag-1',
          name: '门',
          isSystem: false,
          createdAt: new Date(),
        },
      ];

      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(
        mockProjects
      );
      mockDatabaseService.tag.findMany.mockResolvedValue(mockTags);

      const result = await service.getTypes('blocks', mockUserId);

      expect(result).toBeDefined();
      expect(result.code).toBe('success');
      expect(result.result).toBeDefined();
      expect(result.result.allblocks).toBeDefined();
      expect(Array.isArray(result.result.allblocks)).toBe(true);
    });

    it('应该返回正确的分类数据结构', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: '建筑项目',
          ownerId: mockUserId,
          isRoot: true,
          isFolder: true,
          deletedAt: null,
          createdAt: new Date(),
        },
      ];

      const mockTags = [
        {
          id: 'tag-1',
          name: '门',
          isSystem: false,
          createdAt: new Date(),
        },
      ];

      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(
        mockProjects
      );
      mockDatabaseService.tag.findMany.mockResolvedValue(mockTags);

      const result = await service.getTypes('drawings', mockUserId);

      const firstType = result.result.allblocks[0];
      expect(firstType).toHaveProperty('id');
      expect(firstType).toHaveProperty('pid');
      expect(firstType).toHaveProperty('name');
      expect(firstType).toHaveProperty('pname');
      expect(firstType).toHaveProperty('status');
      expect(typeof firstType.id).toBe('number');
      expect(typeof firstType.pid).toBe('number');
      expect(typeof firstType.name).toBe('string');
      expect(typeof firstType.pname).toBe('string');
      expect(typeof firstType.status).toBe('number');
    });

    it('应该包含一级和二级分类', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: '建筑项目',
          ownerId: mockUserId,
          isRoot: true,
          isFolder: true,
          deletedAt: null,
          createdAt: new Date(),
        },
      ];

      const mockTags = [
        {
          id: 'tag-1',
          name: '门',
          isSystem: false,
          createdAt: new Date(),
        },
      ];

      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(
        mockProjects
      );
      mockDatabaseService.tag.findMany.mockResolvedValue(mockTags);

      const result = await service.getTypes('drawings', mockUserId);

      const types = result.result.allblocks;
      const hasFirstLevel = types.some((t) => t.pid === 0);
      const hasSecondLevel = types.some((t) => t.pid !== 0);

      expect(hasFirstLevel).toBe(true);
      expect(hasSecondLevel).toBe(true);
    });

    it('所有分类状态应该为 1（启用）', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: '建筑项目',
          ownerId: mockUserId,
          isRoot: true,
          isFolder: true,
          deletedAt: null,
          createdAt: new Date(),
        },
      ];

      const mockTags = [
        {
          id: 'tag-1',
          name: '门',
          isSystem: false,
          createdAt: new Date(),
        },
      ];

      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(
        mockProjects
      );
      mockDatabaseService.tag.findMany.mockResolvedValue(mockTags);

      const result = await service.getTypes('drawings', mockUserId);

      const allEnabled = result.result.allblocks.every((t) => t.status === 1);
      expect(allEnabled).toBe(true);
    });

    it('应该只返回用户自定义标签（排除系统标签）', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: '建筑项目',
          ownerId: mockUserId,
          isRoot: true,
          isFolder: true,
          deletedAt: null,
          createdAt: new Date(),
        },
      ];

      const mockTags = [
        {
          id: 'tag-1',
          name: '门',
          isSystem: false,
          createdAt: new Date(),
        },
        {
          id: 'tag-2',
          name: '窗',
          isSystem: false,
          createdAt: new Date(),
        },
      ];

      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(
        mockProjects
      );
      mockDatabaseService.tag.findMany.mockResolvedValue(mockTags);

      const result = await service.getTypes('drawings', mockUserId);

      const typeNames = result.result.allblocks.map((t) => t.name);
      expect(typeNames).toContain('门');
      expect(typeNames).toContain('窗');
      expect(typeNames).toContain('建筑项目');
    });
  });

  describe('getFileList', () => {
    const mockUserId = 'user-123';

    it('应该成功获取图纸列表（无过滤条件）', async () => {
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [
        {
          id: 'file-1',
          originalName: 'drawing.dwg',
          name: 'drawing.dwg',
          ownerId: mockUserId,
          isFolder: false,
          deletedAt: null,
          extension: '.dwg',
          fileHash: 'abc123',
          path: '/mxcad/file/abc123/drawing.dwg',
          parentId: 'project-1',
          createdAt: new Date(),
          nodeTags: [
            {
              tag: {
                id: 'tag-1',
                name: '图纸',
                isSystem: true,
              },
            },
          ],
          parent: {
            id: 'project-1',
            name: '建筑项目',
          },
        },
      ];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(1);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      expect(result).toBeDefined();
      expect(result.sharedwgs).toBeDefined();
      expect(result.page).toBeDefined();
      expect(Array.isArray(result.sharedwgs)).toBe(true);
      expect(result.sharedwgs.length).toBeGreaterThan(0);
    });

    it('应该成功获取图块列表（无过滤条件）', async () => {
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [
        {
          id: 'file-1',
          originalName: 'block.dwg',
          name: 'block.dwg',
          ownerId: mockUserId,
          isFolder: false,
          deletedAt: null,
          extension: '.dwg',
          fileHash: 'def456',
          path: '/mxcad/file/def456/block.dwg',
          parentId: 'project-1',
          createdAt: new Date(),
          nodeTags: [
            {
              tag: {
                id: 'tag-1',
                name: '图块',
                isSystem: true,
              },
            },
          ],
          parent: {
            id: 'project-1',
            name: '建筑项目',
          },
        },
      ];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(1);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'blocks', mockUserId);

      expect(result).toBeDefined();
      expect(result.sharedwgs).toBeDefined();
      expect(result.page).toBeDefined();
      expect(Array.isArray(result.sharedwgs)).toBe(true);
    });

    it('应该支持关键字搜索', async () => {
      const dto: GalleryFileListDto = {
        keywords: '箭头',
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(0);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      expect(result).toBeDefined();
      expect(result.sharedwgs).toBeDefined();
      expect(Array.isArray(result.sharedwgs)).toBe(true);
    });

    it('应该支持按项目筛选（firstType）', async () => {
      const dto: GalleryFileListDto = {
        firstType: 123,
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(0);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      expect(result).toBeDefined();
      expect(result.sharedwgs).toBeDefined();
      expect(Array.isArray(result.sharedwgs)).toBe(true);
    });

    it('应该支持按标签筛选（secondType）', async () => {
      const dto: GalleryFileListDto = {
        secondType: 456,
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(0);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      expect(result).toBeDefined();
      expect(result.sharedwgs).toBeDefined();
      expect(Array.isArray(result.sharedwgs)).toBe(true);
    });

    it('应该返回正确的文件数据结构', async () => {
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [
        {
          id: 'file-1',
          originalName: 'drawing.dwg',
          name: 'drawing.dwg',
          ownerId: mockUserId,
          isFolder: false,
          deletedAt: null,
          extension: '.dwg',
          fileHash: 'abc123',
          path: '/mxcad/file/abc123/drawing.dwg',
          parentId: 'project-1',
          createdAt: new Date(),
          nodeTags: [
            {
              tag: {
                id: 'tag-1',
                name: '图纸',
                isSystem: true,
              },
            },
          ],
          parent: {
            id: 'project-1',
            name: '建筑项目',
          },
        },
      ];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(1);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      const firstFile = result.sharedwgs[0];
      expect(firstFile).toHaveProperty('uuid');
      expect(firstFile).toHaveProperty('filename');
      expect(firstFile).toHaveProperty('firstType');
      expect(firstFile).toHaveProperty('secondType');
      expect(firstFile).toHaveProperty('filehash');
      expect(firstFile).toHaveProperty('type');
      expect(firstFile).toHaveProperty('lookNum');
      expect(firstFile).toHaveProperty('likeNum');
      expect(firstFile).toHaveProperty('collect');
      expect(typeof firstFile.uuid).toBe('string');
      expect(typeof firstFile.filename).toBe('string');
      expect(typeof firstFile.firstType).toBe('number');
      expect(typeof firstFile.secondType).toBe('number');
      expect(typeof firstFile.filehash).toBe('string');
      expect(typeof firstFile.type).toBe('string');
      expect(typeof firstFile.lookNum).toBe('number');
      expect(typeof firstFile.likeNum).toBe('number');
      expect(typeof firstFile.collect).toBe('boolean');
    });

    it('应该返回正确的分页信息', async () => {
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(0);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      expect(result.page).toHaveProperty('index');
      expect(result.page).toHaveProperty('size');
      expect(result.page).toHaveProperty('count');
      expect(result.page).toHaveProperty('max');
      expect(result.page).toHaveProperty('up');
      expect(result.page).toHaveProperty('down');
      expect(typeof result.page.index).toBe('number');
      expect(typeof result.page.size).toBe('number');
      expect(typeof result.page.count).toBe('number');
      expect(typeof result.page.max).toBe('number');
      expect(typeof result.page.up).toBe('boolean');
      expect(typeof result.page.down).toBe('boolean');
    });

    it('应该正确计算总页数', async () => {
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(100);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      expect(result.page.max).toBe(2);
    });

    it('第一页应该没有上一页', async () => {
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(0);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      expect(result.page.up).toBe(false);
    });

    it('lookNum 和 likeNum 应该为非负数', async () => {
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockNodes = [
        {
          id: 'file-1',
          originalName: 'drawing.dwg',
          name: 'drawing.dwg',
          ownerId: mockUserId,
          isFolder: false,
          deletedAt: null,
          extension: '.dwg',
          fileHash: 'abc123',
          path: '/mxcad/file/abc123/drawing.dwg',
          parentId: 'project-1',
          createdAt: new Date(),
          nodeTags: [
            {
              tag: {
                id: 'tag-1',
                name: '图纸',
                isSystem: true,
              },
            },
          ],
          parent: {
            id: 'project-1',
            name: '建筑项目',
          },
        },
      ];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(1);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      result.sharedwgs.forEach((file) => {
        expect(file.lookNum).toBeGreaterThanOrEqual(0);
        expect(file.likeNum).toBeGreaterThanOrEqual(0);
      });
    });

    it('应该正确处理参数类型转换（字符串转数字）', async () => {
      const dto: GalleryFileListDto = {
        firstType: '123' as any,
        secondType: '456' as any,
        pageIndex: '0' as any,
        pageSize: '50' as any,
      };

      const mockNodes = [];

      mockDatabaseService.fileSystemNode.count.mockResolvedValue(0);
      mockDatabaseService.fileSystemNode.findMany.mockResolvedValue(mockNodes);

      const result = await service.getFileList(dto, 'drawings', mockUserId);

      expect(result.page.index).toBe(0);
      expect(result.page.size).toBe(50);
    });
  });
});
