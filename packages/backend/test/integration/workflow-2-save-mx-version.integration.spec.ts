///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../src/database/database.service';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { StorageManager } from '../../src/storage-management/services/storage-manager.service';
import { FileSystemPermissionService } from '../../src/file-system/file-permission/file-system-permission.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../src/version-control/interfaces/version-control.interface';
import { SaveAsService } from '../../src/mxcad/save/save-as.service';
import { I_EXTERNAL_REF_FACADE } from '../../src/mxcad/external-ref/interfaces/ext-ref-facade.interface';
import { RestrictionEngine } from '../../src/vip/restriction-engine.service';
import { NodeMutationGuard } from '../../src/file-operations/node-mutation.guard';
import { NodeStatusTransitioner } from '../../src/file-system/file-status/node-status-transitioner';
import * as path from 'path';
import * as fs from 'fs';
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

const TEST_TEMP_DIR = path.join(process.cwd(), 'test-temp');

function ensureTestFile(file: Express.Multer.File) {
  if (!file || !file.path) return;
  fs.mkdirSync(path.dirname(file.path), { recursive: true });
  fs.writeFileSync(file.path, file.buffer ?? Buffer.alloc(0));
}

describe('Workflow 2: Save → MX Commit → Version History Integration Tests', () => {
  let saveAsService: SaveAsService;
  let mockVersionControl: jest.Mocked<IVersionControl>;
  let mockFileTreeService: jest.Mocked<FileTreeService>;
  let mockFileSystemNodeService: jest.Mocked<FileSystemNodeService>;
  let mockStorageManager: jest.Mocked<StorageManager>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  const mockUserId = 'test-user-001';
  const mockUserName = 'Test User';
  const mockProjectId = 'test-project-001';
  const mockParentNodeId = 'parent-node-001';
  const mockFileId = 'file-node-001';
  const mockFileName = 'my-drawing.dwg';

  beforeEach(async () => {
    fs.mkdirSync(path.join(process.cwd(), 'test-storage'), { recursive: true });

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

    mockFileTreeService = {
      getNode: jest.fn().mockResolvedValue({ 
        id: mockParentNodeId, 
        nodeType: 'FOLDER', 
        parentId: null,
        projectId: mockProjectId,
      }),
      getChildren: jest.fn().mockResolvedValue({ nodes: [] }),
      createFileNode: jest.fn().mockResolvedValue({ 
        id: mockFileId, 
        name: mockFileName, 
        nodeType: 'FILE',
        fileStatus: 'COMPLETED',
      }),
      updateNodePath: jest.fn().mockResolvedValue(undefined),
      deleteNode: jest.fn().mockResolvedValue({ success: true }),
      getProjectId: jest.fn().mockResolvedValue(mockProjectId),
      getAllProjectNodeIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<FileTreeService>;

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
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: FileSystemPermissionService, useValue: { checkPermission: jest.fn().mockResolvedValue(true) } },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControl },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: I_EXTERNAL_REF_FACADE, useValue: {
            handleExternalReferenceFile: jest.fn().mockResolvedValue(undefined),
            handleExternalReferenceImage: jest.fn().mockResolvedValue(undefined),
            readPreloadingData: jest.fn().mockResolvedValue(null),
            writePreloading: jest.fn().mockResolvedValue(undefined),
        } },
        { provide: RestrictionEngine, useValue: { checkQuota: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: NodeMutationGuard,
          useValue: {
            assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
            assertProjectQuota: jest.fn().mockResolvedValue(undefined),
            assertByteQuota: jest.fn().mockResolvedValue(undefined),
            invalidateQuotaAfterMutation: jest.fn().mockResolvedValue(undefined),
            resolveProjectContext: jest.fn(),
          },
        },

      ],
    }).compile();

    saveAsService = module.get<SaveAsService>(SaveAsService);
  });

  afterAll(() => {
    try {
      fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Scenario 1: Normal Workflow - Save MXWeb → Create Node (MX Commit Skipped)', () => {
    it('should successfully save a CAD file as a new node', async () => {
      const mockFile = {
        path: path.join(TEST_TEMP_DIR, 'test.mxweb'),
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1048576,
        fieldname: 'file',
        encoding: '7bit',
        destination: TEST_TEMP_DIR,
        filename: 'test.mxweb',
        buffer: Buffer.from('mock mxweb content'),
        stream: null as unknown as Readable,
      } as Express.Multer.File;

      ensureTestFile(mockFile);

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentId: mockParentNodeId,
        projectId: mockProjectId,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Initial save of my drawing',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();

      // Verify file node was created
      expect(mockFileTreeService.createFileNode).toHaveBeenCalled();

      // Verify storage was allocated
      expect(mockStorageManager.allocateNodeStorage).toHaveBeenCalled();

      // MX initial commit is skipped (version history injected as virtual r0)
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Normal Workflow - Save to Personal Space', () => {
    it('should successfully save a file to personal space', async () => {
      const mockFile = {
        path: path.join(TEST_TEMP_DIR, 'personal-drawing.mxweb'),
        originalname: 'personal-drawing.mxweb',
        mimetype: 'application/octet-stream',
        size: 524288,
        fieldname: 'file',
        encoding: '7bit',
        destination: TEST_TEMP_DIR,
        filename: 'personal-drawing.mxweb',
        buffer: Buffer.from('personal drawing content'),
        stream: null as unknown as Readable,
      } as Express.Multer.File;

      ensureTestFile(mockFile);

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'personal',
        targetParentId: 'personal-parent-id',
        projectId: undefined,
        format: 'dxf',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Save personal work',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
      expect(mockFileTreeService.createFileNode).toHaveBeenCalled();
    });
  });

  describe('Scenario 3: Edge Case - Empty File Save', () => {
    it('should handle empty file save gracefully', async () => {
      const mockEmptyFile = {
        path: path.join(TEST_TEMP_DIR, 'empty.mxweb'),
        originalname: 'empty.mxweb',
        mimetype: 'application/octet-stream',
        size: 0,
        fieldname: 'file',
        encoding: '7bit',
        destination: TEST_TEMP_DIR,
        filename: 'empty.mxweb',
        buffer: Buffer.from(''),
        stream: null as unknown as Readable,
      } as Express.Multer.File;

      ensureTestFile(mockEmptyFile);

      const result = await saveAsService.saveMxwebAs({
        file: mockEmptyFile,
        targetType: 'project',
        targetParentId: mockParentNodeId,
        projectId: mockProjectId,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Empty file save',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Scenario 4: Exception Case - MX Version Control Unavailable', () => {
    it('should still save successfully when MX is not ready (commit skipped)', async () => {
      mockVersionControl.isReady.mockReturnValue(false);

      const mockFile = {
        path: path.join(TEST_TEMP_DIR, 'test.mxweb'),
        originalname: 'test.mxweb',
        mimetype: 'application/octet-stream',
        size: 1048576,
        fieldname: 'file',
        encoding: '7bit',
        destination: TEST_TEMP_DIR,
        filename: 'test.mxweb',
        buffer: Buffer.from('mock mxweb content'),
        stream: null as unknown as Readable,
      } as Express.Multer.File;

      ensureTestFile(mockFile);

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentId: mockParentNodeId,
        projectId: mockProjectId,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Test commit failure',
      });

      expect(result.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
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
        totalCount: 1,
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
        totalCount: 2,
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
        path: path.join(TEST_TEMP_DIR, 'library-item.mxweb'),
        originalname: 'library-item.mxweb',
        mimetype: 'application/octet-stream',
        size: 2048,
        fieldname: 'file',
        encoding: '7bit',
        destination: TEST_TEMP_DIR,
        filename: 'library-item.mxweb',
        buffer: Buffer.from('library content'),
        stream: null as unknown as Readable,
      } as Express.Multer.File;

      ensureTestFile(mockFile);

      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'library',
        targetParentId: 'library-parent',
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
        path: path.join(TEST_TEMP_DIR, 'large-drawing.mxweb'),
        originalname: 'large-drawing.mxweb',
        mimetype: 'application/octet-stream',
        size: largeFileSize,
        fieldname: 'file',
        encoding: '7bit',
        destination: TEST_TEMP_DIR,
        filename: 'large-drawing.mxweb',
        buffer: Buffer.alloc(largeFileSize, 'x'), // 50MB buffer
        stream: null as unknown as Readable,
      } as Express.Multer.File;

      ensureTestFile(mockLargeFile);

      const result = await saveAsService.saveMxwebAs({
        file: mockLargeFile,
        targetType: 'project',
        targetParentId: mockParentNodeId,
        projectId: mockProjectId,
        format: 'dwg',
        userId: mockUserId,
        userName: mockUserName,
        commitMessage: 'Save large drawing',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
      expect(mockFileTreeService.createFileNode).toHaveBeenCalled();
    });
  });
});
