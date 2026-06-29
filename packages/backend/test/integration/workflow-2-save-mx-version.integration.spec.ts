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
import * as path from 'path';
import { Readable } from 'stream';

// Mock the MX module
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

describe('Workflow 2: Save → MX Commit → Version History Integration Tests', () => {
  let saveAsService: SaveAsService;
  let mockVersionControl: jest.Mocked<IVersionControl>;
  let mockFileSystemService: jest.Mocked<FileSystemService>;
  let mockFileSystemNodeService: jest.Mocked<FileSystemNodeService>;
  let mockStorageManager: jest.Mocked<StorageManager>;
  let mockFileConversionService: jest.Mocked<FileConversionService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  const mockUserId = 'test-user-001';
  const mockUserName = 'Test User';
  const mockProjectId = 'test-project-001';
  const mockParentNodeId = 'parent-node-001';
  const mockFileId = 'file-node-001';
  const mockFileName = 'my-drawing.dwg';

  beforeEach(async () => {
    // Reset MX mocks
    installMx('mxCheckout', mxOk('Checked out'));
    installMx('mxAdd', mxOk('A  file'));
    installMx('mxCommit', mxOk('Committed revision 1.'));
    installMx('mxDelete', mxOk('D  file'));
    installMx('mxadminCreate', mxOk('Created'));
    installMx('mxImport', mxOk('Imported'));
    installMx('mxLog', mxOk(`<?xml version="1.0"?><log><logentry revision="1"><author>testuser</author><date>2024-01-01T10:00:00.000000Z</date><msg>{"type":"file_operation","message":"Save as: test.dwg","userName":"Test User"}</msg><paths><path action="A" kind="file">/test.dwg</path></paths></logentry></log>`));
    installMx('mxCat', mxOk('file content'));
    installMx('mxList', mxOk('file1.dwg\nfile2.dxf'));
    installMx('mxPropset', mxOk('property set'));
    installMx('mxUpdate', mxOk('Updated'));
    installMx('mxCleanup', mxOk('Cleanup'));

    // Setup mocks for all services
    mockVersionControl = {
      isReady: jest.fn().mockReturnValue(true),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      commitNodeDirectory: jest.fn().mockResolvedValue({ 
        success: true, 
        message: 'Commit successful', 
        revision: 1,
      }),
      commitFiles: jest.fn().mockResolvedValue({ success: true, message: 'Commit successful' }),
      commitWorkingCopy: jest.fn().mockResolvedValue({ success: true, message: 'Commit successful' }),
      deleteNodeDirectory: jest.fn().mockResolvedValue({ success: true, message: 'Delete successful' }),
      getFileHistory: jest.fn().mockResolvedValue({
        success: true,
        message: 'Get history successful',
        entries: [
          {
            revision: 1,
            author: 'testuser',
            date: new Date('2024-01-01T10:00:00.000000Z'),
            message: 'Save as: test.dwg',
            userName: 'Test User',
            paths: [{ action: 'A', kind: 'file', path: '/test.dwg' }],
          },
        ],
      }),
      listDirectoryAtRevision: jest.fn().mockResolvedValue({ success: true, message: 'List successful', files: [] }),
      getFileContentAtRevision: jest.fn().mockResolvedValue({ success: true, message: 'Get content successful', content: Buffer.from('mock mxweb content') }),

    } as unknown as jest.Mocked<IVersionControl>;

    mockFileSystemService = {
      getNode: jest.fn().mockResolvedValue({ 
        id: mockParentNodeId, 
        isFolder: true, 
        parentId: null,
        projectId: mockProjectId,
      }),
      getChildren: jest.fn().mockResolvedValue({ nodes: [] }),
      createFileNode: jest.fn().mockResolvedValue({ 
        id: mockFileId, 
        name: mockFileName, 
        isFolder: false,
        fileStatus: 'COMPLETED',
      }),
      updateNodePath: jest.fn().mockResolvedValue(undefined),
      deleteNode: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as jest.Mocked<FileSystemService>;

    mockFileSystemNodeService = {
      findById: jest.fn().mockResolvedValue({ id: mockFileId, name: mockFileName }),
      getMimeType: jest.fn().mockReturnValue('application/dwg'),
    } as unknown as jest.Mocked<FileSystemNodeService>;

    mockStorageManager = {
      allocateNodeStorage: jest.fn().mockResolvedValue({
        nodeDirectoryPath: path.join(process.cwd(), 'test-storage'),
        nodeDirectoryRelativePath: 'test-storage',
        fileRelativePath: 'test-storage/file.dwg.mxweb',
      }),
      getNodeDirectoryRelativePath: jest.fn(),
      getFullPath: jest.fn(),
    } as unknown as jest.Mocked<StorageManager>;

    mockFileConversionService = {
      convertFile: jest.fn().mockResolvedValue({ isOk: true, ret: { code: 0 } }),
    } as unknown as jest.Mocked<FileConversionService>;

    mockDatabaseService = {
      fileSystemNode: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
    } as unknown as jest.Mocked<DatabaseService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveAsService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('/test/path') } },
        { provide: FileSystemService, useValue: mockFileSystemService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: FileConversionService, useValue: mockFileConversionService },
        { provide: FileSystemPermissionService, useValue: { checkPermission: jest.fn().mockResolvedValue(true) } },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControl },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    saveAsService = module.get<SaveAsService>(SaveAsService);
  });

  describe('Scenario 1: Normal Workflow - Save MXWeb → Create Node → MX Commit', () => {
    it('should successfully save a CAD file and commit to MX', async () => {
      const mockFile = {
        path: path.join(process.cwd(), 'test-temp', 'test.mxweb'),
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1048576,
        fieldname: 'file',
        encoding: '7bit',
        destination: path.join(process.cwd(), 'test-temp'),
        filename: 'test.mxweb',
        buffer: Buffer.from('mock mxweb content'),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentNodeId: mockParentNodeId,
        projectId: mockProjectId,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Initial save of my drawing',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();

      // Verify file node was created
      expect(mockFileSystemService.createFileNode).toHaveBeenCalled();

      // Verify storage was allocated
      expect(mockStorageManager.allocateNodeStorage).toHaveBeenCalled();

      // Verify MX commit was called
      expect(mockVersionControl.commitNodeDirectory).toHaveBeenCalledWith(
        expect.any(String),
        'Initial save of my drawing',
        mockUserId,
        mockUserName,
      );
    });
  });

  describe('Scenario 2: Normal Workflow - Save to Personal Space', () => {
    it('should successfully save a file to personal space', async () => {
      const mockFile = {
        path: path.join(process.cwd(), 'test-temp', 'personal-drawing.mxweb'),
        originalname: 'personal-drawing.mxweb',
        mimetype: 'application/octet-stream',
        size: 524288,
        fieldname: 'file',
        encoding: '7bit',
        destination: path.join(process.cwd(), 'test-temp'),
        filename: 'personal-drawing.mxweb',
        buffer: Buffer.from('personal drawing content'),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'personal',
        targetParentNodeId: 'personal-parent-id',
        projectId: undefined,
        format: 'dxf',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Save personal work',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
      expect(mockVersionControl.commitNodeDirectory).toHaveBeenCalled();
    });
  });

  describe('Scenario 3: Edge Case - Empty File Save', () => {
    it('should handle empty file save gracefully', async () => {
      const mockEmptyFile = {
        path: path.join(process.cwd(), 'test-temp', 'empty.mxweb'),
        originalname: 'empty.mxweb',
        mimetype: 'application/octet-stream',
        size: 0,
        fieldname: 'file',
        encoding: '7bit',
        destination: path.join(process.cwd(), 'test-temp'),
        filename: 'empty.mxweb',
        buffer: Buffer.from(''),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockEmptyFile,
        targetType: 'project',
        targetParentNodeId: mockParentNodeId,
        projectId: mockProjectId,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Empty file save',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Scenario 4: Exception Case - MX Commit Failure', () => {
    it('should handle MX commit failure gracefully', async () => {
      mockVersionControl.commitNodeDirectory.mockRejectedValueOnce(new Error('MX commit failed: network error'));

      const mockFile = {
        path: path.join(process.cwd(), 'test-temp', 'test.mxweb'),
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1048576,
        fieldname: 'file',
        encoding: '7bit',
        destination: path.join(process.cwd(), 'test-temp'),
        filename: 'test.mxweb',
        buffer: Buffer.from('mock mxweb content'),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentNodeId: mockParentNodeId,
        projectId: mockProjectId,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Test commit failure',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Scenario 5: Version History - Retrieve File History', () => {
    it('should retrieve version history successfully', async () => {
      const historyResult = await mockVersionControl.getFileHistory(
        'test-project/file-node/drawing.dwg',
        50,
      );

      expect(historyResult.success).toBe(true);
      expect(historyResult.entries).toHaveLength(1);
      expect(historyResult.entries[0].revision).toBe(1);
      expect(historyResult.entries[0].author).toBe('testuser');
      expect(historyResult.entries[0].message).toBe('Save as: test.dwg');
    });
  });

  describe('Scenario 6: Version History - Multiple Commits', () => {
    it('should maintain proper version history with multiple saves', async () => {
      // First commit
      mockVersionControl.getFileHistory.mockResolvedValueOnce({
        success: true,
        message: 'Get history successful',
        entries: [
          {
            revision: 1,
            author: 'testuser',
            date: new Date('2024-01-01T10:00:00.000000Z'),
            message: 'First save',
            userName: 'Test User',
            paths: [{ action: 'A', kind: 'file', path: '/drawing.dwg' }],
          },
        ],
      });

      const history1 = await mockVersionControl.getFileHistory('test/drawing.dwg', 10);
      expect(history1.entries).toHaveLength(1);
      expect(history1.entries[0].revision).toBe(1);

      // Second commit
      mockVersionControl.getFileHistory.mockResolvedValueOnce({
        success: true,
        message: 'Get history successful',
        entries: [
          {
            revision: 2,
            author: 'testuser',
            date: new Date('2024-01-02T10:00:00.000000Z'),
            message: 'Second save',
            userName: 'Test User',
            paths: [{ action: 'M', kind: 'file', path: '/drawing.dwg' }],
          },
          {
            revision: 1,
            author: 'testuser',
            date: new Date('2024-01-01T10:00:00.000000Z'),
            message: 'First save',
            userName: 'Test User',
            paths: [{ action: 'A', kind: 'file', path: '/drawing.dwg' }],
          },
        ],
      });

      const history2 = await mockVersionControl.getFileHistory('test/drawing.dwg', 10);
      expect(history2.entries).toHaveLength(2);
      expect(history2.entries[0].revision).toBe(2);
      expect(history2.entries[1].revision).toBe(1);
    });
  });

  describe('Scenario 7: Edge Case - Library File Save (Skip MX)', () => {
    it('should skip MX commit for library files', async () => {
      const mockFile = {
        path: path.join(process.cwd(), 'test-temp', 'library-item.mxweb'),
        originalname: 'library-item.mxweb',
        mimetype: 'application/octet-stream',
        size: 2048,
        fieldname: 'file',
        encoding: '7bit',
        destination: path.join(process.cwd(), 'test-temp'),
        filename: 'library-item.mxweb',
        buffer: Buffer.from('library content'),
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'library',
        targetParentNodeId: 'library-parent',
        projectId: undefined,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Library item saved',
      });

      expect(result.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 9: Version Content - Retrieve File Content at Revision', () => {
    it('should retrieve file content for a specific revision', async () => {
      const contentResult = await mockVersionControl.getFileContentAtRevision(
        'test-project/file-node/drawing.dwg.mxweb',
        1,
      );

      expect(contentResult.success).toBe(true);
      expect(contentResult.content).toBeDefined();
      expect(contentResult.content.toString()).toBe('mock mxweb content');
    });
  });

  describe('Scenario 10: Edge Case - Large File Save (50MB)', () => {
    it('should handle large file save successfully', async () => {
      const largeFileSize = 52428800; // 50MB
      
      const mockLargeFile = {
        path: path.join(process.cwd(), 'test-temp', 'large-drawing.mxweb'),
        originalname: 'large-drawing.mxweb',
        mimetype: 'application/octet-stream',
        size: largeFileSize,
        fieldname: 'file',
        encoding: '7bit',
        destination: path.join(process.cwd(), 'test-temp'),
        filename: 'large-drawing.mxweb',
        buffer: Buffer.alloc(largeFileSize, 'x'), // 50MB buffer
        stream: null as unknown as Readable,
      };

      const result = await saveAsService.saveMxwebAs({
        file: mockLargeFile,
        targetType: 'project',
        targetParentNodeId: mockParentNodeId,
        projectId: mockProjectId,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Save large drawing',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
      expect(mockVersionControl.commitNodeDirectory).toHaveBeenCalled();
    });
  });
});
