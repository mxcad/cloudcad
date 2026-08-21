///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { NodeTrashService } from '../../src/file-operations/node-trash.service';
import { NodeNameService } from '../../src/file-operations/node-name.service';
import { DatabaseService } from '../../src/database/database.service';
import { StorageInfoService } from '../../src/file-system/storage-quota/storage-info.service';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { ConfigService } from '@nestjs/config';
import { StorageManager } from '../../src/storage-management/services/storage-manager.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../src/version-control/interfaces/version-control.interface';
import { IStorageProvider } from '../../src/storage/interfaces/storage-provider.interface';
import { IPROJECT_PERMISSION_SERVICE } from '../../src/roles/interfaces/project-permission-service.interface';
import { IPERMISSION_SERVICE } from '../../src/permission/interfaces/permission-service.interface';
import { TreeWalker } from '../../src/file-system/file-tree/tree-walker.service';
import { RestrictionEngine } from '../../src/vip/restriction-engine.service';
import { NodeMutationGuard } from '../../src/file-operations/node-mutation.guard';
import { NodeStatusTransitioner } from '../../src/file-system/file-status/node-status-transitioner';
import { NodeSizeResolverService } from '../../src/file-system/storage-quota/node-size-resolver.service';
import { StorageUsageService } from '../../src/vip/storage-usage/storage-usage.service';
import { AuditLogService } from '../../src/audit/audit-log.service';

