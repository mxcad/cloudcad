///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { FileOperationsService } from '../../src/file-operations/file-operations.service';
import { DatabaseService } from '../../src/database/database.service';
import { StorageInfoService } from '../../src/file-system/storage-quota/storage-info.service';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { ConfigService } from '@nestjs/config';
import { StorageManager } from '../../src/common/services/storage-manager.service';
import { VERSION_CONTROL_TOKEN, } from '../../src/version-control/interfaces/version-control.interface';
import { IStorageProvider } from '../../src/storage/interfaces/storage-provider.interface';
import { ProjectPermissionService } from '../../src/roles/project-permission.service';
import { PermissionService } from '../../src/common/services/permission.service';
describe('Workflow 3: Delete → Reference Count → Recycle Bin → Permanent Delete Integration Tests', () => {
    let fileOperationsService;
    let mockDatabaseService;
    let mockStorageManager;
    let mockVersionControlService;
    let mockStorageInfoService;
    let mockFileTreeService;
    let mockStorageProvider;
    const mockUserId = 'test-user-001';
    const mockProjectId = 'test-project-001';
    const mockFileId1 = 'file-node-001';
    const mockFileId2 = 'file-node-002';
    const mockFileId3 = 'file-node-003';
    const mockFileHash = 'common-file-hash-1234567890';
    beforeEach(async () => {
        // Setup mocks
        mockStorageManager = {
            getFullPath: jest.fn().mockReturnValue('/test/path/file.dwg'),
            getNodeDirectoryRelativePath: jest.fn().mockReturnValue('test/node/path'),
            allocateNodeStorage: jest.fn(),
            copyNodeDirectory: jest.fn(),
        };
        mockVersionControlService = {
            isReady: jest.fn().mockReturnValue(true),
            commitNodeDirectory: jest.fn().mockResolvedValue({ success: true, message: 'Commit successful' }),
            deleteNodeDirectory: jest.fn().mockResolvedValue({ success: true, message: 'Delete successful' }),
            commitWorkingCopy: jest.fn().mockResolvedValue({ success: true, message: 'Commit successful' }),
        };
        mockStorageInfoService = {
            invalidateQuotaCache: jest.fn().mockResolvedValue(undefined),
        };
        mockFileTreeService = {
            getProjectId: jest.fn().mockResolvedValue(mockProjectId),
            getLibraryKey: jest.fn().mockResolvedValue(null),
        };
        mockStorageProvider = {
            deleteAll: jest.fn().mockResolvedValue(undefined),
            copyFromFs: jest.fn().mockResolvedValue(undefined),
        };
        mockDatabaseService = {
            fileSystemNode: {
                findUnique: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
                deleteMany: jest.fn(),
                count: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation(async (fn) => {
                return await fn(mockDatabaseService);
            }),
        };
        const module = await Test.createTestingModule({
            providers: [
                FileOperationsService,
                { provide: DatabaseService, useValue: mockDatabaseService },
                { provide: StorageManager, useValue: mockStorageManager },
                { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('/test/path') } },
                { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
                { provide: StorageInfoService, useValue: mockStorageInfoService },
                { provide: FileTreeService, useValue: mockFileTreeService },
                { provide: IStorageProvider, useValue: mockStorageProvider },
                { provide: ProjectPermissionService, useValue: {} },
                { provide: PermissionService, useValue: {} },
            ],
        }).compile();
        fileOperationsService = module.get(FileOperationsService);
    });
    describe('Scenario 1: Normal Workflow - Delete File → Move to Recycle Bin', () => {
        it('should successfully delete a file and move to recycle bin', async () => {
            const mockFile = {
                id: mockFileId1,
                name: 'drawing.dwg',
                isFolder: false,
                isRoot: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                fileHash: mockFileHash,
                fileStatus: 'COMPLETED',
                deletedAt: null,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(mockFile);
            const result = await fileOperationsService.deleteNode(mockFileId1, false);
            expect(result.message).toContain('回收站');
            // Verify the file was marked as deleted
            expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: mockFileId1 },
                data: expect.objectContaining({
                    deletedAt: expect.any(Date),
                    fileStatus: 'DELETED',
                }),
            }));
            // Verify quota cache was invalidated
            expect(mockStorageInfoService.invalidateQuotaCache).toHaveBeenCalled();
        });
    });
    describe('Scenario 2: Reference Count - Multiple Files with Same Hash', () => {
        it('should check reference count and not delete physical file if other references exist', async () => {
            const fileToDelete = {
                id: mockFileId1,
                name: 'drawing1.dwg',
                isFolder: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                fileHash: mockFileHash,
                fileStatus: 'COMPLETED',
                deletedAt: null,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(fileToDelete);
            // Return 1 for reference count (other files with same hash exist)
            mockDatabaseService.fileSystemNode.count.mockResolvedValueOnce(1);
            const result = await fileOperationsService.deleteNode(mockFileId1, false);
            expect(result.message).toContain('回收站');
            // Verify the file was soft deleted
            expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: mockFileId1 },
                data: expect.objectContaining({
                    deletedAt: expect.any(Date),
                    fileStatus: 'DELETED',
                }),
            }));
            // Verify reference count was checked
            expect(mockDatabaseService.fileSystemNode.count).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    fileHash: mockFileHash,
                    deletedAt: null,
                    id: { not: mockFileId1 },
                }),
            }));
        });
    });
    describe('Scenario 3: Normal Workflow - Restore File from Recycle Bin', () => {
        it('should successfully restore a file from recycle bin', async () => {
            const deletedFile = {
                id: mockFileId1,
                name: 'deleted-drawing.dwg',
                isFolder: false,
                isRoot: false,
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
            mockDatabaseService.fileSystemNode.findUnique
                .mockResolvedValueOnce(deletedFile)
                .mockResolvedValueOnce(parentNode);
            mockDatabaseService.fileSystemNode.update.mockResolvedValueOnce({
                ...deletedFile,
                deletedAt: null,
                fileStatus: 'COMPLETED',
            });
            const result = await fileOperationsService.restoreNode(mockFileId1, mockUserId);
            expect(result).toBeDefined();
            // Verify the file was restored
            expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: mockFileId1 },
                data: expect.objectContaining({
                    deletedAt: null,
                    fileStatus: 'COMPLETED',
                }),
            }));
            // Verify quota cache was invalidated
            expect(mockStorageInfoService.invalidateQuotaCache).toHaveBeenCalled();
        });
    });
    describe('Scenario 4: Permanent Delete - Delete Physical File When No References Remain', () => {
        it('should permanently delete file and remove physical storage when no references remain', async () => {
            const fileToDelete = {
                id: mockFileId1,
                name: 'permanent-delete.dwg',
                isFolder: false,
                isRoot: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                fileHash: mockFileHash,
                path: 'test/node/file.dwg',
                fileStatus: 'DELETED',
                deletedAt: new Date(Date.now() - 86400000),
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(fileToDelete);
            // Return 0 for reference count (no other files with same hash)
            mockDatabaseService.fileSystemNode.count.mockResolvedValueOnce(0);
            const result = await fileOperationsService.deleteNode(mockFileId1, true);
            expect(result.message).toContain('已彻底删除');
            // Verify database operations were performed
            expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalled();
            expect(mockDatabaseService.fileSystemNode.delete).toHaveBeenCalled();
            // Verify physical storage deletion was attempted
            expect(mockStorageProvider.deleteAll).toHaveBeenCalled();
            // Verify SVN operations if applicable
            expect(mockVersionControlService.deleteNodeDirectory).toHaveBeenCalled();
            expect(mockVersionControlService.commitWorkingCopy).toHaveBeenCalled();
        });
    });
    describe('Scenario 5: Reference Count - Delete Last Reference', () => {
        it('should delete physical file when deleting last reference', async () => {
            // Setup 3 files with same hash, delete one by one
            const fileToDelete = {
                id: mockFileId3,
                name: 'last-reference.dwg',
                isFolder: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                fileHash: mockFileHash,
                path: 'test/node/file.dwg',
                fileStatus: 'COMPLETED',
                deletedAt: null,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(fileToDelete);
            // Return 0 for reference count (this is the last one)
            mockDatabaseService.fileSystemNode.count.mockResolvedValueOnce(0);
            const result = await fileOperationsService.deleteNode(mockFileId3, true);
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
                isFolder: true,
                isRoot: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                deletedAt: null,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(folderToDelete);
            // Mock finding child nodes
            const childFile1 = { id: 'child-file-1', isFolder: false };
            const childFile2 = { id: 'child-file-2', isFolder: false };
            mockDatabaseService.fileSystemNode.findMany
                .mockResolvedValueOnce([childFile1, childFile2]) // First level children
                .mockResolvedValueOnce([]); // No further children
            const result = await fileOperationsService.deleteNode('folder-node-001', false);
            expect(result.message).toContain('回收站');
        });
    });
    describe('Scenario 7: Exception Case - Delete Non-Existent File', () => {
        it('should throw error when trying to delete non-existent file', async () => {
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce(null);
            await expect(fileOperationsService.deleteNode('non-existent-id', false))
                .rejects
                .toThrow('节点不存在');
        });
    });
    describe('Scenario 8: Edge Case - Restore with Name Conflict', () => {
        it('should generate unique name when restoring if name conflict exists', async () => {
            const deletedFile = {
                id: mockFileId1,
                name: 'conflict-file.dwg',
                isFolder: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                fileHash: mockFileHash,
                fileStatus: 'DELETED',
                deletedAt: new Date(),
            };
            const parentNode = { id: mockProjectId, deletedAt: null };
            mockDatabaseService.fileSystemNode.findUnique
                .mockResolvedValueOnce(deletedFile)
                .mockResolvedValueOnce(parentNode);
            // Mock that a file with same name already exists
            mockDatabaseService.fileSystemNode.findFirst.mockResolvedValueOnce({ id: 'existing-file' });
            // Mock the generation of unique name
            mockDatabaseService.fileSystemNode.findMany.mockResolvedValueOnce([
                { name: 'conflict-file.dwg' },
                { name: 'conflict-file (1).dwg' },
            ]);
            mockDatabaseService.fileSystemNode.update.mockResolvedValueOnce({
                ...deletedFile,
                name: 'conflict-file (2).dwg',
                deletedAt: null,
                fileStatus: 'COMPLETED',
            });
            const result = await fileOperationsService.restoreNode(mockFileId1, mockUserId);
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
                    isFolder: false,
                    ownerId: mockUserId,
                    deletedAt: new Date(Date.now() - 86400000),
                    owner: { id: mockUserId, username: 'testuser', nickname: 'Test User' },
                },
                {
                    id: mockFileId2,
                    name: 'deleted-file-2.dwg',
                    isFolder: false,
                    ownerId: mockUserId,
                    deletedAt: new Date(Date.now() - 172800000),
                    owner: { id: mockUserId, username: 'testuser', nickname: 'Test User' },
                },
            ];
            mockDatabaseService.fileSystemNode.findMany.mockResolvedValueOnce(deletedFiles);
            mockDatabaseService.fileSystemNode.count.mockResolvedValueOnce(2);
            const result = await fileOperationsService.getProjectTrash(mockProjectId, mockUserId, {
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
            // 1. Create first file
            const file1 = { id: mockFileId1, name: 'file-1.dwg', fileHash: mockFileHash };
            mockDatabaseService.fileSystemNode.create.mockResolvedValueOnce(file1);
            // 2. Create second file with same hash
            const file2 = { id: mockFileId2, name: 'file-2.dwg', fileHash: mockFileHash };
            mockDatabaseService.fileSystemNode.create.mockResolvedValueOnce(file2);
            // 3. Delete first file - reference count should be 1 remaining
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce({
                ...file1,
                isFolder: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                fileStatus: 'COMPLETED',
                deletedAt: null,
            });
            mockDatabaseService.fileSystemNode.count.mockResolvedValueOnce(1);
            const delete1 = await fileOperationsService.deleteNode(mockFileId1, false);
            expect(delete1.message).toContain('回收站');
            // 4. Delete second file - reference count should be 0
            jest.clearAllMocks();
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValueOnce({
                ...file2,
                isFolder: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                fileStatus: 'COMPLETED',
                deletedAt: null,
            });
            mockDatabaseService.fileSystemNode.count.mockResolvedValueOnce(0);
            const delete2 = await fileOperationsService.deleteNode(mockFileId2, false);
            expect(delete2.message).toContain('回收站');
            // 5. Restore second file
            jest.clearAllMocks();
            const deletedFile = {
                id: mockFileId2,
                name: file2.name,
                isFolder: false,
                parentId: mockProjectId,
                ownerId: mockUserId,
                fileHash: mockFileHash,
                fileStatus: 'DELETED',
                deletedAt: new Date(),
                deletedByCascade: false,
            };
            mockDatabaseService.fileSystemNode.findUnique
                .mockResolvedValueOnce(deletedFile)
                .mockResolvedValueOnce({ id: mockProjectId, deletedAt: null });
            mockDatabaseService.fileSystemNode.update.mockResolvedValueOnce({
                ...deletedFile,
                deletedAt: null,
                fileStatus: 'COMPLETED',
            });
            const restoreResult = await fileOperationsService.restoreNode(mockFileId2, mockUserId);
            expect(restoreResult).toBeDefined();
        });
    });
});
//# sourceMappingURL=workflow-3-delete-recycle-permanent.integration.spec.js.map