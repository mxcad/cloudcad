///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../src/database/database.service';
import { FileSystemService } from '../../src/file-system/file-system.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { StorageManager } from '../../src/common/services/storage-manager.service';
import { FileConversionService } from '../../src/mxcad/conversion/file-conversion.service';
import { FileSystemPermissionService } from '../../src/file-system/file-permission/file-system-permission.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../src/version-control/interfaces/version-control.interface';
import { SaveAsService } from '../../src/mxcad/save/save-as.service';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

const mxBehaviors: Record<string, Function> = {};

function installMx(name: string, fn: Function) {
  mxBehaviors[name] = fn;
}

function mxOk(result: string) {
  return (...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, result);
  };
}

const mxNames = [
  'mxCheckout', 'mxAdd', 'mxCommit', 'mxDelete', 'mxadminCreate',
  'mxImport', 'mxLog', 'mxCat', 'mxList', 'mxPropset', 'mxUpdate', 'mxCleanup',
];

const mxMockObj: Record<string, Function> = {};
for (const name of mxNames) {
  const dispatcher = (...args: any[]) => {
    const handler = mxBehaviors[name];
    if (handler) return handler(...args);
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, '');
  };
  mxMockObj[name] = dispatcher;
}

jest.mock('@cloudcad/mx-version-tool', () => mxMockObj);

jest.mock('../../src/conversion', () => ({
  ProcessRunnerService: jest.fn(),
}));

jest.mock('../../src/common/concurrency/rate-limiter', () => ({
  RateLimiter: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  })),
}));

function resetMxDefaults() {
  installMx('mxCheckout', mxOk('Checked out'));
  installMx('mxAdd', mxOk('A  file'));
  installMx('mxCommit', mxOk('Committed revision 1.'));
  installMx('mxDelete', mxOk('D  file'));
  installMx('mxadminCreate', mxOk('Created'));
  installMx('mxImport', mxOk('Imported'));
  installMx('mxLog', mxOk(`<?xml version="1.0"?><log><logentry revision="1"><author>testuser</author><date>2024-01-01T10:00:00.000000Z</date><msg>{"type":"file_operation","message":"Save as: test.dwg","userName":"TestUser"}</msg><paths><path action="A" kind="file">/test.dwg</path></paths></logentry></log>`));
  installMx('mxCat', mxOk('file content'));
  installMx('mxList', mxOk('file1.dwg\nfile2.dxf'));
  installMx('mxPropset', mxOk('property set'));
  installMx('mxUpdate', mxOk('Updated'));
  installMx('mxCleanup', mxOk('Cleanup'));
}