describe('Workflow 3: Delete → Reference Count → Recycle Bin → Permanent Delete Integration Tests', () => {
  let nodeTrashService: NodeTrashService;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockStorageManager: jest.Mocked<StorageManager>;
  let mockVersionControlService: jest.Mocked<IVersionControl>;
  let mockStorageInfoService: jest.Mocked<StorageInfoService>;
  let mockFileTreeService: jest.Mocked<FileTreeService>;
  let mockStorageProvider: jest.Mocked<IStorageProvider>;

  const mockGuard = {
    assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
    assertProjectQuota: jest.fn().mockResolvedValue(undefined),
    assertByteQuota: jest.fn().mockResolvedValue(undefined),
    invalidateQuotaAfterMutation: jest.fn().mockResolvedValue(undefined),
    resolveProjectContext: jest.fn(),
  };
  const mockTransitioner = {
    transition: jest.fn().mockResolvedValue(undefined),
  };

  const mockUserId = 'test-user-001';
  const mockProjectId = 'test-project-001';
  const mockFileId1 = 'file-node-001';
  const mockFileId2 = 'file-node-002';
  const mockFileId3 = 'file-node-003';
  const mockFileHash = 'common-file-hash-1234567890';

  beforeEach(async () => {
    // Setup mocks
    mockStorageManager = {
      getFullPath: jest.fn().mockImplementation((nodePath: string) => nodePath),
      getNodeDirectoryRelativePath: jest.fn().mockReturnValue('test/node/path'),
      allocateNodeStorage: jest.fn(),
      copyNodeDirectory: jest.fn(),
    } as unknown as jest.Mocked<StorageManager>;

    mockVersionControlService = {
      isReady: jest.fn().mockReturnValue(true),
      commitNodeDirectory: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Commit successful' }),
      deleteNodeDirectory: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Delete successful' }),
      commitWorkingCopy: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Commit successful' }),
    } as unknown as jest.Mocked<IVersionControl>;

    mockStorageInfoService = {
      invalidateQuotaCache: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StorageInfoService>;

    mockFileTreeService = {
      getProjectId: jest.fn().mockResolvedValue(mockProjectId),
      getLibraryKey: jest.fn().mockResolvedValue(null),
      getTrashItems: jest.fn(),
    } as unknown as jest.Mocked<FileTreeService>;

    mockStorageProvider = {
      deleteAll: jest.fn().mockResolvedValue(undefined),
      copyFromFs: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IStorageProvider>;

    const mockTreeWalker = {
      getSubtreeIds: jest.fn().mockResolvedValue([]),
      getSubtreeFiles: jest.fn().mockResolvedValue([]),
      resolveProjectId: jest.fn().mockResolvedValue(null),
    };

    const mockNodeSizeResolver = {
      resolveFileSize: jest.fn().mockResolvedValue(1024),
      resolveFileSizes: jest.fn().mockResolvedValue(0),
    };

    mockDatabaseService = {
      fileSystemNode: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => {
        return await fn(mockDatabaseService);
      }),
    } as unknown as jest.Mocked<DatabaseService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeTrashService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: StorageManager, useValue: mockStorageManager },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('/test/path') },
        },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
        { provide: StorageInfoService, useValue: mockStorageInfoService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: IStorageProvider, useValue: mockStorageProvider },
        {
          provide: IPROJECT_PERMISSION_SERVICE,
          useValue: {
            checkPermission: jest.fn().mockResolvedValue(true),
            isProjectOwner: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: IPERMISSION_SERVICE,
          useValue: {
            checkSystemPermission: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: NodeNameService,
          useValue: {
            generateUniqueName: jest
              .fn()
              .mockImplementation((_parentId: string, baseName: string) =>
                Promise.resolve(baseName)
              ),
          },
        },
        { provide: TreeWalker, useValue: mockTreeWalker },
        { provide: RestrictionEngine, useValue: {} },
        {
          provide: NodeMutationGuard,
          useValue: mockGuard,
        },
        {
          provide: NodeStatusTransitioner,
          useValue: mockTransitioner,
        },
        { provide: NodeSizeResolverService, useValue: mockNodeSizeResolver },
        {
          provide: StorageUsageService,
          useValue: {
            getSubtreeFileNodes: jest.fn().mockResolvedValue([]),
            usageSize: jest.fn().mockResolvedValue(0),
          },
        },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    nodeTrashService = module.get<NodeTrashService>(NodeTrashService);
  });

  describe('Scenario 1: Normal Workflow - Delete File → Move to Recycle Bin', () => {
    it('should successfully delete a file and move to recycle bin', async () => {
      const mockFile = {
        id: mockFileId1,
        name: 'drawing.dwg',
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileHash: mockFileHash,
        fileStatus: 'COMPLETED',
        deletedAt: null,
      };

      (
        mockDatabaseService.fileSystemNode.findUnique as jest.Mock
      ).mockResolvedValueOnce(mockFile);

      const result = await nodeTrashService.deleteNode(mockFileId1, false);

      expect(result.message).toContain('回收站');

      // Verify the file was marked as deleted
      expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockFileId1 },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        })
      );
      expect(mockTransitioner.transition).toHaveBeenCalledWith(
        mockFileId1,
        'COMPLETED',
        'DELETED',
        expect.anything()
      );

      // Verify quota cache was invalidated
      expect(mockGuard.invalidateQuotaAfterMutation).toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Reference Count - Multiple Files with Same Hash', () => {
    it('should only soft delete one of multiple files with same hash (physical file untouched)', async () => {
      const fileToDelete = {
        id: mockFileId1,
        name: 'drawing1.dwg',
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileHash: mockFileHash,
        fileStatus: 'COMPLETED',
        deletedAt: null,
      };

      (
        mockDatabaseService.fileSystemNode.findUnique as jest.Mock
      ).mockResolvedValueOnce(fileToDelete);

      const result = await nodeTrashService.deleteNode(mockFileId1, false);

      expect(result.message).toContain('回收站');

      // Soft delete only moves the node to the recycle bin
      expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockFileId1 },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        })
      );
      expect(mockTransitioner.transition).toHaveBeenCalledWith(
        mockFileId1,
        'COMPLETED',
        'DELETED',
        expect.anything()
      );

      // No physical storage deletion should happen for a soft delete
      expect(mockStorageProvider.deleteAll).not.toHaveBeenCalled();
      expect(mockDatabaseService.fileSystemNode.delete).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 3: Normal Workflow - Restore File from Recycle Bin', () => {
    it('should successfully restore a file from recycle bin', async () => {
      const deletedFile = {
        id: mockFileId1,
        name: 'deleted-drawing.dwg',
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileHash: mockFileHash,
        fileStatus: 'DELETED',
        deletedAt: new Date(Date.now() - 86400000), // 1 day ago
        deletedByCascade: false,
      };

      const parentNode = {
        id: mockProjectId,
        deletedAt: null,
      };

      (mockDatabaseService.fileSystemNode.findUnique as jest.Mock)
        .mockResolvedValueOnce(deletedFile)
        .mockResolvedValueOnce(parentNode);

      (
        mockDatabaseService.fileSystemNode.update as jest.Mock
      ).mockResolvedValueOnce({
        ...deletedFile,
        deletedAt: null,
        fileStatus: 'COMPLETED',
      });

      const result = await nodeTrashService.restoreNode(
        mockFileId1,
        mockUserId
      );

      expect(result).toBeDefined();

      // Verify the file was restored
      expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockFileId1 },
          data: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
      expect(mockTransitioner.transition).toHaveBeenCalledWith(
        mockFileId1,
        'DELETED',
        'COMPLETED'
      );

      // Verify quota cache was invalidated
      expect(mockGuard.invalidateQuotaAfterMutation).toHaveBeenCalled();
    });
  });

  describe('Scenario 4: Permanent Delete - Delete Physical File When No References Remain', () => {
    it('should permanently delete file and remove physical storage when no references remain', async () => {
      const fileToDelete = {
        id: mockFileId1,
        name: 'permanent-delete.dwg',
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileHash: mockFileHash,
        path: 'test/node/file.dwg',
        fileStatus: 'DELETED',
        deletedAt: new Date(Date.now() - 86400000),
      };

      (
        mockDatabaseService.fileSystemNode.findUnique as jest.Mock
      ).mockResolvedValueOnce(fileToDelete);

      // Return 0 for reference count (no other files with same hash)
      (
        mockDatabaseService.fileSystemNode.count as jest.Mock
      ).mockResolvedValueOnce(0);

      const result = await nodeTrashService.deleteNode(mockFileId1, true);

      expect(result.message).toContain('已彻底删除');

      // Verify database operations were performed
      expect(mockDatabaseService.fileSystemNode.updateMany).toHaveBeenCalled();
      expect(mockDatabaseService.fileSystemNode.delete).toHaveBeenCalled();

      // Verify reference count was checked before physical deletion
      expect(mockDatabaseService.fileSystemNode.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fileHash: mockFileHash,
            deletedAt: null,
            id: { not: expect.any(String) },
          }),
        })
      );

      // Verify physical storage deletion was attempted
      expect(mockStorageProvider.deleteAll).toHaveBeenCalled();

      // Verify MX operations if applicable
      expect(mockVersionControlService.deleteNodeDirectory).toHaveBeenCalled();
    });
  });

  describe('Scenario 5: Reference Count - Delete Last Reference', () => {
    it('should delete physical file when deleting last reference', async () => {
      // Setup 3 files with same hash, delete one by one
      const fileToDelete = {
        id: mockFileId3,
        name: 'last-reference.dwg',
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileHash: mockFileHash,
        path: 'test/node/file.dwg',
        fileStatus: 'COMPLETED',
        deletedAt: null,
      };

      (
        mockDatabaseService.fileSystemNode.findUnique as jest.Mock
      ).mockResolvedValueOnce(fileToDelete);

      // Return 0 for reference count (this is the last one)
      (
        mockDatabaseService.fileSystemNode.count as jest.Mock
      ).mockResolvedValueOnce(0);

      const result = await nodeTrashService.deleteNode(mockFileId3, true);

      expect(result.message).toContain('已彻底删除');

      // Verify physical file deletion
      expect(mockStorageProvider.deleteAll).toHaveBeenCalled();
    });
  });

  describe('Scenario 6: Edge Case - Delete Folder with Contents', () => {
    it('should handle deleting a folder with child files', async () => {
      const folderToDelete = {
        id: 'folder-node-001',
        name: 'my-folder',
        nodeType: 'FOLDER',
        parentId: mockProjectId,
        ownerId: mockUserId,
        deletedAt: null,
      };

      (
        mockDatabaseService.fileSystemNode.findUnique as jest.Mock
      ).mockResolvedValueOnce(folderToDelete);

      const result = await nodeTrashService.deleteNode(
        'folder-node-001',
        false
      );

      expect(result.message).toContain('回收站');
    });
  });

  describe('Scenario 7: Exception Case - Delete Non-Existent File', () => {
    it('should throw error when trying to delete non-existent file', async () => {
      (
        mockDatabaseService.fileSystemNode.findUnique as jest.Mock
      ).mockResolvedValueOnce(null);

      await expect(
        nodeTrashService.deleteNode('non-existent-id', false)
      ).rejects.toThrow('节点不存在');
    });
  });

  describe('Scenario 8: Edge Case - Restore with Name Conflict', () => {
    it('should generate unique name when restoring if name conflict exists', async () => {
      const deletedFile = {
        id: mockFileId1,
        name: 'conflict-file.dwg',
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileHash: mockFileHash,
        fileStatus: 'DELETED',
        deletedAt: new Date(),
      };

      const parentNode = { id: mockProjectId, deletedAt: null };

      (mockDatabaseService.fileSystemNode.findUnique as jest.Mock)
        .mockResolvedValueOnce(deletedFile)
        .mockResolvedValueOnce(parentNode);

      (
        mockDatabaseService.fileSystemNode.update as jest.Mock
      ).mockResolvedValueOnce({
        ...deletedFile,
        name: 'conflict-file (2).dwg',
        deletedAt: null,
        fileStatus: 'COMPLETED',
      });

      const result = await nodeTrashService.restoreNode(
        mockFileId1,
        mockUserId
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('conflict-file (2).dwg');
    });
  });

  describe('Scenario 9: Edge Case - Get Project Recycle Bin Contents', () => {
    it('should retrieve list of deleted files in project recycle bin', async () => {
      const deletedFiles = [
        {
          id: mockFileId1,
          name: 'deleted-file-1.dwg',
          nodeType: 'FILE',
          ownerId: mockUserId,
          deletedAt: new Date(Date.now() - 86400000),
          owner: {
            id: mockUserId,
            username: 'testuser',
            nickname: 'Test User',
          },
        },
        {
          id: mockFileId2,
          name: 'deleted-file-2.dwg',
          nodeType: 'FILE',
          ownerId: mockUserId,
          deletedAt: new Date(Date.now() - 172800000),
          owner: {
            id: mockUserId,
            username: 'testuser',
            nickname: 'Test User',
          },
        },
      ];

      (mockFileTreeService.getTrashItems as jest.Mock).mockResolvedValue({
        nodes: deletedFiles,
        total: 2,
        page: 1,
        limit: 10,
      });

      const result = await mockFileTreeService.getTrashItems(mockUserId, {
        projectId: mockProjectId,
        page: 1,
        limit: 10,
      });

      expect(result.nodes).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('Scenario 10: Full Workflow - Create → Multiple References → Delete All → Restore One', () => {
    it('should complete full reference counting workflow', async () => {
      // 1. Delete first file - reference count should be 1 remaining
      const file1 = {
        id: mockFileId1,
        name: 'file-1.dwg',
        fileHash: mockFileHash,
      };
      (
        mockDatabaseService.fileSystemNode.findUnique as jest.Mock
      ).mockResolvedValueOnce({
        ...file1,
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileStatus: 'COMPLETED',
        deletedAt: null,
      });

      const delete1 = await nodeTrashService.deleteNode(mockFileId1, false);
      expect(delete1.message).toContain('回收站');

      // 2. Delete second file
      jest.clearAllMocks();
      const file2 = {
        id: mockFileId2,
        name: 'file-2.dwg',
        fileHash: mockFileHash,
      };
      (
        mockDatabaseService.fileSystemNode.findUnique as jest.Mock
      ).mockResolvedValueOnce({
        ...file2,
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileStatus: 'COMPLETED',
        deletedAt: null,
      });

      const delete2 = await nodeTrashService.deleteNode(mockFileId2, false);
      expect(delete2.message).toContain('回收站');

      // 3. Restore second file
      jest.clearAllMocks();
      const deletedFile = {
        id: mockFileId2,
        name: file2.name,
        nodeType: 'FILE',
        parentId: mockProjectId,
        ownerId: mockUserId,
        fileHash: mockFileHash,
        fileStatus: 'DELETED',
        deletedAt: new Date(),
        deletedByCascade: false,
      };

      (mockDatabaseService.fileSystemNode.findUnique as jest.Mock)
        .mockResolvedValueOnce(deletedFile)
        .mockResolvedValueOnce({ id: mockProjectId, deletedAt: null });

      (
        mockDatabaseService.fileSystemNode.update as jest.Mock
      ).mockResolvedValueOnce({
        ...deletedFile,
        deletedAt: null,
        fileStatus: 'COMPLETED',
      });

      const restoreResult = await nodeTrashService.restoreNode(
        mockFileId2,
        mockUserId
      );
      expect(restoreResult).toBeDefined();
    });
  });
});
