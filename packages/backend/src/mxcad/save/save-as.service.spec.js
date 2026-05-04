///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { SaveAsService } from './save-as.service';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { VERSION_CONTROL_TOKEN } from '../../version-control/interfaces/version-control.interface';
import { DatabaseService } from '../../database/database.service';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
describe('SaveAsService', () => {
    let service;
    const mockFileSystemService = {
        getNode: jest.fn(),
        createFileNode: jest.fn(),
        updateNodePath: jest.fn(),
        getChildren: jest.fn(),
    };
    const mockFileSystemNodeService = {
        getMimeType: jest.fn(),
        findById: jest.fn(),
    };
    const mockStorageManager = {
        allocateNodeStorage: jest.fn(),
    };
    const mockFileConversionService = {
        convertFile: jest.fn(),
    };
    const mockPermissionService = {};
    const mockVersionControlService = {
        commitNodeDirectory: jest.fn(),
    };
    const mockPrisma = {
        fileSystemNode: {
            update: jest.fn(),
        },
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        jest.spyOn(fs.promises, 'copyFile').mockResolvedValue(undefined);
        jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 });
        const module = await Test.createTestingModule({
            providers: [
                SaveAsService,
                { provide: FileSystemService, useValue: mockFileSystemService },
                { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
                { provide: StorageManager, useValue: mockStorageManager },
                { provide: FileConversionService, useValue: mockFileConversionService },
                { provide: FileSystemPermissionService, useValue: mockPermissionService },
                { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
                { provide: DatabaseService, useValue: mockPrisma },
            ],
        }).compile();
        service = module.get(SaveAsService);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
    describe('saveMxwebAs', () => {
        it('should save mxweb file successfully', async () => {
            const mockFile = {
                path: path.join(os.tmpdir(), 'test.mxweb'),
                originalname: 'test.mxweb',
            };
            const mockParentNode = {
                id: 'parent1',
                isFolder: true,
            };
            const mockNewNode = {
                id: 'node1',
            };
            mockFileSystemService.getNode.mockResolvedValue(mockParentNode);
            mockFileSystemService.createFileNode.mockResolvedValue(mockNewNode);
            mockStorageManager.allocateNodeStorage.mockResolvedValue({
                nodeDirectoryPath: '/storage/node1',
                nodeDirectoryRelativePath: '2026/04/node1',
            });
            mockFileConversionService.convertFile.mockResolvedValue({
                isOk: true,
                ret: { code: 0, message: 'success' },
            });
            mockFileSystemNodeService.findById.mockResolvedValue({ id: 'node1' });
            mockFileSystemNodeService.getMimeType.mockReturnValue('application/dwg');
            mockFileSystemService.getChildren.mockResolvedValue({ nodes: [] });
            const result = await service.saveMxwebAs({
                file: mockFile,
                targetType: 'personal',
                targetParentId: 'parent1',
                projectId: undefined,
                format: 'dwg',
                userId: 'user1',
                userName: 'Test User',
            });
            expect(result.success).toBe(true);
        });
        it('should return error when file is missing', async () => {
            const result = await service.saveMxwebAs({
                file: null,
                targetType: 'personal',
                targetParentId: 'parent1',
                projectId: undefined,
                format: 'dwg',
                userId: 'user1',
                userName: 'Test User',
            });
            expect(result.success).toBe(false);
            expect(result.message).toBe('缺少文件');
        });
        it('should return error when file format is not supported', async () => {
            const mockFile = {
                path: path.join(os.tmpdir(), 'test.txt'),
                originalname: 'test.txt',
            };
            const result = await service.saveMxwebAs({
                file: mockFile,
                targetType: 'personal',
                targetParentId: 'parent1',
                projectId: undefined,
                format: 'dwg',
                userId: 'user1',
                userName: 'Test User',
            });
            expect(result.success).toBe(false);
            expect(result.message).toContain('不支持的文件格式');
        });
        it('should return error when parent node does not exist', async () => {
            const mockFile = {
                path: path.join(os.tmpdir(), 'test.mxweb'),
                originalname: 'test.mxweb',
            };
            mockFileSystemService.getNode.mockResolvedValue(null);
            const result = await service.saveMxwebAs({
                file: mockFile,
                targetType: 'personal',
                targetParentId: 'parent1',
                projectId: undefined,
                format: 'dwg',
                userId: 'user1',
                userName: 'Test User',
            });
            expect(result.success).toBe(false);
            expect(result.message).toBe('目标文件夹不存在');
        });
        it('should return error when parent is not a folder', async () => {
            const mockFile = {
                path: path.join(os.tmpdir(), 'test.mxweb'),
                originalname: 'test.mxweb',
            };
            const mockParentNode = {
                id: 'parent1',
                isFolder: false,
            };
            mockFileSystemService.getNode.mockResolvedValue(mockParentNode);
            const result = await service.saveMxwebAs({
                file: mockFile,
                targetType: 'personal',
                targetParentId: 'parent1',
                projectId: undefined,
                format: 'dwg',
                userId: 'user1',
                userName: 'Test User',
            });
            expect(result.success).toBe(false);
            expect(result.message).toBe('目标必须是文件夹');
        });
        it('should return error when file conversion fails', async () => {
            const mockFile = {
                path: path.join(os.tmpdir(), 'test.mxweb'),
                originalname: 'test.mxweb',
            };
            const mockParentNode = {
                id: 'parent1',
                isFolder: true,
            };
            const mockNewNode = {
                id: 'node1',
            };
            mockFileSystemService.getNode.mockResolvedValue(mockParentNode);
            mockFileSystemService.createFileNode.mockResolvedValue(mockNewNode);
            mockStorageManager.allocateNodeStorage.mockResolvedValue({
                nodeDirectoryPath: '/storage/node1',
                nodeDirectoryRelativePath: '2026/04/node1',
            });
            mockFileConversionService.convertFile.mockResolvedValue({
                isOk: false,
                ret: { code: 1, message: 'conversion error' },
            });
            mockFileSystemNodeService.getMimeType.mockReturnValue('application/dwg');
            mockFileSystemService.getChildren.mockResolvedValue({ nodes: [] });
            const result = await service.saveMxwebAs({
                file: mockFile,
                targetType: 'personal',
                targetParentId: 'parent1',
                projectId: undefined,
                format: 'dwg',
                userId: 'user1',
                userName: 'Test User',
            });
            expect(result.success).toBe(false);
        });
    });
});
//# sourceMappingURL=save-as.service.spec.js.map