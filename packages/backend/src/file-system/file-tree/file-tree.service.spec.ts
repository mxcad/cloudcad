///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { NodeType, FileStatus } from '@cloudcad/db';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { DatabaseService } from '../../database/database.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { StorageInfoService } from '../storage-quota/storage-info.service';
import { FtsQueryBuilder } from '../search/fts-query-builder';
import { AncestorQueryService } from '../../common/services/ancestor-query.service';
import { FileTreeService } from './file-tree.service';
import { TreeWalker } from './tree-walker.service';
import { AuditLogService } from '../../audit/audit-log.service';

describe('FileTreeService', () => {
  let service: FileTreeService;

  // Prisma mock helpers
  const mockPrisma = {
    fileSystemNode: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const mockStorageManager = {
    allocateNodeStorage: jest.fn(),
    getFullPath: jest.fn(),
  };

  const mockStorageInfoService = {
    invalidateQuotaCache: jest.fn(),
  };

  const mockStorageService = {
    copyFromFs: jest.fn(),
  };

  const mockFtsQueryBuilder = {
    matchIds: jest
      .fn()
      .mockResolvedValue({ ids: new Set<string>(), matched: false }),
    buildSearchOrConditions: jest.fn().mockReturnValue([]),
  };

  const mockAncestorQueryService = {
    buildAncestorPaths: jest.fn().mockResolvedValue([]),
  };

  const mockTreeWalker = {
    resolveProjectId: jest.fn(),
    getSubtreeIds: jest.fn(),
    getSubtreeFileIds: jest.fn(),
    getSubtreeFilesPaginated: jest.fn(),
    getSubtreeFilesFilteredPaginated: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockFtsQueryBuilder.matchIds.mockResolvedValue({
      ids: new Set<string>(),
      matched: false,
    });
    mockFtsQueryBuilder.buildSearchOrConditions.mockReturnValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileTreeService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: StorageInfoService, useValue: mockStorageInfoService },
        { provide: IStorageService, useValue: mockStorageService },
        { provide: FtsQueryBuilder, useValue: mockFtsQueryBuilder },
        { provide: AncestorQueryService, useValue: mockAncestorQueryService },
        { provide: TreeWalker, useValue: mockTreeWalker },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn(),
            logProjectNodeAction: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<FileTreeService>(FileTreeService);
  });

  // ==================== createFileNode ====================
  describe('createFileNode', () => {
    const defaultOptions = {
      name: 'test.dwg',
      fileHash: 'abc123',
      size: 1024,
      mimeType: 'application/dwg',
      extension: '.dwg',
      parentId: 'parent-1',
      ownerId: 'user-1',
      skipFileCopy: true,
    };

    it('should create a file node successfully', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        nodeType: NodeType.FOLDER,
        projectId: 'proj-1',
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          fileSystemNode: {
            findMany: mockPrisma.fileSystemNode.findMany,
            findUnique: mockPrisma.fileSystemNode.findUnique,
            create: mockPrisma.fileSystemNode.create,
            update: mockPrisma.fileSystemNode.update,
          },
        };
        return cb(tx);
      });
      mockPrisma.fileSystemNode.create.mockResolvedValue({
        id: 'node-1',
        name: 'test.dwg',
        nodeType: NodeType.FILE,
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('proj-1');
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          id: 'parent-1',
          nodeType: NodeType.FOLDER,
          projectId: 'proj-1',
        }) // parent check
        .mockResolvedValueOnce({ id: 'node-1', name: 'test.dwg' }); // return from transaction

      const result = await service.createFileNode(defaultOptions);
      expect(result).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockStorageInfoService.invalidateQuotaCache).toHaveBeenCalled();
    });

    it('should throw NotFoundException when parent not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.createFileNode(defaultOptions)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when parent is not a folder', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        nodeType: NodeType.FILE,
      });
      await expect(service.createFileNode(defaultOptions)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should generate unique name when file name conflicts', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        nodeType: NodeType.FOLDER,
        projectId: 'proj-1',
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { name: 'test.dwg' },
        { name: 'test (1).dwg' },
      ]);
      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          fileSystemNode: {
            findMany: mockPrisma.fileSystemNode.findMany,
            findUnique: mockPrisma.fileSystemNode.findUnique,
            create: jest
              .fn()
              .mockResolvedValue({ id: 'node-2', name: 'test (2).dwg' }),
            update: jest.fn(),
          },
        };
        return cb(tx);
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('proj-1');
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          id: 'parent-1',
          nodeType: NodeType.FOLDER,
          projectId: 'proj-1',
        })
        .mockResolvedValueOnce({ id: 'node-2', name: 'test (2).dwg' });

      const result = await service.createFileNode(defaultOptions);
      expect(result).toBeDefined();
    });

    it('落库前清洗文件名（.. 路径段 → basename），防路径遍历进入 name/originalName', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        nodeType: NodeType.FOLDER,
        projectId: 'proj-1',
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          fileSystemNode: {
            findMany: mockPrisma.fileSystemNode.findMany,
            findUnique: mockPrisma.fileSystemNode.findUnique,
            create: mockPrisma.fileSystemNode.create,
            update: mockPrisma.fileSystemNode.update,
          },
        };
        return cb(tx);
      });
      mockPrisma.fileSystemNode.create.mockResolvedValue({
        id: 'node-1',
        name: 'evil.dwg',
        nodeType: NodeType.FILE,
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('proj-1');

      await service.createFileNode({ ...defaultOptions, name: '../../evil.dwg' });

      expect(mockPrisma.fileSystemNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'evil.dwg',
            originalName: 'evil.dwg',
          }),
        })
      );
    });

    it('清洗后为空的名字（纯点/路径段）400，不落库', async () => {
      await expect(
        service.createFileNode({ ...defaultOptions, name: '..' })
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.fileSystemNode.create).not.toHaveBeenCalled();
    });

    it('含合法特殊字符的名字（括号/空格）不被误拒', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        nodeType: NodeType.FOLDER,
        projectId: 'proj-1',
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          fileSystemNode: {
            findMany: mockPrisma.fileSystemNode.findMany,
            findUnique: mockPrisma.fileSystemNode.findUnique,
            create: mockPrisma.fileSystemNode.create,
            update: mockPrisma.fileSystemNode.update,
          },
        };
        return cb(tx);
      });
      mockPrisma.fileSystemNode.create.mockResolvedValue({
        id: 'node-1',
        name: '图纸 (1).dwg',
        nodeType: NodeType.FILE,
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('proj-1');

      await service.createFileNode({ ...defaultOptions, name: '图纸 (1).dwg' });

      expect(mockPrisma.fileSystemNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: '图纸 (1).dwg',
            originalName: '图纸 (1).dwg',
          }),
        })
      );
    });
  });

  // ==================== createDrawingFromTemplate ====================
  describe('createDrawingFromTemplate', () => {
    it('从模板新建图纸：调用 createFileNode 并记 FILE_CREATE 审计', async () => {
      const readSpy = jest
        .spyOn(require('fs/promises'), 'readFile')
        .mockResolvedValue(Buffer.from('blank-mxweb-template'));
      const createSpy = jest
        .spyOn(service as unknown as { createFileNode: jest.Mock }, 'createFileNode')
        .mockResolvedValue({ id: 'node-1', name: '新建图纸.mxweb' });
      const auditSpy = jest.fn().mockResolvedValue(undefined);
      (
        service as unknown as {
          auditLogService: { logProjectNodeAction: jest.Mock };
        }
      ).auditLogService = {
        log: jest.fn(),
        logProjectNodeAction: auditSpy,
      } as unknown as { logProjectNodeAction: jest.Mock };

      const result = await service.createDrawingFromTemplate({
        parentId: 'folder-1',
        ownerId: 'user-1',
      });

      expect(result.id).toBe('node-1');
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 'folder-1',
          ownerId: 'user-1',
          fileStatus: FileStatus.COMPLETED,
        })
      );
      // 新建图纸审计（FILE_CREATE，仅项目内节点由 logProjectNodeAction 内部判断）
      expect(auditSpy).toHaveBeenCalledWith('FILE_CREATE', 'node-1', 'user-1');

      readSpy.mockRestore();
      createSpy.mockRestore();
    });
  });

  // ==================== getNode ====================
  describe('getNode', () => {
    it('should return node when found', async () => {
      const node = { id: 'n1', name: 'test.dwg', deletedAt: null };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(node);
      expect(await service.getNode('n1')).toEqual(node);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.getNode('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ==================== getNodeTypeAndOwner ====================
  describe('getNodeTypeAndOwner', () => {
    it('should return nodeType and ownerId', async () => {
      const node = {
        id: 'n1',
        nodeType: NodeType.LIBRARY_DRAWING,
        ownerId: null,
      };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(node);
      const result = await service.getNodeTypeAndOwner('n1');
      expect(result.nodeType).toBe(NodeType.LIBRARY_DRAWING);
    });

    it('should throw when not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.getNodeTypeAndOwner('missing')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should return nodeType and ownerId for deleted nodes without deletedAt filter', async () => {
      const node = { id: 'n1', nodeType: NodeType.FILE, ownerId: 'u1' };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(node);
      const result = await service.getNodeTypeAndOwner('n1');
      expect(result.nodeType).toBe(NodeType.FILE);
      expect(mockPrisma.fileSystemNode.findUnique).toHaveBeenCalledWith({
        where: { id: 'n1' },
        select: { id: true, nodeType: true, ownerId: true },
      });
    });
  });

  // ==================== isLibraryNode ====================
  describe('isLibraryNode', () => {
    it('should return false for non-library nodes', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'n1',
        nodeType: NodeType.FILE,
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue(null);
      expect(await service.isLibraryNode('n1')).toBe(false);
    });

    it('should return true for library drawing nodes', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'root-1',
        nodeType: NodeType.LIBRARY_DRAWING,
      });
      expect(await service.isLibraryNode('root-1')).toBe(true);
    });

    it('should return true for folder inside library', async () => {
      mockTreeWalker.resolveProjectId.mockResolvedValue('root-1');
      mockPrisma.fileSystemNode.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'folder-1') {
          return Promise.resolve({
            id: 'folder-1',
            nodeType: NodeType.FOLDER,
            projectId: null,
            parentId: 'root-1',
          });
        }
        if (where.id === 'root-1') {
          return Promise.resolve({
            id: 'root-1',
            nodeType: NodeType.LIBRARY_DRAWING,
            projectId: null,
            parentId: null,
          });
        }
        return Promise.resolve(null);
      });
      expect(await service.isLibraryNode('folder-1')).toBe(true);
      expect(mockTreeWalker.resolveProjectId).toHaveBeenCalledWith('folder-1');
    });

    it('should return false for folder inside regular project', async () => {
      mockTreeWalker.resolveProjectId.mockResolvedValue('proj-1');
      mockPrisma.fileSystemNode.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'folder-1') {
          return Promise.resolve({
            id: 'folder-1',
            nodeType: NodeType.FOLDER,
            projectId: null,
            parentId: 'proj-1',
          });
        }
        if (where.id === 'proj-1') {
          return Promise.resolve({
            id: 'proj-1',
            nodeType: NodeType.PROJECT,
            projectId: null,
            parentId: null,
          });
        }
        return Promise.resolve(null);
      });
      expect(await service.isLibraryNode('folder-1')).toBe(false);
    });
  });

  // ==================== getNodeTree ====================
  describe('getNodeTree', () => {
    it('should return node tree with children', async () => {
      const node = {
        id: 'n1',
        name: 'root',
        nodeType: NodeType.PROJECT,
        projectId: 'n1',
        children: [{ id: 'c1', name: 'child' }],
      };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(node);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await service.getNodeTree('n1');
      expect(result).toBeDefined();
      expect(result.id).toBe('n1');
    });

    it('should throw when not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.getNodeTree('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ==================== getChildren ====================
  describe('getChildren', () => {
    it('should return paginated children', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'c1', name: 'file.dwg', _count: { children: 0 } },
      ]);
      mockPrisma.fileSystemNode.count.mockResolvedValue(1);

      const result = await service.getChildren('parent-1');
      expect(result.nodes).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should return empty when parent is deleted', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: new Date(),
      });
      const result = await service.getChildren('parent-1');
      expect(result.nodes).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should apply search filter', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'p1',
        deletedAt: null,
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      mockPrisma.fileSystemNode.count.mockResolvedValue(0);

      await service.getChildren('p1', undefined, { search: 'test' });
      const findManyCall = mockPrisma.fileSystemNode.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeDefined();
    });

    it('should filter by nodeType', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'p1',
        deletedAt: null,
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
      mockPrisma.fileSystemNode.count.mockResolvedValue(0);

      await service.getChildren('p1', undefined, { nodeType: 'folder' });
      expect(
        mockPrisma.fileSystemNode.findMany.mock.calls[0][0].where.nodeType
      ).toBe(NodeType.FOLDER);
    });
  });

  // ==================== updateNodePath ====================
  describe('updateNodePath', () => {
    it('should update node path', async () => {
      mockPrisma.fileSystemNode.update.mockResolvedValue({
        id: 'n1',
        path: '/new/path',
      });
      const result = await service.updateNodePath('n1', '/new/path');
      expect(result.path).toBe('/new/path');
    });
  });

  // ==================== getRootNode ====================
  describe('getRootNode', () => {
    it('should return current node if root', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'root-1',
        nodeType: NodeType.PROJECT,
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('root-1');
      const result = await service.getRootNode('root-1');
      expect(result.id).toBe('root-1');
      expect(mockTreeWalker.resolveProjectId).toHaveBeenCalledWith('root-1');
    });

    it('should return project root for nested node', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'child-1',
        nodeType: NodeType.FILE,
        projectId: null,
        parentId: 'parent-1',
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue('root-1');

      const result = await service.getRootNode('child-1');
      expect(result.id).toBe('root-1');
      expect(mockTreeWalker.resolveProjectId).toHaveBeenCalledWith('child-1');
    });

    it('should throw NotFoundException when no root found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'orphan',
        nodeType: NodeType.FILE,
        projectId: null,
        parentId: null,
      });
      mockTreeWalker.resolveProjectId.mockResolvedValue(null);
      await expect(service.getRootNode('orphan')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ==================== getNodeType ====================
  describe('getNodeType', () => {
    it('should return LIBRARY_DRAWING for drawing library node', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'lib-1',
        nodeType: NodeType.LIBRARY_DRAWING,
      });
      expect(await service.getNodeType('lib-1')).toBe(NodeType.LIBRARY_DRAWING);
    });

    it('should return null for non-library node', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'n1',
        nodeType: NodeType.FILE,
      });
      expect(await service.getNodeType('n1')).toBe(NodeType.FILE);
    });

    it('should return nodeType directly without root resolution', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'child-1',
        nodeType: NodeType.LIBRARY_BLOCK,
      });
      expect(await service.getNodeType('child-1')).toBe(NodeType.LIBRARY_BLOCK);
    });
  });

  // ==================== getTrashItems ====================
  describe('getTrashItems', () => {
    it('should return trash items for user', async () => {
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'proj-1',
          name: 'Deleted Project',
          nodeType: NodeType.PROJECT,
          ownerId: 'user-1',
        },
        {
          id: 'node-1',
          name: 'deleted.dwg',
          nodeType: NodeType.FILE,
          ownerId: 'user-1',
        },
      ]);
      mockPrisma.fileSystemNode.count.mockResolvedValue(2);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await service.getTrashItems('user-1');
      expect(result.nodes).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should use TreeWalker getSubtreeIds with includeRoot for project-scoped trash', async () => {
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue({
        id: 'proj-1',
      });
      mockTreeWalker.getSubtreeIds.mockResolvedValue(['proj-1', 'child-1']);
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        {
          id: 'child-1',
          name: 'deleted.dwg',
          nodeType: NodeType.FILE,
          parentId: 'proj-1',
        },
      ]);
      mockPrisma.fileSystemNode.count.mockResolvedValue(1);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockAncestorQueryService.buildAncestorPaths.mockResolvedValue(
        new Map([['proj-1', '项目 > 目录']])
      );

      const result = await service.getTrashItems('user-1', {
        projectId: 'proj-1',
      });
      expect(mockTreeWalker.getSubtreeIds).toHaveBeenCalledWith('proj-1', {
        includeRoot: true,
      });
      expect(result.nodes).toHaveLength(1);
    });
  });

  // ==================== getAllFilesUnderNode ====================
  describe('getAllFilesUnderNode', () => {
    it('should delegate to TreeWalker with pagination pushdown and return files', async () => {
      // First call: check parent node exists
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      mockTreeWalker.getSubtreeFilesPaginated.mockResolvedValue({
        rows: [{ id: 'file-1', path: '/x.dwg', fileHash: 'h1' }],
        total: 1,
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'file-1', name: 'test.dwg', nodeType: NodeType.FILE },
      ]);

      const result = await service.getAllFilesUnderNode('parent-1');

      expect(mockTreeWalker.getSubtreeFilesPaginated).toHaveBeenCalledWith(
        'parent-1',
        {
          includeDeleted: false,
          page: 1,
          limit: 50,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }
      );
      // 页内详情仅按当前页 id（≤ limit）取回，不再全量收集后 in 展开
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['file-1'] } }),
        })
      );
      expect(mockPrisma.fileSystemNode.count).not.toHaveBeenCalled();
      expect(result.nodes).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should pass page/limit/sort options to TreeWalker', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      mockTreeWalker.getSubtreeFilesPaginated.mockResolvedValue({
        rows: [],
        total: 0,
      });

      await service.getAllFilesUnderNode('parent-1', 'user-1', {
        page: 2,
        limit: 10,
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(mockTreeWalker.getSubtreeFilesPaginated).toHaveBeenCalledWith(
        'parent-1',
        {
          includeDeleted: false,
          page: 2,
          limit: 10,
          sortBy: 'name',
          sortOrder: 'asc',
        }
      );
    });

    it('should pass includeDeleted to TreeWalker', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      mockTreeWalker.getSubtreeFilesPaginated.mockResolvedValue({
        rows: [],
        total: 0,
      });

      await service.getAllFilesUnderNode('parent-1', 'user-1', {
        includeDeleted: true,
      });

      expect(mockTreeWalker.getSubtreeFilesPaginated).toHaveBeenCalledWith(
        'parent-1',
        expect.objectContaining({ includeDeleted: true })
      );
    });

    it('should return empty when parent deleted', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: new Date(),
      });
      const result = await service.getAllFilesUnderNode('parent-1');
      expect(result.nodes).toEqual([]);
      expect(mockTreeWalker.getSubtreeFilesPaginated).not.toHaveBeenCalled();
    });

    it('should return empty when parent missing', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      const result = await service.getAllFilesUnderNode('parent-1');
      expect(result.nodes).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should delegate filtered query to TreeWalker CTE when search provided (#272)', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      mockFtsQueryBuilder.matchIds.mockResolvedValue({
        ids: new Set(['file-1']),
        matched: true,
      });
      mockTreeWalker.getSubtreeFilesFilteredPaginated.mockResolvedValue({
        rows: [{ id: 'file-1', path: '/x.dwg', fileHash: 'h1' }],
        total: 1,
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'file-1', name: 'match.dwg', nodeType: NodeType.FILE },
      ]);

      const result = await service.getAllFilesUnderNode('parent-1', 'user-1', {
        search: 'match',
      });

      expect(mockTreeWalker.getSubtreeFilesFilteredPaginated).toHaveBeenCalledWith(
        'parent-1',
        {
          includeDeleted: false,
          page: 1,
          limit: 50,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          extensions: [],
          statuses: [],
          ftsMatchIds: ['file-1'],
          keyword: 'match',
        }
      );
      // 不再全量收集后 in 展开：页内详情仅按当前页 id（≤ limit）取回
      expect(mockTreeWalker.getSubtreeFileIds).not.toHaveBeenCalled();
      expect(mockPrisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['file-1'] },
          }),
        })
      );
      expect(mockPrisma.fileSystemNode.count).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
    });

    it('should pass extension/fileStatus filters down to TreeWalker CTE (#272)', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      mockTreeWalker.getSubtreeFilesFilteredPaginated.mockResolvedValue({
        rows: [{ id: 'file-1', path: '/x.dwg', fileHash: 'h1' }],
        total: 1,
      });
      mockPrisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'file-1', name: 'match.dwg', nodeType: NodeType.FILE },
      ]);

      await service.getAllFilesUnderNode('parent-1', 'user-1', {
        extension: 'dwg, pdf ',
        fileStatus: 'CONVERTED,FAILED',
      });

      expect(
        mockTreeWalker.getSubtreeFilesFilteredPaginated
      ).toHaveBeenCalledWith(
        'parent-1',
        expect.objectContaining({
          extensions: ['dwg', 'pdf'],
          statuses: ['CONVERTED', 'FAILED'],
        })
      );
      expect(mockFtsQueryBuilder.matchIds).not.toHaveBeenCalled();
    });

    it('should return empty result when filtered page is out of range, preserving total (#272)', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      mockTreeWalker.getSubtreeFilesFilteredPaginated.mockResolvedValue({
        rows: [],
        total: 41,
      });

      const result = await service.getAllFilesUnderNode('parent-1', 'user-1', {
        search: 'match',
        page: 5,
        limit: 20,
      });

      expect(result.nodes).toEqual([]);
      expect(result.total).toBe(41);
      expect(result.totalPages).toBe(3);
      expect(mockPrisma.fileSystemNode.findMany).not.toHaveBeenCalled();
    });

    it('should return empty result when subtree has no files', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      mockTreeWalker.getSubtreeFilesPaginated.mockResolvedValue({
        rows: [],
        total: 0,
      });

      const result = await service.getAllFilesUnderNode('parent-1');
      expect(result.nodes).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(mockPrisma.fileSystemNode.findMany).not.toHaveBeenCalled();
    });

    it('should preserve real total when page is out of range', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'parent-1',
        deletedAt: null,
      });
      // 非空子树（41 个文件）+ 越界页（limit 20 只有 3 页，请求 page 5）
      mockTreeWalker.getSubtreeFilesPaginated.mockResolvedValue({
        rows: [],
        total: 41,
      });

      const result = await service.getAllFilesUnderNode('parent-1', 'user-1', {
        page: 5,
        limit: 20,
      });

      expect(result.nodes).toEqual([]);
      expect(result.total).toBe(41);
      expect(result.totalPages).toBe(3);
      expect(mockPrisma.fileSystemNode.findMany).not.toHaveBeenCalled();
    });
  });
});
