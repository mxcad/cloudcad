/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
/////////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileOperationsService } from './file-operations.service';
import { DatabaseService } from '../../database/database.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { VersionControlService } from '../../version-control/version-control.service';
import { StorageInfoService } from '../file-system/storage-quota/storage-info.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';

describe('FileOperationsService', () => {
  let service: FileOperationsService;
  let prisma: jest.Mocked<DatabaseService>;
  let storageManager: jest.Mocked<StorageManager>;
  let configService: jest.Mocked<ConfigService>;
  let versionControlService: jest.Mocked<VersionControlService>;
  let storageInfoService: jest.Mocked<StorageInfoService>;
  let fileTreeService: jest.Mocked<FileTreeService>;

  beforeEach(async () => {
    const mockPrisma = {
      fileSystemNode: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockStorageManager = {
      getFullPath: jest.fn(),
      getNodeDirectoryRelativePath: jest.fn(),
      copyNodeDirectory: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('/path/to/files'),
    };

    const mockVersionControlService = {
      isReady: jest.fn().mockReturnValue(false),
      deleteNodeDirectory: jest.fn(),
      commitWorkingCopy: jest.fn(),
    };

    const mockStorageInfoService = {
      invalidateQuotaCache: jest.fn(),
    };

    const mockFileTreeService = {
      getProjectId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileOperationsService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: StorageManager,
          useValue: mockStorageManager,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: VersionControlService,
          useValue: mockVersionControlService,
        },
        {
          provide: StorageInfoService,
          useValue: mockStorageInfoService,
        },
        {
          provide: FileTreeService,
          useValue: mockFileTreeService,
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

    service = module.get<FileOperationsService>(FileOperationsService);
    prisma = module.get(DatabaseService);
    storageManager = module.get(StorageManager);
    configService = module.get(ConfigService);
    versionControlService = module.get(VersionControlService);
    storageInfoService = module.get(StorageInfoService);
    fileTreeService = module.get(FileTreeService);
  });

  describe('checkNameUniqueness', () => {
    it('should pass when project name is unique at root level', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      await expect(
        service.checkNameUniqueness('UniqueProject', 'user-1', null)
      ).resolves.toBeUndefined();
      expect(prisma.fileSystemNode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'user-1', isRoot: true }),
        })
      );
    });

    it('should throw when duplicate project name exists at root level', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'existing-project' });
      await expect(
        service.checkNameUniqueness('ExistingProject', 'user-1', null)
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass when file name is unique in folder', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      await expect(
        service.checkNameUniqueness('unique.dwg', 'user-1', 'parent-1')
      ).resolves.toBeUndefined();
      expect(prisma.fileSystemNode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parentId: 'parent-1' }),
        })
      );
    });

    it('should throw when duplicate file name exists in folder', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'dup', isFolder: false });
      await expect(
        service.checkNameUniqueness('duplicate.dwg', 'user-1', 'parent-1')
      ).rejects.toThrow(/同名文件/);
    });

    it('should throw when duplicate folder name exists in folder', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'dup', isFolder: true });
      await expect(
        service.checkNameUniqueness('duplicate', 'user-1', 'parent-1')
      ).rejects.toThrow(/同名文件夹/);
    });

    it('should exclude specified node ID when checking uniqueness', async () => {
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      await service.checkNameUniqueness('same', 'user-1', 'parent-1', 'exclude-me');
      expect(prisma.fileSystemNode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 'exclude-me' } }),
        })
      );
    });
  });

  describe('generateUniqueName', () => {
    it('should return original name when no conflict exists', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([{ name: 'other.dwg' }]);
      const result = await service.generateUniqueName('parent-1', 'myfile.dwg', false);
      expect(result).toBe('myfile.dwg');
    });

    it('should generate numbered name for file with extension', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([{ name: 'drawing.dwg' }]);
      const result = await service.generateUniqueName('parent-1', 'drawing.dwg', false);
      expect(result).toBe('drawing (1).dwg');
    });

    it('should generate numbered name for file without extension', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([{ name: 'README' }]);
      const result = await service.generateUniqueName('parent-1', 'README', false);
      expect(result).toBe('README (1)');
    });

    it('should generate numbered name for folder', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([{ name: 'New Folder' }]);
      const result = await service.generateUniqueName('parent-1', 'New Folder', true);
      expect(result).toBe('New Folder (1)');
    });

    it('should find and increment existing highest number suffix', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        { name: 'file (1).dwg' },
        { name: 'file (2).dwg' },
        { name: 'file.dwg' },
      ]);
      const result = await service.generateUniqueName('parent-1', 'file.dwg', false);
      expect(result).toBe('file (3).dwg');
    });

    it('should skip names that are already taken', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        { name: 'report (1).pdf' },
        { name: 'report (2).pdf' },
        { name: 'report.pdf' },
      ]);
      const result = await service.generateUniqueName('parent-1', 'report (1).pdf', false);
      // report (1).pdf conflicts with existing, so should generate next available
      expect(result).toMatch(/^report \(\d+\)\.pdf$/);
    });
  });

  describe('deleteNode', () => {
    const softDeletedNode = {
      isRoot: false, isFolder: false, path: '/files/test.dwg',
      fileHash: 'abc123', deletedAt: null, ownerId: 'user-1', projectId: 'proj-1', size: 1024,
    };

    it('should soft delete a file node', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(softDeletedNode);
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'node-1', ...softDeletedNode, deletedAt: new Date(), fileStatus: 'DELETED' });
      const result = await service.deleteNode('node-1', false);
      expect(result.message).toContain('回收站');
      expect(prisma.fileSystemNode.update).toHaveBeenCalled();
    });

    it('should soft delete a project node', async () => {
      const projectNode = { ...softDeletedNode, isRoot: true };
      prisma.fileSystemNode.findUnique.mockResolvedValue(projectNode);
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'proj-1', ...projectNode, deletedAt: new Date(), projectStatus: 'DELETED' });
      const result = await service.deleteNode('proj-1', false);
      expect(result.message).toContain('回收站');
    });

    it('should permanently delete a file node', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(softDeletedNode);
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          fileSystemNode: { update: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        };
        return fn(tx);
      });
      const result = await service.deleteNode('node-1', true);
      expect(result.message).toContain('彻底删除');
    });

    it('should throw when node does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.deleteNode('nonexistent', false)).rejects.toThrow(NotFoundException);
    });

    it('should invalidate quota cache after soft delete', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(softDeletedNode);
      prisma.fileSystemNode.update.mockResolvedValue({});
      await service.deleteNode('node-1', false);
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith('user-1', 'proj-1');
    });

    it('should invalidate quota cache after permanent delete', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(softDeletedNode);
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          fileSystemNode: { update: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        };
        return fn(tx);
      });
      await service.deleteNode('node-1', true);
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith('user-1', 'proj-1');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'proj-1', isRoot: true, personalSpaceKey: null });
      prisma.fileSystemNode.update.mockResolvedValue({});
      const result = await service.deleteProject('proj-1', false);
      expect(result.message).toContain('回收站');
    });

    it('should throw when project does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.deleteProject('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw when attempting to delete personal space', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'ps-1', isRoot: true, personalSpaceKey: 'user-1' });
      await expect(service.deleteProject('ps-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('restoreNode', () => {
    const deletedNode = {
      isRoot: false, isFolder: false, deletedAt: new Date(), deletedByCascade: false,
      parentId: 'parent-1', ownerId: 'user-1', projectId: 'proj-1', name: 'file.dwg',
    };

    it('should restore a soft deleted file', async () => {
      prisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(deletedNode)
        .mockResolvedValueOnce({ deletedAt: null }); // parent exists
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'node-1', ...deletedNode, deletedAt: null, fileStatus: 'COMPLETED' });
      const result = await service.restoreNode('node-1');
      expect(result).toHaveProperty('message');
    });

    it('should restore a soft deleted project', async () => {
      const deletedProject = { ...deletedNode, isRoot: true, parentId: null };
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(deletedProject);
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'proj-1', ...deletedProject, deletedAt: null, projectStatus: 'ACTIVE' });
      const result = await service.restoreNode('proj-1');
      expect(result).toHaveProperty('message');
    });

    it('should throw when node does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.restoreNode('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw when node is not deleted', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ ...deletedNode, deletedAt: null });
      await expect(service.restoreNode('node-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw when parent node is deleted', async () => {
      prisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(deletedNode)
        .mockResolvedValueOnce({ deletedAt: new Date() });
      await expect(service.restoreNode('node-1')).rejects.toThrow(/父节点已被删除/);
    });

    it('should throw when parent node does not exist', async () => {
      prisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(deletedNode)
        .mockResolvedValueOnce(null);
      await expect(service.restoreNode('node-1')).rejects.toThrow(NotFoundException);
    });

    it('should invalidate quota cache after restore', async () => {
      prisma.fileSystemNode.findUnique
        .mockResolvedValueOnce(deletedNode)
        .mockResolvedValueOnce({ deletedAt: null });
      prisma.fileSystemNode.update.mockResolvedValue({});
      await service.restoreNode('node-1');
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith('user-1', 'proj-1');
    });
  });

  describe('restoreProject', () => {
    it('should restore a deleted project', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'proj-1', isRoot: true, deletedAt: new Date(), projectStatus: 'DELETED' });
      prisma.fileSystemNode.update.mockResolvedValue({ id: 'proj-1', deletedAt: null, projectStatus: 'ACTIVE' });
      const result = await service.restoreProject('proj-1');
      expect(result.message).toContain('恢复');
    });

    it('should throw when project not in trash', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'proj-1', isRoot: true, deletedAt: null });
      await expect(service.restoreProject('proj-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getProjectTrash', () => {
    it('should return deleted nodes with pagination', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.fileSystemNode.findMany.mockResolvedValue([{ id: 'deleted-1', name: 'old.dwg' }]);
      prisma.fileSystemNode.count.mockResolvedValue(1);
      const result = await service.getProjectTrash('proj-1', { page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });

    it('should filter by search term', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.fileSystemNode.count.mockResolvedValue(0);
      await service.getProjectTrash('proj-1', { search: 'drawing', page: 1, limit: 20 });
      expect(prisma.fileSystemNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ name: expect.objectContaining({ contains: 'drawing' }) }) })
      );
    });

    it('should throw when project does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.getProjectTrash('nonexistent', { page: 1, limit: 20 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('clearProjectTrash', () => {
    it('should clear all deleted nodes in project', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.fileSystemNode.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
      prisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = { fileSystemNode: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) } };
        return fn(tx);
      });
      const result = await service.clearProjectTrash('proj-1', 'user-1');
      expect(result.message).toContain('清除');
    });

    it('should invalidate quota cache after clearing', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = { fileSystemNode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
        return fn(tx);
      });
      await service.clearProjectTrash('proj-1', 'user-1');
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalled();
    });
  });

  describe('getAllProjectNodeIds', () => {
    it('should return all node IDs in project tree', async () => {
      prisma.fileSystemNode.findMany
        .mockResolvedValueOnce([{ id: 'child-1' }, { id: 'child-2' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const result = await service.getAllProjectNodeIds('proj-1');
      expect(result).toContain('proj-1');
      expect(result).toContain('child-1');
      expect(result).toContain('child-2');
    });

    it('should return empty array for project with no children', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      const result = await service.getAllProjectNodeIds('proj-1');
      expect(result).toEqual(['proj-1']);
    });

    it('should traverse deeply nested tree', async () => {
      prisma.fileSystemNode.findMany
        .mockResolvedValueOnce([{ id: 'l1' }])
        .mockResolvedValueOnce([{ id: 'l2' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const result = await service.getAllProjectNodeIds('proj-1');
      expect(result).toContain('proj-1');
      expect(result).toContain('l1');
      expect(result).toContain('l2');
    });
  });

  describe('moveNode', () => {
    const srcNode = { isRoot: false, isFolder: false, name: 'file.dwg', projectId: 'proj-1', ownerId: 'user-1', parentId: 'old' };
    const tgt = { id: 'new', isFolder: true, isRoot: false, projectId: 'proj-1', ownerId: 'user-1' };

    it('should move file to another folder', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce(tgt);
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      prisma.fileSystemNode.update.mockResolvedValue({ ...srcNode, parentId: 'new' });
      const r = await service.moveNode('node-1', 'new');
      expect(r).toBeDefined();
    });

    it('should throw when node does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);
      await expect(service.moveNode('nonexistent', 'tgt')).rejects.toThrow(NotFoundException);
    });

    it('should throw when attempting to move root node', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce({ ...srcNode, isRoot: true });
      await expect(service.moveNode('root', 'tgt')).rejects.toThrow(BadRequestException);
    });

    it('should throw when target parent does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce(null);
      await expect(service.moveNode('node-1', 'bad')).rejects.toThrow(NotFoundException);
    });

    it('should throw when target parent is not a folder', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce({ ...tgt, isFolder: false });
      await expect(service.moveNode('node-1', 'file')).rejects.toThrow(BadRequestException);
    });

    it('should throw when moving node to itself', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce(srcNode);
      await expect(service.moveNode('node-1', 'node-1')).rejects.toThrow(BadRequestException);
    });

    it('should invalidate quota cache for source and target projects', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce(tgt);
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      prisma.fileSystemNode.update.mockResolvedValue({});
      await service.moveNode('node-1', 'new');
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalled();
    });
  });

  describe('copyNode', () => {
    const srcNode = { isRoot: false, isFolder: false, name: 'file.dwg', projectId: 'proj-1', ownerId: 'user-1', parentId: 'old' };
    const tgt = { id: 'new', isFolder: true, isRoot: false, projectId: 'proj-1', ownerId: 'user-1' };

    it('should copy file to another folder', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce(tgt);
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      prisma.fileSystemNode.create.mockResolvedValue({ id: 'copied', ...srcNode });
      const r = await service.copyNode('node-1', 'new');
      expect(r).toBeDefined();
    });

    it('should throw when node does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);
      await expect(service.copyNode('nonexistent', 'tgt')).rejects.toThrow(NotFoundException);
    });

    it('should throw when attempting to copy root node', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce({ ...srcNode, isRoot: true });
      await expect(service.copyNode('root', 'tgt')).rejects.toThrow(BadRequestException);
    });

    it('should throw when target parent does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce(null);
      await expect(service.copyNode('node-1', 'bad')).rejects.toThrow(NotFoundException);
    });

    it('should throw when target parent is not a folder', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce({ ...tgt, isFolder: false });
      await expect(service.copyNode('node-1', 'file')).rejects.toThrow(BadRequestException);
    });

    it('should throw when copying node to itself', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce(srcNode);
      await expect(service.copyNode('node-1', 'node-1')).rejects.toThrow(BadRequestException);
    });

    it('should invalidate quota cache after copy', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(srcNode).mockResolvedValueOnce(tgt);
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      prisma.fileSystemNode.create.mockResolvedValue({ id: 'copied' });
      await service.copyNode('node-1', 'new');
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalled();
    });
  });

  describe('copyNodeRecursive', () => {
    it('should copy a file node', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'src', isFolder: false, name: 'f.dwg', ownerId: 'u1', parentId: 'p1' });
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      prisma.fileSystemNode.create.mockResolvedValue({ id: 'cpy' });
      const r = await service.copyNodeRecursive('src', 'tgt');
      expect(r).toBeDefined();
    });

    it('should throw when source node does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(service.copyNodeRecursive('bad', 'tgt')).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDeleteDescendants', () => {
    it('should soft delete all child nodes', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      prisma.fileSystemNode.updateMany.mockResolvedValue({ count: 2 });
      prisma.fileSystemNode.findMany.mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]).mockResolvedValue([]);
      await service.softDeleteDescendants('parent', false);
      expect(prisma.fileSystemNode.updateMany).toHaveBeenCalled();
    });

    it('should do nothing when no children exist', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      await service.softDeleteDescendants('empty-parent', false);
      expect(prisma.fileSystemNode.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteDescendantsWithFiles', () => {
    it('should delete all child nodes and their files', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([{ id: 'c1', path: '/f/a.dwg', fileHash: 'h1' }, { id: 'c2', isFolder: true }]);
      prisma.fileSystemNode.findMany.mockResolvedValueOnce([{ id: 'c1', path: '/f/a.dwg', fileHash: 'h1' }, { id: 'c2', isFolder: true }]).mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn: Function) => fn({ fileSystemNode: { deleteMany: jest.fn() } }));
      await service.deleteDescendantsWithFiles('parent');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should do nothing when no children exist', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      await service.deleteDescendantsWithFiles('empty');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('restoreTrashItems', () => {
    it('should restore multiple deleted items', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'p1', isRoot: true, deletedAt: new Date() },
        { id: 'n1', isRoot: false, parentId: 'p1', deletedAt: new Date() },
      ]);
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'p1', deletedAt: new Date() });
      prisma.fileSystemNode.update.mockResolvedValue({});
      const r = await service.restoreTrashItems(['p1', 'n1']);
      expect(r.message).toContain('恢复');
    });

    it('should return message when itemIds is empty', async () => {
      const r = await service.restoreTrashItems([]);
      expect(r.message).toContain('没有');
    });

    it('should throw when no deleted items found', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      await expect(service.restoreTrashItems(['bad'])).rejects.toThrow(NotFoundException);
    });
  });

  describe('permanentlyDeleteTrashItems', () => {
    it('should permanently delete multiple items', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([
        { id: 'p1', isRoot: true, deletedAt: new Date() },
        { id: 'n1', isRoot: false, deletedAt: new Date(), parentId: 'p1' },
      ]);
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'p1', deletedAt: new Date(), isRoot: true });
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn: Function) => fn({ fileSystemNode: { update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() } }));
      const r = await service.permanentlyDeleteTrashItems(['p1', 'n1']);
      expect(r.message).toContain('删除');
    });

    it('should return message when itemIds is empty', async () => {
      const r = await service.permanentlyDeleteTrashItems([]);
      expect(r.message).toContain('没有');
    });

    it('should throw when no deleted items found', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      await expect(service.permanentlyDeleteTrashItems(['bad'])).rejects.toThrow(NotFoundException);
    });
  });

  describe('clearTrash', () => {
    it('should clear all deleted projects and nodes for user', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([{ id: 'p1', isRoot: true }, { id: 'n1', isRoot: false }]);
      prisma.fileSystemNode.findUnique.mockResolvedValue({ id: 'p1', isRoot: true });
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn: Function) => fn({ fileSystemNode: { update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() } }));
      const r = await service.clearTrash('user-1');
      expect(r.message).toContain('清除');
    });

    it('should invalidate quota cache after clearing', async () => {
      prisma.fileSystemNode.findMany.mockResolvedValue([]);
      await service.clearTrash('user-1');
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalled();
    });
  });

  describe('updateNode', () => {
    const node = { id: 'n1', name: 'old.dwg', isFolder: false, parentId: 'p1', ownerId: 'u1' };

    it('should update node name', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(node).mockResolvedValueOnce({ ...node, name: 'new.dwg' });
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      prisma.fileSystemNode.update.mockResolvedValue({ ...node, name: 'new.dwg' });
      const r = await service.updateNode('n1', { name: 'new.dwg' });
      expect(r.name).toBe('new.dwg');
    });

    it('should update node description', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(node).mockResolvedValueOnce({ ...node, description: 'desc' });
      prisma.fileSystemNode.update.mockResolvedValue({ ...node, description: 'desc' });
      const r = await service.updateNode('n1', { description: 'desc' });
      expect(r.description).toBe('desc');
    });

    it('should check name uniqueness when name changes', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(node);
      prisma.fileSystemNode.findFirst.mockRejectedValue(new BadRequestException('同名文件'));
      await expect(service.updateNode('n1', { name: 'dupe.dwg' })).rejects.toThrow(BadRequestException);
    });

    it('should throw when file extension is changed', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(node);
      await expect(service.updateNode('n1', { name: 'new.pdf' })).rejects.toThrow(BadRequestException);
    });

    it('should preserve extension when new name has no extension', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(node).mockResolvedValueOnce({ ...node, name: 'newname.dwg' });
      prisma.fileSystemNode.findFirst.mockResolvedValue(null);
      prisma.fileSystemNode.update.mockResolvedValue({ ...node, name: 'newname.dwg' });
      const r = await service.updateNode('n1', { name: 'newname' });
      expect(r.name).toBe('newname.dwg');
    });

    it('should throw when node does not exist', async () => {
      prisma.fileSystemNode.findUnique.mockResolvedValueOnce(null);
      await expect(service.updateNode('bad', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });
});
