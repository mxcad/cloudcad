///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { SaveAsService } from './save-as.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { VERSION_CONTROL_TOKEN } from '../../version-control/interfaces/version-control.interface';
import { DatabaseService } from '../../database/database.service';
import { ConfigService } from '@nestjs/config';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';
import { I_EXTERNAL_REF_FACADE } from '../external-ref/interfaces/ext-ref-facade.interface';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    statSync: jest.fn().mockReturnValue({ size: 1024 }),
    promises: {
      ...actual.promises,
      copyFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(Buffer.from('test mxweb content')),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

describe('SaveAsService', () => {
  let service: SaveAsService;

  const mockFileTreeService = {
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

  const mockConfigService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  const mockPrisma = {
    fileSystemNode: {
      update: jest
        .fn()
        .mockResolvedValue({ id: 'node1', size: 1024, fileHash: 'abc123' }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });
    (fs.promises.copyFile as jest.Mock).mockResolvedValue(undefined);
    (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.promises.readFile as jest.Mock).mockResolvedValue(
      Buffer.from('test mxweb content')
    );
    (fs.promises.unlink as jest.Mock).mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveAsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: FileConversionService, useValue: mockFileConversionService },
        {
          provide: FileSystemPermissionService,
          useValue: mockPermissionService,
        },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
        { provide: DatabaseService, useValue: mockPrisma },
        {
          provide: RestrictionEngine,
          useValue: {
            checkQuota: jest.fn().mockResolvedValue(undefined),
            incrementConversionCount: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NodeMutationGuard,
          useValue: {
            assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
            assertProjectQuota: jest.fn().mockResolvedValue(undefined),
            assertByteQuota: jest.fn().mockResolvedValue(undefined),
            invalidateQuotaAfterMutation: jest
              .fn()
              .mockResolvedValue(undefined),
            resolveProjectContext: jest.fn(),
          },
        },
        {
          provide: I_EXTERNAL_REF_FACADE,
          useValue: {
            readPreloadingData: jest.fn().mockResolvedValue(undefined),
            writePreloading: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<SaveAsService>(SaveAsService);
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
      } as Express.Multer.File;

      const mockParentNode = {
        id: 'parent1',
        nodeType: 'FOLDER',
      };

      const mockNewNode = {
        id: 'node1',
      };

      mockFileTreeService.getNode.mockResolvedValue(mockParentNode);
      mockFileTreeService.createFileNode.mockResolvedValue(mockNewNode);
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
      mockFileTreeService.getChildren.mockResolvedValue({ nodes: [] });

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
        file: null as unknown as Express.Multer.File,
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
      } as Express.Multer.File;

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
      } as Express.Multer.File;

      mockFileTreeService.getNode.mockResolvedValue(null);

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
      } as Express.Multer.File;

      const mockParentNode = {
        id: 'parent1',
        nodeType: 'FILE',
      };

      mockFileTreeService.getNode.mockResolvedValue(mockParentNode);

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
  });
});
