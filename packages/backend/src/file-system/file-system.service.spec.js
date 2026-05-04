///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { FileSystemService } from './file-system.service';
import { ProjectCrudService } from '../file-operations/project-crud.service';
import { FileTreeService } from './file-tree/file-tree.service';
import { FileOperationsService } from '../file-operations/file-operations.service';
import { FileDownloadExportService } from './file-download/file-download-export.service';
import { ProjectMemberService } from './project-member/project-member.service';
import { StorageInfoService } from './storage-quota/storage-info.service';
import { CadDownloadFormat } from './dto/download-node.dto';
describe('FileSystemService', () => {
    let service;
    const mockPrisma = {
        fileSystemNode: { findUnique: jest.fn(), update: jest.fn() },
    };
    const mockProjectCrud = {
        createProject: jest.fn(),
        getUserProjects: jest.fn(),
        getUserDeletedProjects: jest.fn(),
        getProject: jest.fn(),
        updateProject: jest.fn(),
        createNode: jest.fn(),
        createFolder: jest.fn(),
        getPersonalSpace: jest.fn(),
    };
    const mockFileTree = {
        createFileNode: jest.fn(),
        getNodeTree: jest.fn(),
        getRootNode: jest.fn(),
        getChildren: jest.fn(),
        getAllFilesUnderNode: jest.fn(),
        getNode: jest.fn(),
        updateNodePath: jest.fn(),
    };
    const mockFileOps = {
        updateNode: jest.fn(),
        deleteNode: jest.fn(),
        moveNode: jest.fn(),
        copyNode: jest.fn(),
        generateUniqueName: jest.fn(),
        restoreTrashItems: jest.fn(),
        permanentlyDeleteTrashItems: jest.fn(),
        clearTrash: jest.fn(),
        getProjectTrash: jest.fn(),
        restoreNode: jest.fn(),
        clearProjectTrash: jest.fn(),
    };
    const mockDownloadExport = {
        downloadNode: jest.fn(),
        downloadNodeWithFormat: jest.fn(),
        getFullPath: jest.fn(),
        checkFileAccess: jest.fn(),
        isLibraryNode: jest.fn(),
    };
    const mockProjectMember = {
        getProjectMembers: jest.fn(),
        addProjectMember: jest.fn(),
        updateProjectMember: jest.fn(),
        removeProjectMember: jest.fn(),
        transferProjectOwnership: jest.fn(),
        batchAddProjectMembers: jest.fn(),
        batchUpdateProjectMembers: jest.fn(),
    };
    const mockStorageInfo = {
        getUserStorageInfo: jest.fn(),
        getStorageQuota: jest.fn(),
        invalidateQuotaCache: jest.fn(),
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                FileSystemService,
                { provide: DatabaseService, useValue: mockPrisma },
                { provide: ProjectCrudService, useValue: mockProjectCrud },
                { provide: FileTreeService, useValue: mockFileTree },
                { provide: FileOperationsService, useValue: mockFileOps },
                { provide: FileDownloadExportService, useValue: mockDownloadExport },
                { provide: ProjectMemberService, useValue: mockProjectMember },
                { provide: StorageInfoService, useValue: mockStorageInfo },
            ],
        }).compile();
        service = module.get(FileSystemService);
    });
    // ==================== Project CRUD ====================
    describe('project CRUD delegation', () => {
        it('createProject delegates to ProjectCrudService', async () => {
            const dto = { name: 'Test Project', description: 'desc' };
            mockProjectCrud.createProject.mockResolvedValue({ id: 'p1' });
            expect(await service.createProject('u1', dto)).toEqual({ id: 'p1' });
            expect(mockProjectCrud.createProject).toHaveBeenCalledWith('u1', dto);
        });
        it('getUserProjects delegates', async () => {
            mockProjectCrud.getUserProjects.mockResolvedValue({ items: [] });
            await service.getUserProjects('u1', { page: 1 });
            expect(mockProjectCrud.getUserProjects).toHaveBeenCalledWith('u1', { page: 1 });
        });
        it('getUserDeletedProjects delegates', async () => {
            mockProjectCrud.getUserDeletedProjects.mockResolvedValue({ items: [] });
            await service.getUserDeletedProjects('u1');
            expect(mockProjectCrud.getUserDeletedProjects).toHaveBeenCalled();
        });
        it('getProject delegates', async () => {
            mockProjectCrud.getProject.mockResolvedValue({ id: 'p1' });
            expect(await service.getProject('p1')).toEqual({ id: 'p1' });
        });
        it('updateProject delegates', async () => {
            const dto = { name: 'Renamed' };
            mockProjectCrud.updateProject.mockResolvedValue({ id: 'p1' });
            await service.updateProject('p1', dto);
            expect(mockProjectCrud.updateProject).toHaveBeenCalledWith('p1', dto);
        });
    });
    // ==================== Node creation ====================
    describe('node creation delegation', () => {
        it('deleteProject delegates to deleteNode', async () => {
            mockFileOps.deleteNode.mockResolvedValue({ success: true });
            await service.deleteProject('p1', true);
            expect(mockFileOps.deleteNode).toHaveBeenCalledWith('p1', true);
        });
        it('createNode delegates to ProjectCrudService', async () => {
            mockProjectCrud.createNode.mockResolvedValue({ id: 'n1' });
            await service.createNode('u1', 'test', { parentId: 'p1' });
            expect(mockProjectCrud.createNode).toHaveBeenCalledWith('u1', 'test', { parentId: 'p1' });
        });
        it('createFileNode delegates to FileTreeService', async () => {
            const opts = { name: 'f.dwg', fileHash: 'abc', size: 100, mimeType: 'dwg', extension: '.dwg', parentId: 'p1', ownerId: 'u1' };
            mockFileTree.createFileNode.mockResolvedValue({ id: 'n1' });
            expect(await service.createFileNode(opts)).toEqual({ id: 'n1' });
            expect(mockFileTree.createFileNode).toHaveBeenCalledWith(opts);
        });
        it('createFolder delegates', async () => {
            mockProjectCrud.createFolder.mockResolvedValue({ id: 'f1' });
            await service.createFolder('u1', 'p1', { name: 'folder' });
            expect(mockProjectCrud.createFolder).toHaveBeenCalledWith('u1', 'p1', { name: 'folder' });
        });
    });
    // ==================== File tree operations ====================
    describe('file tree delegation', () => {
        it('getNodeTree delegates', async () => {
            mockFileTree.getNodeTree.mockResolvedValue({ id: 'n1' });
            expect(await service.getNodeTree('n1')).toEqual({ id: 'n1' });
        });
        it('getRootNode delegates', async () => {
            mockFileTree.getRootNode.mockResolvedValue({ id: 'r1' });
            expect(await service.getRootNode('r1')).toEqual({ id: 'r1' });
        });
        it('getChildren delegates', async () => {
            mockFileTree.getChildren.mockResolvedValue({ nodes: [], total: 0 });
            await service.getChildren('p1', 'u1', { page: 1 });
            expect(mockFileTree.getChildren).toHaveBeenCalledWith('p1', 'u1', { page: 1 });
        });
        it('getAllFilesUnderNode delegates', async () => {
            mockFileTree.getAllFilesUnderNode.mockResolvedValue({ nodes: [] });
            await service.getAllFilesUnderNode('p1', 'u1');
            expect(mockFileTree.getAllFilesUnderNode).toHaveBeenCalledWith('p1', 'u1', undefined);
        });
        it('getNode delegates', async () => {
            mockFileTree.getNode.mockResolvedValue({ id: 'n1' });
            expect(await service.getNode('n1')).toEqual({ id: 'n1' });
        });
    });
    // ==================== File operations ====================
    describe('file operation delegation', () => {
        it('updateNode delegates', async () => {
            const dto = { name: 'renamed' };
            mockFileOps.updateNode.mockResolvedValue({ id: 'n1' });
            await service.updateNode('n1', dto);
            expect(mockFileOps.updateNode).toHaveBeenCalledWith('n1', dto);
        });
        it('updateNodePath delegates', async () => {
            mockFileTree.updateNodePath.mockResolvedValue({ id: 'n1' });
            await service.updateNodePath('n1', '/new/path');
            expect(mockFileTree.updateNodePath).toHaveBeenCalledWith('n1', '/new/path');
        });
        it('deleteNode delegates', async () => {
            mockFileOps.deleteNode.mockResolvedValue({ success: true });
            await service.deleteNode('n1', true);
            expect(mockFileOps.deleteNode).toHaveBeenCalledWith('n1', true);
        });
        it('moveNode delegates', async () => {
            mockFileOps.moveNode.mockResolvedValue({ id: 'n1' });
            await service.moveNode('n1', 'target');
            expect(mockFileOps.moveNode).toHaveBeenCalledWith('n1', 'target');
        });
        it('copyNode delegates', async () => {
            mockFileOps.copyNode.mockResolvedValue({ id: 'n2' });
            await service.copyNode('n1', 'target');
            expect(mockFileOps.copyNode).toHaveBeenCalledWith('n1', 'target');
        });
        it('generateUniqueName delegates', async () => {
            mockFileOps.generateUniqueName.mockResolvedValue('file (1).dwg');
            await service.generateUniqueName('p1', 'file.dwg', false);
            expect(mockFileOps.generateUniqueName).toHaveBeenCalledWith('p1', 'file.dwg', false);
        });
    });
    // ==================== Trash management ====================
    describe('trash delegation', () => {
        it('restoreTrashItems delegates', async () => {
            mockFileOps.restoreTrashItems.mockResolvedValue([{ id: 'n1' }]);
            await service.restoreTrashItems(['n1'], 'u1');
            expect(mockFileOps.restoreTrashItems).toHaveBeenCalledWith(['n1'], 'u1');
        });
        it('permanentlyDeleteTrashItems delegates', async () => {
            mockFileOps.permanentlyDeleteTrashItems.mockResolvedValue([{ id: 'n1' }]);
            await service.permanentlyDeleteTrashItems(['n1']);
            expect(mockFileOps.permanentlyDeleteTrashItems).toHaveBeenCalledWith(['n1']);
        });
        it('clearTrash delegates', async () => {
            mockFileOps.clearTrash.mockResolvedValue({ count: 5 });
            await service.clearTrash('u1');
            expect(mockFileOps.clearTrash).toHaveBeenCalledWith('u1');
        });
        it('getProjectTrash delegates', async () => {
            mockFileOps.getProjectTrash.mockResolvedValue({ nodes: [] });
            await service.getProjectTrash('p1', 'u1');
            expect(mockFileOps.getProjectTrash).toHaveBeenCalledWith('p1', 'u1', undefined);
        });
        it('restoreNode delegates', async () => {
            mockFileOps.restoreNode.mockResolvedValue({ id: 'n1' });
            await service.restoreNode('n1', 'u1');
            expect(mockFileOps.restoreNode).toHaveBeenCalledWith('n1', 'u1');
        });
        it('clearProjectTrash delegates', async () => {
            mockFileOps.clearProjectTrash.mockResolvedValue({ count: 3 });
            await service.clearProjectTrash('p1', 'u1');
            expect(mockFileOps.clearProjectTrash).toHaveBeenCalledWith('p1', 'u1');
        });
    });
    // ==================== Download and export ====================
    describe('download/export delegation', () => {
        it('downloadNode delegates', async () => {
            const result = { stream: {}, filename: 'f.dwg', mimeType: 'dwg' };
            mockDownloadExport.downloadNode.mockResolvedValue(result);
            expect(await service.downloadNode('n1', 'u1')).toBe(result);
        });
        it('downloadNodeWithFormat delegates', async () => {
            mockDownloadExport.downloadNodeWithFormat.mockResolvedValue({ stream: {} });
            await service.downloadNodeWithFormat('n1', 'u1', CadDownloadFormat.DWG);
            expect(mockDownloadExport.downloadNodeWithFormat).toHaveBeenCalledWith('n1', 'u1', 'dwg', undefined);
        });
        it('getFullPath delegates', () => {
            mockDownloadExport.getFullPath.mockReturnValue('/abs/path');
            expect(service.getFullPath('rel/path')).toBe('/abs/path');
        });
        it('checkFileAccess delegates', async () => {
            mockDownloadExport.checkFileAccess.mockResolvedValue(true);
            expect(await service.checkFileAccess('n1', 'u1')).toBe(true);
        });
        it('isLibraryNode delegates', async () => {
            mockDownloadExport.isLibraryNode.mockResolvedValue(true);
            expect(await service.isLibraryNode('n1')).toBe(true);
        });
    });
    // ==================== Project member management ====================
    describe('project member delegation', () => {
        it('getProjectMembers delegates', async () => {
            mockProjectMember.getProjectMembers.mockResolvedValue([{ userId: 'u2' }]);
            expect(await service.getProjectMembers('p1')).toEqual([{ userId: 'u2' }]);
        });
        it('addProjectMember delegates', async () => {
            await service.addProjectMember('p1', 'u2', 'role1', 'admin');
            expect(mockProjectMember.addProjectMember).toHaveBeenCalledWith('p1', 'u2', 'role1', 'admin');
        });
        it('updateProjectMember delegates', async () => {
            await service.updateProjectMember('p1', 'u2', 'role2', 'admin');
            expect(mockProjectMember.updateProjectMember).toHaveBeenCalledWith('p1', 'u2', 'role2', 'admin');
        });
        it('removeProjectMember delegates', async () => {
            await service.removeProjectMember('p1', 'u2', 'admin');
            expect(mockProjectMember.removeProjectMember).toHaveBeenCalledWith('p1', 'u2', 'admin');
        });
        it('transferProjectOwnership delegates', async () => {
            await service.transferProjectOwnership('p1', 'u2', 'admin');
            expect(mockProjectMember.transferProjectOwnership).toHaveBeenCalledWith('p1', 'u2', 'admin');
        });
        it('batchAddProjectMembers delegates', async () => {
            const members = [{ userId: 'u2', projectRoleId: 'role1' }];
            await service.batchAddProjectMembers('p1', members);
            expect(mockProjectMember.batchAddProjectMembers).toHaveBeenCalledWith('p1', members);
        });
        it('batchUpdateProjectMembers delegates', async () => {
            const members = [{ userId: 'u2', projectRoleId: 'role2' }];
            await service.batchUpdateProjectMembers('p1', members);
            expect(mockProjectMember.batchUpdateProjectMembers).toHaveBeenCalledWith('p1', members);
        });
    });
    // ==================== Storage info ====================
    describe('storage info delegation', () => {
        it('getUserStorageInfo delegates', async () => {
            mockStorageInfo.getUserStorageInfo.mockResolvedValue({ used: 100 });
            expect(await service.getUserStorageInfo('u1')).toEqual({ used: 100 });
        });
        it('getNodeStorageQuota delegates', async () => {
            mockFileTree.getNode.mockResolvedValue({ id: 'n1', ownerId: 'u1' });
            mockStorageInfo.getStorageQuota.mockResolvedValue({ quota: 10 });
            const result = await service.getNodeStorageQuota('u1', 'n1');
            expect(result).toEqual({ quota: 10 });
            expect(mockFileTree.getNode).toHaveBeenCalledWith('n1');
        });
        it('getNodeStorageQuota throws when node not found', async () => {
            mockFileTree.getNode.mockResolvedValue(null);
            await expect(service.getNodeStorageQuota('u1', 'missing')).rejects.toThrow('节点不存在');
        });
        it('updateNodeStorageQuota updates and invalidates cache', async () => {
            mockFileTree.getNode.mockResolvedValue({ id: 'n1', ownerId: 'u1' });
            mockPrisma.fileSystemNode.update.mockResolvedValue({ id: 'n1', storageQuota: 20 });
            const result = await service.updateNodeStorageQuota('n1', 20);
            expect(result.storageQuota).toBe(20);
            expect(mockStorageInfo.invalidateQuotaCache).toHaveBeenCalledWith('u1', 'n1');
        });
        it('updateNodeStorageQuota throws when node not found', async () => {
            mockFileTree.getNode.mockResolvedValue(null);
            await expect(service.updateNodeStorageQuota('missing', 10)).rejects.toThrow('节点不存在');
        });
        it('getPersonalSpace delegates', async () => {
            mockProjectCrud.getPersonalSpace.mockResolvedValue({ id: 'ps1' });
            expect(await service.getPersonalSpace('u1')).toEqual({ id: 'ps1' });
        });
    });
    // ==================== Unimplemented methods ====================
    describe('unimplemented methods', () => {
        it('uploadFile throws not implemented', async () => {
            await expect(service.uploadFile('u1', 'p1', {})).rejects.toThrow('尚未实现');
        });
        it('getTrashItems throws not implemented', async () => {
            await expect(service.getTrashItems('u1')).rejects.toThrow('尚未实现');
        });
    });
});
//# sourceMappingURL=file-system.service.spec.js.map