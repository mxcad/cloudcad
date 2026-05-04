///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../src/database/database.service';
import { FileSystemService } from '../../src/file-system/file-system.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { StorageManager } from '../../src/common/services/storage-manager.service';
import { FileConversionService } from '../../src/mxcad/conversion/file-conversion.service';
import { FileSystemPermissionService } from '../../src/file-system/file-permission/file-system-permission.service';
import { VERSION_CONTROL_TOKEN, } from '../../src/version-control/interfaces/version-control.interface';
import { SaveAsService } from '../../src/mxcad/save/save-as.service';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
const svnBehaviors = {};
function installSvn(name, fn) {
    svnBehaviors[name] = fn;
}
function svnOk(result) {
    return (...args) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function')
            cb(null, result);
    };
}
const svnNames = [
    'svnCheckout', 'svnAdd', 'svnCommit', 'svnDelete', 'svnadminCreate',
    'svnImport', 'svnLog', 'svnCat', 'svnList', 'svnPropset', 'svnUpdate', 'svnCleanup',
];
const svnMockObj = {};
for (const name of svnNames) {
    const dispatcher = (...args) => {
        const handler = svnBehaviors[name];
        if (handler)
            return handler(...args);
        const cb = args[args.length - 1];
        if (typeof cb === 'function')
            cb(null, '');
    };
    svnMockObj[name] = dispatcher;
}
jest.mock('@cloudcad/svn-version-tool', () => svnMockObj);
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        existsSync: () => true,
        readdirSync: () => [],
        mkdirSync: () => undefined,
        readFileSync: () => '{}',
        statSync: () => ({ size: 1024 }),
    };
});
function resetSvnDefaults() {
    installSvn('svnCheckout', svnOk('Checked out'));
    installSvn('svnAdd', svnOk('A  file'));
    installSvn('svnCommit', svnOk('Committed revision 1.'));
    installSvn('svnDelete', svnOk('D  file'));
    installSvn('svnadminCreate', svnOk('Created'));
    installSvn('svnImport', svnOk('Imported'));
    installSvn('svnLog', svnOk(`<?xml version="1.0"?><log><logentry revision="1"><author>testuser</author><date>2024-01-01T10:00:00.000000Z</date><msg>{"type":"file_operation","message":"Save as: test.dwg","userName":"TestUser"}</msg><paths><path action="A" kind="file">/test.dwg</path></paths></logentry></log>`));
    installSvn('svnCat', svnOk('file content'));
    installSvn('svnList', svnOk('file1.dwg\nfile2.dxf'));
    installSvn('svnPropset', svnOk('property set'));
    installSvn('svnUpdate', svnOk('Updated'));
    installSvn('svnCleanup', svnOk('Cleanup'));
}
const mockVersionControl = {
    isReady: jest.fn().mockReturnValue(true),
    ensureInitialized: jest.fn().mockResolvedValue(undefined),
    commitNodeDirectory: jest.fn().mockResolvedValue({ success: true, message: '提交成功', revision: 1 }),
    commitFiles: jest.fn().mockResolvedValue({ success: true, message: '提交成功' }),
    commitWorkingCopy: jest.fn().mockResolvedValue({ success: true, message: '提交成功' }),
    deleteNodeDirectory: jest.fn().mockResolvedValue({ success: true, message: '删除成功' }),
    getFileHistory: jest.fn().mockResolvedValue({
        success: true,
        message: '获取成功',
        entries: [
            {
                revision: 1,
                author: 'testuser',
                date: new Date('2024-01-01T10:00:00.000000Z'),
                message: 'Save as: test.dwg',
                userName: 'TestUser',
                paths: [{ action: 'A', kind: 'file', path: '/test.dwg' }],
            },
        ],
    }),
    listDirectoryAtRevision: jest.fn().mockResolvedValue({ success: true, message: '获取成功', files: [] }),
    getFileContentAtRevision: jest.fn().mockResolvedValue({ success: true, message: '获取成功', content: Buffer.from('') }),
    rollbackToRevision: jest.fn().mockResolvedValue({ success: true, message: '回滚成功' }),
};
const tempDir = path.join(process.cwd(), 'temp-test-save-as-' + Date.now());
const tempFilePath = path.join(tempDir, 'test.mxweb');
beforeAll(async () => {
    await fsPromises.mkdir(tempDir, { recursive: true });
    await fsPromises.writeFile(tempFilePath, 'mock mxweb content for save as');
});
afterAll(async () => {
    try {
        await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
    catch { }
});
describe('CAD Save As → Node Duplication → Independent Version Chain Integration', () => {
    let saveAsService;
    beforeEach(async () => {
        resetSvnDefaults();
        jest.clearAllMocks();
        const mockFileSystemService = {
            getNode: jest.fn().mockResolvedValue({ id: 'parent-123', isFolder: true, parentId: null }),
            getChildren: jest.fn().mockResolvedValue({ nodes: [] }),
            createFileNode: jest.fn().mockResolvedValue({ id: 'node-123', name: 'test.dwg', isFolder: false }),
            updateNodePath: jest.fn().mockResolvedValue(undefined),
            deleteNode: jest.fn().mockResolvedValue({ success: true }),
        };
        const mockFileSystemNodeService = {
            findById: jest.fn().mockResolvedValue({ id: 'node-123', name: 'test.dwg' }),
            getMimeType: jest.fn().mockReturnValue('application/dwg'),
        };
        const mockStorageManager = {
            allocateNodeStorage: jest.fn().mockResolvedValue({
                nodeDirectoryPath: '/fake/filesData/project/node-123',
                nodeDirectoryRelativePath: 'project/node-123',
            }),
        };
        const mockFileConversionService = {
            convertFile: jest.fn().mockResolvedValue({ isOk: true, ret: { code: 0 } }),
        };
        const mockPermissionService = {
            checkPermission: jest.fn().mockResolvedValue(true),
        };
        const mockDatabaseService = {
            fileSystemNode: {
                update: jest.fn().mockResolvedValue({}),
            },
        };
        const module = await Test.createTestingModule({
            providers: [
                SaveAsService,
                { provide: ConfigService, useValue: {} },
                { provide: FileSystemService, useValue: mockFileSystemService },
                { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
                { provide: StorageManager, useValue: mockStorageManager },
                { provide: FileConversionService, useValue: mockFileConversionService },
                { provide: FileSystemPermissionService, useValue: mockPermissionService },
                { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControl },
                { provide: DatabaseService, useValue: mockDatabaseService },
            ],
        }).compile();
        saveAsService = module.get(SaveAsService);
    });
    describe('T1: Save As - Node Duplication', () => {
        it('T1-S1: Save As creates a new independent file node', async () => {
            const mockFile = {
                path: tempFilePath,
                originalname: 'original.mxweb',
                mimetype: 'application/octet-stream',
                size: 1024,
                fieldname: 'file',
                encoding: '7bit',
                destination: tempDir,
                filename: 'original.mxweb',
                buffer: Buffer.from(''),
                stream: null,
            };
            const result = await saveAsService.saveMxwebAs({
                file: mockFile,
                targetType: 'project',
                targetParentId: 'parent-123',
                projectId: 'project-456',
                format: 'dwg',
                userId: 'user-789',
                userName: 'TestUser',
                commitMessage: 'Save as copy of original drawing',
            });
            expect(result.success).toBe(true);
            expect(result.nodeId).toBeDefined();
        });
    });
    describe('T2: Independent Version Chain', () => {
        it('T2-S1: Save As triggers new file has its own independent version history', async () => {
            const mockFile = {
                path: tempFilePath,
                originalname: 'new-file.mxweb',
                mimetype: 'application/octet-stream',
                size: 1024,
                fieldname: 'file',
                encoding: '7bit',
                destination: tempDir,
                filename: 'new-file.mxweb',
                buffer: Buffer.from(''),
                stream: null,
            };
            await saveAsService.saveMxwebAs({
                file: mockFile,
                targetType: 'project',
                targetParentId: 'parent-123',
                projectId: 'project-456',
                format: 'dwg',
                userId: 'user-789',
                userName: 'TestUser',
                commitMessage: 'Initial save as',
            });
            expect(mockVersionControl.commitNodeDirectory).toHaveBeenCalledWith('/fake/filesData/project/node-123', 'Initial save as', 'user-789', 'TestUser');
        });
        it('T2-S2: Multiple save operations create sequential versions', async () => {
            const commitCalls = [];
            mockVersionControl.commitNodeDirectory.mockImplementation(async (directoryPath, message, userId, userName) => {
                commitCalls.push({ directoryPath, message, userId, userName, revision: commitCalls.length + 1 });
                return { success: true, message: '提交成功', revision: commitCalls.length };
            });
            const mockFile = {
                path: tempFilePath,
                originalname: 'test.mxweb',
                mimetype: 'application/octet-stream',
                size: 1024,
                fieldname: 'file',
                encoding: '7bit',
                destination: tempDir,
                filename: 'test.mxweb',
                buffer: Buffer.from(''),
                stream: null,
            };
            // First save
            await saveAsService.saveMxwebAs({
                file: mockFile,
                targetType: 'project',
                targetParentId: 'parent-123',
                projectId: 'project-456',
                format: 'dwg',
                userId: 'user-001',
                userName: 'User',
                commitMessage: 'First version',
            });
            // Second save
            await saveAsService.saveMxwebAs({
                file: mockFile,
                targetType: 'project',
                targetParentId: 'parent-123',
                projectId: 'project-456',
                format: 'dwg',
                userId: 'user-001',
                userName: 'User',
                commitMessage: 'Second version',
            });
            expect(commitCalls.length).toBe(2);
            expect(commitCalls[0].message).toBe('First version');
            expect(commitCalls[1].message).toBe('Second version');
        });
    });
    describe('T3: Format Conversion on Save As', () => {
        it('T3-S1: Save As can convert to different formats', async () => {
            const formats = ['dwg', 'dxf'];
            for (const format of formats) {
                const mockFile = {
                    path: tempFilePath,
                    originalname: 'convert-test.mxweb',
                    mimetype: 'application/octet-stream',
                    size: 1024,
                    fieldname: 'file',
                    encoding: '7bit',
                    destination: tempDir,
                    filename: 'convert-test.mxweb',
                    buffer: Buffer.from(''),
                    stream: null,
                };
                const result = await saveAsService.saveMxwebAs({
                    file: mockFile,
                    targetType: 'project',
                    targetParentId: 'parent-123',
                    projectId: 'project-456',
                    format,
                    userId: 'user-789',
                    userName: 'TestUser',
                });
                expect(result.success).toBe(true);
            }
            expect(mockFileConversionService.convertFile).toHaveBeenCalledTimes(formats.length);
        });
    });
});
//# sourceMappingURL=cad-save-as-duplicate-version-chain.integration.spec.js.map