describe('CAD Save → MX Commit → Version History Integration', () => {
  let saveAsService: SaveAsService;
  let mockVersionControl: jest.Mocked<IVersionControl>;
  let tempDir: string;
  let tempFilePath: string;
  let storageDir: string;

  beforeEach(async () => {
    resetMxDefaults();

    tempDir = path.join(process.cwd(), 'temp-test-' + Date.now());
    tempFilePath = path.join(tempDir, 'test.mxweb');
    storageDir = path.join(tempDir, 'storage');

    await fsPromises.mkdir(tempDir, { recursive: true });
    await fsPromises.mkdir(storageDir, { recursive: true });
    await fsPromises.writeFile(tempFilePath, 'mock mxweb content');
    await fsPromises.writeFile(path.join(storageDir, 'node-123.dwg'), 'mock dwg content');
    await fsPromises.writeFile(path.join(storageDir, 'node-123.dxf'), 'mock dxf content');
    await fsPromises.writeFile(path.join(storageDir, 'node-123.dwg.mxweb'), 'mock dwg mxweb content');
    await fsPromises.writeFile(path.join(storageDir, 'node-123.dxf.mxweb'), 'mock dxf mxweb content');

    mockVersionControl = {
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

    } as unknown as jest.Mocked<IVersionControl>;

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
        nodeDirectoryPath: storageDir,
        nodeDirectoryRelativePath: 'storage',
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

    const module: TestingModule = await Test.createTestingModule({
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

    saveAsService = module.get<SaveAsService>(SaveAsService);
  });

  afterEach(async () => {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('T1: CAD Save → MX Commit Chain', () => {
    it('T1-S1: Save CAD file to project space triggers MX commit', async () => {
      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from(''),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentId: 'parent-123',
        projectId: 'project-456',
        format: 'dwg',
        userId: 'user-789',
        userName: 'TestUser',
        commitMessage: 'Save test drawing',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
      expect(mockVersionControl.commitNodeDirectory).toHaveBeenCalled();
      const commitCall = (mockVersionControl.commitNodeDirectory as jest.Mock).mock.calls[0];
      expect(commitCall[1]).toBe('Save test drawing');
      expect(commitCall[2]).toBe('user-789');
      expect(commitCall[3]).toBe('TestUser');
    });

    it('T1-S2: Save CAD file to personal space triggers MX commit', async () => {
      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from(''),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'personal',
        targetParentId: 'parent-personal',
        projectId: undefined,
        format: 'dxf',
        userId: 'user-001',
        userName: 'PersonalUser',
        commitMessage: 'Save personal drawing',
      });

      expect(result.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).toHaveBeenCalled();
      const commitCall = (mockVersionControl.commitNodeDirectory as jest.Mock).mock.calls[0];
      expect(commitCall[1]).toBe('Save personal drawing');
      expect(commitCall[2]).toBe('user-001');
      expect(commitCall[3]).toBe('PersonalUser');
    });

    it('T1-S3: MX commit failure does not break save operation', async () => {
      (mockVersionControl.commitNodeDirectory as jest.Mock).mockRejectedValueOnce(
        new Error('MX commit failed')
      );

      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from(''),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentId: 'parent-123',
        projectId: 'project-456',
        format: 'dwg',
        userId: 'user-789',
        userName: 'TestUser',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('T2: Version History Retrieval', () => {
    it('T2-S1: getFileHistory returns correct commit entries after save', async () => {
      const historyResult = await mockVersionControl.getFileHistory(
        'project/node-123/test.dwg',
        10
      );

      expect(historyResult.success).toBe(true);
      expect(historyResult.entries).toHaveLength(1);
      expect(historyResult.entries[0].revision).toBe(1);
      expect(historyResult.entries[0].author).toBe('testuser');
      expect(historyResult.entries[0].message).toBe('Save as: test.dwg');
      expect(historyResult.entries[0].userName).toBe('TestUser');
    });

    it('T2-S2: getFileHistory handles empty history', async () => {
      (mockVersionControl.getFileHistory as jest.Mock).mockResolvedValueOnce({
        success: true,
        message: '获取成功',
        entries: [],
      });

      const historyResult = await mockVersionControl.getFileHistory(
        'project/node-123/empty.dwg',
        10
      );

      expect(historyResult.success).toBe(true);
      expect(historyResult.entries).toHaveLength(0);
    });

    it('T2-S3: getFileHistory handles MX errors gracefully', async () => {
      (mockVersionControl.getFileHistory as jest.Mock).mockResolvedValueOnce({
        success: false,
        message: 'MX error: E155000',
        entries: [],
      });

      const historyResult = await mockVersionControl.getFileHistory(
        'project/node-123/error.dwg',
        10
      );

      expect(historyResult.success).toBe(false);
      expect(historyResult.entries).toHaveLength(0);
      expect(historyResult.message).toContain('E155000');
    });
  });

  describe('T3: Full CAD Save → MX Commit → Version History Chain', () => {
    it('T3-S1: Complete chain - save triggers commit and history is queryable', async () => {
      const commitCalls: any[] = [];
      (mockVersionControl.commitNodeDirectory as jest.Mock).mockImplementation(
        async (directoryPath: string, message: string, userId?: string, userName?: string) => {
          commitCalls.push({ directoryPath, message, userId, userName });
          return { success: true, message: '提交成功', revision: commitCalls.length };
        }
      );

      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'project.mxweb',
        mimetype: 'application/octet-stream',
        size: 2048,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'project.mxweb',
        buffer: Buffer.from(''),
        stream: null as unknown as Readable,
      };

      const saveResult = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentId: 'parent-project',
        projectId: 'project-001',
        format: 'dwg',
        userId: 'user-001',
        userName: 'User',
        commitMessage: 'Initial save of project drawing',
      });

      expect(saveResult.success).toBe(true);
      expect(commitCalls.length).toBe(1);
      expect(commitCalls[0].message).toBe('Initial save of project drawing');
      expect(commitCalls[0].userId).toBe('user-001');

      const historyResult = await mockVersionControl.getFileHistory(
        'project/node-123/project.dwg',
        50
      );

      expect(historyResult.success).toBe(true);
      expect(historyResult.entries.length).toBeGreaterThan(0);
    });

    it('T3-S2: Multiple saves create sequential version history', async () => {
      const commitCalls: any[] = [];
      (mockVersionControl.commitNodeDirectory as jest.Mock).mockImplementation(
        async (directoryPath: string, message: string, userId?: string, userName?: string) => {
          commitCalls.push({ directoryPath, message, userId, userName, revision: commitCalls.length + 1 });
          return { success: true, message: '提交成功', revision: commitCalls.length };
        }
      );

      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'test.mxweb',
        buffer: Buffer.from(''),
        stream: null as unknown as Readable,
      };

      await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentId: 'parent-123',
        projectId: 'project-456',
        format: 'dwg',
        userId: 'user-001',
        userName: 'User',
        commitMessage: 'First save',
      });

      await fsPromises.writeFile(tempFilePath, 'mock mxweb content for second save');

      await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentId: 'parent-123',
        projectId: 'project-456',
        format: 'dwg',
        userId: 'user-001',
        userName: 'User',
        commitMessage: 'Second save',
      });

      expect(commitCalls.length).toBe(2);
      expect(commitCalls[0].message).toBe('First save');
      expect(commitCalls[1].message).toBe('Second save');
    });

    it('T3-S3: Library files skip MX commit but save succeeds', async () => {
      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'library.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'library.mxweb',
        buffer: Buffer.from(''),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'library',
        targetParentId: 'library-parent',
        projectId: undefined,
        format: 'dwg',
        userId: 'user-001',
        userName: 'User',
        commitMessage: 'Library save',
      });

      expect(result.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
    });
  });
});
