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

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../src/database/database.service';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { StorageManager } from '../../src/storage-management/services/storage-manager.service';
import { FileConversionService } from '../../src/mxcad/conversion/file-conversion.service';
import { FileSystemPermissionService } from '../../src/file-system/file-permission/file-system-permission.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../src/version-control/interfaces/version-control.interface';
import { I_EXTERNAL_REF_FACADE } from '../../src/mxcad/external-ref/interfaces/ext-ref-facade.interface';
import { RestrictionEngine } from '../../src/vip/restriction-engine.service';
import { NodeMutationGuard } from '../../src/file-operations/node-mutation.guard';
import { NodeStatusTransitioner } from '../../src/file-system/file-status/node-status-transitioner';
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

const mockVersionControl: Partial<IVersionControl> = {
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

};

const tempDir = path.join(process.cwd(), 'temp-test-save-as-' + Date.now());
const tempFilePath = path.join(tempDir, 'test.mxweb');
const storageDir = path.join(tempDir, 'storage');

beforeAll(async () => {
  await fsPromises.mkdir(tempDir, { recursive: true });
  await fsPromises.mkdir(storageDir, { recursive: true });
  await fsPromises.writeFile(tempFilePath, 'mock mxweb content for save as');
});

afterAll(async () => {
  try {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  } catch {}
});

describe('CAD Save As → Node Duplication → Independent Version Chain Integration', () => {
  let saveAsService: SaveAsService;

  beforeEach(async () => {
    resetMxDefaults();
    jest.clearAllMocks();
    await fsPromises.writeFile(tempFilePath, 'mock mxweb content for save as').catch(() => {});

    const mockFileTreeService = {
      getNode: jest.fn().mockResolvedValue({ id: 'parent-123', nodeType: 'FOLDER', parentId: null }),
      getChildren: jest.fn().mockResolvedValue({ nodes: [] }),
      createFileNode: jest.fn().mockResolvedValue({ id: 'node-123', name: 'test.dwg', nodeType: 'FILE' }),
      updateNodePath: jest.fn().mockResolvedValue(undefined),
      getProjectId: jest.fn().mockResolvedValue('project-456'),
      deleteNode: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockFileSystemNodeService = {
      findById: jest.fn().mockResolvedValue({ id: 'node-123', name: 'test.dwg' }),
      getMimeType: jest.fn().mockReturnValue('application/dwg'),
    };

    const mockStorageManager = {
      allocateNodeStorage: jest.fn().mockResolvedValue({
        nodeDirectoryPath: storageDir,
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

    const mockExternalRefFacade = {
      handleExternalReferenceFile: jest.fn().mockResolvedValue(undefined),
      handleExternalReferenceImage: jest.fn().mockResolvedValue(undefined),
      updateAfterUpload: jest.fn().mockResolvedValue(undefined),
      readPreloadingData: jest.fn().mockResolvedValue(null),
      writePreloading: jest.fn().mockResolvedValue(true),
    };

    const mockRestrictionEngine = {
      checkQuota: jest.fn().mockResolvedValue(undefined),
      reserveConversionCountOrThrow: jest.fn().mockResolvedValue(undefined),
      releaseConversionCount: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveAsService,
        { provide: ConfigService, useValue: {} },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: FileConversionService, useValue: mockFileConversionService },
        { provide: FileSystemPermissionService, useValue: mockPermissionService },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControl },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: I_EXTERNAL_REF_FACADE, useValue: mockExternalRefFacade },
        { provide: RestrictionEngine, useValue: mockRestrictionEngine },
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

  describe('T1: Save As - Node Duplication', () => {
    it('T1-S1: Save As creates a new independent file node', async () => {
      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'original.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'original.mxweb',
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
        commitMessage: 'Save as copy of original drawing',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
    });
  });

  describe('T2: Independent Version Chain', () => {
    it('T2-S1: Save As creates new node but defers MX commit to first manual save', async () => {
      const mockFile: Express.Multer.File = {
        path: tempFilePath,
        originalname: 'new-file.mxweb',
        mimetype: 'application/octet-stream',
        size: 1024,
        fieldname: 'file',
        encoding: '7bit',
        destination: tempDir,
        filename: 'new-file.mxweb',
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
        commitMessage: 'Initial save as',
      });

      expect(result.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
    });

    it('T2-S2: Multiple save-as operations still skip MX commit', async () => {
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

      await fsPromises.writeFile(tempFilePath, 'mock mxweb content for second save');

      // Second save
      const result = await saveAsService.saveMxwebAs({
        file: mockFile,
        targetType: 'project',
        targetParentId: 'parent-123',
        projectId: 'project-456',
        format: 'dwg',
        userId: 'user-001',
        userName: 'User',
        commitMessage: 'Second version',
      });

      expect(result.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
      expect(mockVersionControl.commitFiles).not.toHaveBeenCalled();
    });
  });

  describe('T3: Format Conversion on Save As', () => {
    it('T3-S1: Save As can save in different formats', async () => {
      const formats: Array<'dwg' | 'dxf' | 'mxweb'> = ['dwg', 'dxf'];

      for (const format of formats) {
        await fsPromises.writeFile(tempFilePath, 'mock mxweb content for convert test').catch(() => {});
        const mockFile: Express.Multer.File = {
          path: tempFilePath,
          originalname: 'convert-test.mxweb',
          mimetype: 'application/octet-stream',
          size: 1024,
          fieldname: 'file',
          encoding: '7bit',
          destination: tempDir,
          filename: 'convert-test.mxweb',
          buffer: Buffer.from(''),
          stream: null as unknown as Readable,
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
    });
  });
});
