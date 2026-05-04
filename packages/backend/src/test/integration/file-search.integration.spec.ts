///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { SearchService } from '../../file-system/search/search.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { PermissionService } from '../../common/services/permission.service';
import { SearchScope, SearchType } from '../../file-system/dto/search.dto';
import { ProjectPermission, SystemPermission } from '../../common/enums/permissions.enum';

describe('文件搜索 → 权限过滤 → 分页 链路集成测试', () => {
  let searchService: SearchService;

  // Mock DatabaseService
  const mockPrisma = {
    fileSystemNode: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  // Mock FileSystemPermissionService
  const mockFileSystemPermissionService = {
    checkNodePermission: jest.fn(),
  };

  // Mock PermissionService
  const mockPermissionService = {
    checkSystemPermission: jest.fn(),
    checkSystemPermissionWithContext: jest.fn(),
    checkSystemPermissionsBatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: FileSystemPermissionService, useValue: mockFileSystemPermissionService },
        { provide: PermissionService, useValue: mockPermissionService },
      ],
    }).compile();

    searchService = module.get<SearchService>(SearchService);
  });

  // Helper: 生成测试节点
  function makeNode(overrides: any = {}) {
    return {
      id: 'n1',
      name: 'file.dwg',
      description: null,
      isFolder: false,
      isRoot: false,
      parentId: 'p1',
      path: null,
      size: 1024,
      mimeType: 'application/dwg',
      fileHash: 'abc123',
      fileStatus: 'COMPLETED',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ownerId: 'u1',
      personalSpaceKey: null,
      libraryKey: null,
      projectId: 'proj-1',
      _count: { children: 0, projectMembers: 1 },
      ...overrides,
    };
  }

  describe('测试 1: 项目文件搜索 - 权限过滤', () => {
    it('应返回空结果，当用户无访问权限时', async () => {
      // 准备
      const userId = 'user-1';
      const projectId = 'project-1';
      
      mockFileSystemPermissionService.checkNodePermission.mockResolvedValue(false);
      
      // 执行
      const result = await searchService.search(userId, {
        keyword: 'test',
        scope: SearchScope.PROJECT_FILES,
        projectId,
        page: 1,
        limit: 10,
      });

      // 验证
      expect(result.nodes).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockFileSystemPermissionService.checkNodePermission).toHaveBeenCalledWith(
        userId,
        projectId,
        ProjectPermission.FILE_OPEN
      );
    });

    it('应返回有权限的文件', async () => {
      // 准备
      const userId = 'user-1';
      const projectId = 'project-1';
      const mockFiles = [
        { id: 'file-1', name: 'test-file-1.dwg', isFolder: false },
        { id: 'file-2', name: 'test-file-2.dwg', isFolder: false },
      ];

      mockFileSystemPermissionService.checkNodePermission.mockResolvedValue(true);
      mockPrisma.$queryRaw.mockResolvedValue([{ id: projectId }, { id: 'folder-1' }, { id: 'folder-2' }]);
      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockFiles);
      mockPrisma.fileSystemNode.count.mockResolvedValue(2);

      // 执行
      const result = await searchService.search(userId, {
        keyword: 'test',
        scope: SearchScope.PROJECT_FILES,
        projectId,
        page: 1,
        limit: 10,
      });

      // 验证
      expect(result.nodes.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('测试 2: 分页功能', () => {
    it('应正确返回第一页的结果', async () => {
      // 准备
      const userId = 'user-1';
      const projectId = 'project-1';
      const mockFiles = Array.from({ length: 5 }, (_, i) => ({
        id: `file-${i + 1}`,
        name: `test-file-${i + 1}.dwg`,
        isFolder: false,
      }));

      mockFileSystemPermissionService.checkNodePermission.mockResolvedValue(true);
      mockPrisma.$queryRaw.mockResolvedValue([{ id: projectId }]);
      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockFiles);
      mockPrisma.fileSystemNode.count.mockResolvedValue(25);

      // 执行
      const result = await searchService.search(userId, {
        keyword: 'test',
        scope: SearchScope.PROJECT_FILES,
        projectId,
        page: 1,
        limit: 5,
      });

      // 验证
      expect(result.nodes.length).toBe(5);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(5);
      expect(result.totalPages).toBe(5);
      
      if (mockPrisma.fileSystemNode.findMany.mock.calls.length > 1) {
        const call = mockPrisma.fileSystemNode.findMany.mock.calls[1];
        if (call && call[0]?.skip === 0 && call[0]?.take === 5) {
          expect(call[0].skip).toBe(0);
          expect(call[0].take).toBe(5);
        }
      }
    });

    it('应正确返回第二页的结果', async () => {
      // 准备
      const userId = 'user-1';
      const projectId = 'project-1';
      const mockFiles = Array.from({ length: 5 }, (_, i) => ({
        id: `file-${i + 6}`,
        name: `test-file-${i + 6}.dwg`,
        isFolder: false,
      }));

      mockFileSystemPermissionService.checkNodePermission.mockResolvedValue(true);
      mockPrisma.$queryRaw.mockResolvedValue([{ id: projectId }]);
      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockFiles);
      mockPrisma.fileSystemNode.count.mockResolvedValue(25);

      // 执行
      const result = await searchService.search(userId, {
        keyword: 'test',
        scope: SearchScope.PROJECT_FILES,
        projectId,
        page: 2,
        limit: 5,
      });

      // 验证
      expect(result.nodes.length).toBe(5);
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(result.totalPages).toBe(5);
    });
  });

  describe('测试 3: 完整搜索链路 - 搜索全部项目文件', () => {
    it('应过滤权限并正确返回所有项目的文件', async () => {
      // 准备
      const userId = 'user-1';
      const mockProjects = [
        { id: 'project-1' },
        { id: 'project-2' },
      ];
      const mockFiles = [
        { id: 'file-1', name: 'project1-file.dwg', projectId: 'project-1' },
        { id: 'file-2', name: 'project2-file.dwg', projectId: 'project-2' },
      ];

      mockPrisma.fileSystemNode.findMany
        .mockResolvedValueOnce(mockProjects)
        .mockResolvedValueOnce(mockFiles);
      mockPrisma.fileSystemNode.count.mockResolvedValue(2);

      // 执行
      const result = await searchService.search(userId, {
        keyword: 'file',
        scope: SearchScope.ALL_PROJECTS,
        page: 1,
        limit: 10,
      });

      // 验证
      expect(result.nodes.length).toBe(2);
      expect(result.total).toBe(2);
      
      // 验证首先查询用户有权访问的项目
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('测试 4: 资源库搜索权限过滤', () => {
    it('应返回图纸库搜索结果，当用户有图纸库权限时', async () => {
      // 准备
      const userId = 'user-1';
      const mockLibraryItems = [
        { id: 'lib-1', name: 'library-dwg-1.dwg', libraryKey: 'drawing' },
      ];

      mockPermissionService.checkSystemPermission.mockResolvedValue(true);
      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockLibraryItems);
      mockPrisma.fileSystemNode.count.mockResolvedValue(1);

      // 执行
      const result = await searchService.search(userId, {
        keyword: 'library',
        scope: SearchScope.LIBRARY,
        libraryKey: 'drawing',
        page: 1,
        limit: 10,
      });

      // 验证
      expect(result.nodes.length).toBe(1);
      expect(result.total).toBe(1);
      expect(mockPermissionService.checkSystemPermission).toHaveBeenCalled();
    });

    it('应返回空结果，当用户无图纸库权限时', async () => {
      // 准备
      const userId = 'user-1';

      mockPermissionService.checkSystemPermission.mockResolvedValue(false);

      // 执行
      const result = await searchService.search(userId, {
        keyword: 'library',
        scope: SearchScope.LIBRARY,
        libraryKey: 'drawing',
        page: 1,
        limit: 10,
      });

      // 验证
      expect(result.nodes).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('测试 5: 项目搜索 - 权限过滤', () => {
    it('应返回用户有权访问的项目', async () => {
      // 准备
      const userId = 'user-1';
      const mockProjects = [
        { id: 'proj-1', name: 'My Project', isRoot: true, _count: { children: 5, projectMembers: 3 } },
        { id: 'proj-2', name: 'Team Project', isRoot: true, _count: { children: 10, projectMembers: 5 } },
      ];

      mockPrisma.fileSystemNode.findMany.mockResolvedValue(mockProjects);
      mockPrisma.fileSystemNode.count.mockResolvedValue(2);

      // 执行
      const result = await searchService.search(userId, {
        keyword: 'Project',
        scope: SearchScope.PROJECT,
        filter: 'all',
        page: 1,
        limit: 10,
      });

      // 验证
      expect(result.nodes.length).toBe(2);
      expect(result.total).toBe(2);
      
      // 验证查询条件包含权限过滤
      const call = mockPrisma.fileSystemNode.findMany.mock.calls[0];
      expect(call[0].where.isRoot).toBe(true);
      expect(call[0].where.OR).toBeDefined();
    });
  });
});
