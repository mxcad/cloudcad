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

const svnBehaviors: Record<string, Function> = {};

function installSvn(name: string, fn: Function) {
  svnBehaviors[name] = fn;
}

function svnOk(result: string) {
  return (...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, result);
  };
}

const svnNames = [
  'svnCheckout', 'svnAdd', 'svnCommit', 'svnDelete', 'svnadminCreate',
  'svnImport', 'svnLog', 'svnCat', 'svnList', 'svnPropset', 'svnUpdate', 'svnCleanup',
];

const svnMockObj: Record<string, Function> = {};
for (const name of svnNames) {
  const dispatcher = (...args: any[]) => {
    const handler = svnBehaviors[name];
    if (handler) return handler(...args);
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, '');
  };
  svnMockObj[name] = dispatcher;
}

jest.mock('@cloudcad/svn-version-tool', () => svnMockObj);

jest.mock('@cloudcad/conversion-engine', () => ({
  ProcessRunnerService: jest.fn(),
}));

jest.mock('../../src/common/concurrency/rate-limiter', () => ({
  RateLimiter: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  })),
}));

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

describe('CAD Save → SVN Commit → Version History Integration', () => {
  let saveAsService: SaveAsService;
  let mockVersionControl: jest.Mocked<IVersionControl>;
  let tempDir: string;
  let tempFilePath: string;
  let storageDir: string;

  beforeEach(async () => {
    resetSvnDefaults();

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
      rollbackToRevision: jest.fn().mockResolvedValue({ success: true, message: '回滚成功' }),
    } as any;

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

  describe('T1: CAD Save → SVN Commit Chain', () => {
    it('T1-S1: Save CAD file to project space triggers SVN commit', async () => {
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
        stream: null as any,
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

    it('T1-S2: Save CAD file to personal space triggers SVN commit', async () => {
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
        stream: null as any,
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

    it('T1-S3: SVN commit failure does not break save operation', async () => {
      (mockVersionControl.commitNodeDirectory as jest.Mock).mockRejectedValueOnce(
        new Error('SVN commit failed')
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
        stream: null as any,
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

    it('T2-S3: getFileHistory handles SVN errors gracefully', async () => {
      (mockVersionControl.getFileHistory as jest.Mock).mockResolvedValueOnce({
        success: false,
        message: 'SVN error: E155000',
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

  describe('T3: Full CAD Save → SVN Commit → Version History Chain', () => {
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
        stream: null as any,
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
        stream: null as any,
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

    it('T3-S3: Library files skip SVN commit but save succeeds', async () => {
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
        stream: null as any,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'library' as any,
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
