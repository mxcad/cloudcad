///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { DrawingIngestService } from '../../src/mxcad/upload/drawing-ingest.service';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { FileSystemService as MxFileSystemService } from '../../src/mxcad/infra/file-system.service';
import { CacheManagerService } from '../../src/mxcad/infra/cache-manager.service';
import { StorageManager } from '../../src/storage-management/services/storage-manager.service';
import { ThumbnailGenerationService } from '../../src/mxcad/infra/thumbnail-generation.service';
import { UploadUtilityService } from '../../src/mxcad/upload/upload-utility.service';
import { FileConversionService } from '../../src/mxcad/conversion/file-conversion.service';
import { NodeStatusTransitioner } from '../../src/file-system/file-status/node-status-transitioner';
import { NodeTrashService } from '../../src/file-operations/node-trash.service';
import { RestrictionEngine } from '../../src/vip/restriction-engine.service';
import { NodeMutationGuard } from '../../src/file-operations/node-mutation.guard';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from '../../src/mxcad/enums/mxcad-return.enum';
import {
  VERSION_CONTROL_TOKEN,
  IVersionControl,
} from '../../src/version-control/interfaces/version-control.interface';
import { I_EXTERNAL_REF_FACADE } from '../../src/mxcad/external-ref/interfaces/ext-ref-facade.interface';
import { IStorageService } from '../../src/storage/interfaces/storage-service.interface';
import { FileNodeMaterializer } from '../../src/mxcad/upload/file-node-materializer.service';
import type { IngestTarget } from '../../src/mxcad/upload/drawing-ingest.service';
import * as path from 'path';
import * as fs from 'fs';

const TEST_UPLOAD_DIR = path.join(process.cwd(), 'test-uploads');
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data');

describe('Workflow 1: Upload → Convert → Open Integration Tests', () => {
  let service: DrawingIngestService;
  let mockFileTreeService: {
    getNode: jest.Mock;
    getChildren: jest.Mock;
    createFileNode: jest.Mock;
    updateFileStatus: jest.Mock;
    updateNodePath: jest.Mock;
    deleteNode: jest.Mock;
    getProjectId: jest.Mock;
    getAllProjectNodeIds: jest.Mock;
  };
  let mockFileConversionService: {
    convertFile: jest.Mock;
    needsConversion: jest.Mock;
    getConvertedExtension: jest.Mock;
  };
  let mockVersionControlService: jest.Mocked<IVersionControl>;
  let mockStorageManager: {
    allocateNodeStorage: jest.Mock;
    getNodeDirectoryRelativePath: jest.Mock;
    copyNodeDirectory: jest.Mock;
    getFullPath: jest.Mock;
  };
  let mockStorageService: { copyFromFs: jest.Mock };
  let mockMxFileSystemService: {
    writeStatusFile: jest.Mock;
    getFileSize: jest.Mock;
    readDirectory: jest.Mock;
    exists: jest.Mock;
    createDirectory: jest.Mock;
    deleteDirectory: jest.Mock;
    getChunkTempDirPath: jest.Mock;
    getMd5Path: jest.Mock;
    mergeChunks: jest.Mock;
  };
  let mockFileSystemNodeService: {
    getMimeType: jest.Mock;
    findById: jest.Mock;
  };
  let mockUploadUtilityService: {
    checkFileExistsInStorage: jest.Mock;
    getConvertedFileName: jest.Mock;
    generateUniqueFileName: jest.Mock;
  };
  let mockThumbnailGenerationService: {
    isEnabled: jest.Mock;
    generateThumbnail: jest.Mock;
  };
  let mockCacheManagerService: {
    get: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
  };
  let mockNodeTrashService: { deleteNode: jest.Mock };

  const mockUserId = 'test-user-001';
  const mockNodeId = 'test-node-001';
  const mockFileHash = 'abcdef1234567890abcdef1234567890';
  const mockFileName = 'test-drawing.dwg';
  const mockFileSize = 1048576; // 1MB
  const mockChunkCount = 5;

  const makeContext = (overrides: Record<string, unknown> = {}) => ({
    userId: mockUserId,
    nodeId: mockNodeId,
    userRole: 'user',
    srcDwgNodeId: undefined,
    isLibrary: false,
    ...overrides,
  });

  const toTarget = (ctx: ReturnType<typeof makeContext>): IngestTarget => ({
    userId: ctx.userId,
    parentNodeId: ctx.nodeId,
    ownerId: ctx.userId,
    srcDwgNodeId: ctx.srcDwgNodeId as string | undefined,
    isImage: (ctx as { isImage?: boolean }).isImage,
    conflictStrategy: (
      ctx as { conflictStrategy?: 'skip' | 'overwrite' | 'rename' }
    ).conflictStrategy,
    isLibrary: ctx.isLibrary,
  });

  beforeEach(async () => {
    // Prepare real temp directories used by DrawingIngestService fs operations
    fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_UPLOAD_DIR, { recursive: true });
    fs.mkdirSync(path.join(TEST_DATA_DIR, '202605', 'new-node-789'), {
      recursive: true,
    });
    // Seed the converted mxweb output (upload path scans for files starting with the hash)
    fs.writeFileSync(
      path.join(TEST_UPLOAD_DIR, `${mockFileHash}.dwg.mxweb`),
      'mock mxweb content'
    );

    mockFileConversionService = {
      convertFile: jest.fn(),
      needsConversion: jest.fn().mockReturnValue(true),
      getConvertedExtension: jest.fn().mockReturnValue('.mxweb'),
    };

    mockVersionControlService = {
      isReady: jest.fn().mockReturnValue(true),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      commitNodeDirectory: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Commit successful' }),
    } as unknown as jest.Mocked<IVersionControl>;

    mockStorageManager = {
      allocateNodeStorage: jest.fn().mockResolvedValue({
        nodeId: 'new-node-789',
        directory: '202605',
        nodeDirectoryPath: path.join(TEST_DATA_DIR, '202605', 'new-node-789'),
        nodeDirectoryRelativePath: '202605/new-node-789',
        fileRelativePath: '202605/new-node-789/test-drawing.dwg.mxweb',
      }),
      getNodeDirectoryRelativePath: jest.fn(),
      copyNodeDirectory: jest.fn(),
      getFullPath: jest.fn(),
    };

    mockStorageService = {
      copyFromFs: jest.fn().mockResolvedValue(undefined),
    };

    mockMxFileSystemService = {
      writeStatusFile: jest.fn().mockResolvedValue(true),
      getFileSize: jest.fn().mockResolvedValue(mockFileSize),
      readDirectory: jest
        .fn()
        .mockResolvedValue(['abcdef1234567890abcdef1234567890.dwg.mxweb']),
      exists: jest.fn().mockResolvedValue(true),
      createDirectory: jest.fn().mockResolvedValue(true),
      deleteDirectory: jest.fn().mockResolvedValue(true),
      getChunkTempDirPath: jest
        .fn()
        .mockReturnValue(
          path.join(TEST_UPLOAD_DIR, 'chunks', 'abcdef1234567890')
        ),
      getMd5Path: jest
        .fn()
        .mockReturnValue(path.join(TEST_UPLOAD_DIR, 'abcdef1234567890.dwg')),
      mergeChunks: jest.fn().mockResolvedValue({ success: true }),
    };

    mockFileTreeService = {
      getNode: jest.fn().mockResolvedValue({
        id: mockNodeId,
        nodeType: 'FOLDER',
        parentId: 'project-root-001',
      }),
      createFileNode: jest.fn().mockResolvedValue({
        id: 'new-file-node-001',
        name: mockFileName,
        fileHash: mockFileHash,
        size: mockFileSize,
        mimeType: 'application/dwg',
        extension: '.dwg',
        parentId: mockNodeId,
        ownerId: mockUserId,
        fileStatus: 'COMPLETED',
      }),
      updateNodePath: jest.fn().mockResolvedValue(undefined),
      getChildren: jest.fn().mockResolvedValue({ nodes: [] }),
      updateFileStatus: jest.fn().mockResolvedValue(undefined),
      deleteNode: jest.fn().mockResolvedValue({ success: true }),
      getProjectId: jest.fn().mockResolvedValue('project-root-001'),
      getAllProjectNodeIds: jest.fn().mockResolvedValue([]),
    };

    mockFileSystemNodeService = {
      getMimeType: jest.fn().mockReturnValue('application/dwg'),
      findById: jest.fn(),
    };

    mockUploadUtilityService = {
      checkFileExistsInStorage: jest.fn().mockResolvedValue(false),
      getConvertedFileName: jest
        .fn()
        .mockReturnValue('abcdef1234567890.dwg.mxweb'),
      generateUniqueFileName: jest.fn().mockResolvedValue(mockFileName),
    };

    mockThumbnailGenerationService = {
      isEnabled: jest.fn().mockReturnValue(false),
      generateThumbnail: jest.fn().mockResolvedValue({ success: false }),
    };

    mockCacheManagerService = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockNodeTrashService = {
      deleteNode: jest.fn().mockResolvedValue({ message: 'deleted' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DrawingIngestService,
        FileNodeMaterializer,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'mxcadUploadPath') return TEST_UPLOAD_DIR;
              if (key === 'filesDataPath') return TEST_DATA_DIR;
              return '/test/path';
            }),
          },
        },
        { provide: MxFileSystemService, useValue: mockMxFileSystemService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: NodeTrashService, useValue: mockNodeTrashService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: CacheManagerService, useValue: mockCacheManagerService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
        { provide: FileConversionService, useValue: mockFileConversionService },
        {
          provide: I_EXTERNAL_REF_FACADE,
          useValue: {
            handleExternalReferenceFile: jest.fn().mockResolvedValue(undefined),
            handleExternalReferenceImage: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        { provide: UploadUtilityService, useValue: mockUploadUtilityService },
        {
          provide: ThumbnailGenerationService,
          useValue: mockThumbnailGenerationService,
        },
        { provide: IStorageService, useValue: mockStorageService },
        {
          provide: RestrictionEngine,
          useValue: {
            checkQuota: jest.fn().mockResolvedValue(undefined),
            reserveConversionCountOrThrow: jest
              .fn()
              .mockResolvedValue(undefined),
            releaseConversionCount: jest.fn().mockResolvedValue(undefined),
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
          provide: NodeStatusTransitioner,
          useValue: {
            transition: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DrawingIngestService>(DrawingIngestService);
  });

  afterAll(() => {
    try {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Scenario 1: Normal Workflow - Chunk Upload → Merge → Convert → Open', () => {
    it('should successfully process a CAD file through the complete workflow', async () => {
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: {
          code: 0,
          message: 'Conversion successful',
          newpath: '/data/conversion/test.dwg.mxweb',
          tz: true,
        },
      });

      mockMxFileSystemService.exists.mockResolvedValue(true);
      mockMxFileSystemService.readDirectory.mockResolvedValue([
        'chunk-000',
        'chunk-001',
        'chunk-002',
        'chunk-003',
        'chunk-004',
      ]);

      const result = await service.ingest(
        {
          kind: 'chunks',
          hash: mockFileHash,
          chunkCount: mockChunkCount,
          name: mockFileName,
          size: mockFileSize,
        },
        toTarget(makeContext({ conflictStrategy: 'rename' as const }))
      );

      // Verify all the steps were executed in order
      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(result.tz).toBe(true);
      expect(result.nodeId).toBeDefined();

      // Verify chunk directory was checked
      expect(mockMxFileSystemService.exists).toHaveBeenCalled();

      // Verify chunks were read
      expect(mockMxFileSystemService.readDirectory).toHaveBeenCalled();

      // Verify file conversion was called
      expect(mockFileConversionService.convertFile).toHaveBeenCalled();

      // Verify status file was written
      expect(mockMxFileSystemService.writeStatusFile).toHaveBeenCalledWith(
        mockFileName,
        mockFileSize,
        mockFileHash,
        expect.any(String)
      );

      // Verify parent node was fetched
      expect(mockFileTreeService.getNode).toHaveBeenCalledWith(mockNodeId);

      // Verify file node was created
      expect(mockFileTreeService.createFileNode).toHaveBeenCalledWith(
        expect.objectContaining({
          name: mockFileName,
          fileHash: mockFileHash,
          size: mockFileSize,
          ownerId: mockUserId,
        })
      );

      // Verify storage was allocated
      expect(mockStorageManager.allocateNodeStorage).toHaveBeenCalled();

      // Verify node path was updated
      expect(mockFileTreeService.updateNodePath).toHaveBeenCalled();

      // MX 即时提交已跳过：版本历史通过虚拟 r0 注入
      expect(
        mockVersionControlService.commitNodeDirectory
      ).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Edge Case - Empty File Upload', () => {
    it('should handle empty file upload gracefully', async () => {
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mockMxFileSystemService.exists.mockResolvedValue(true);
      mockMxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);

      const result = await service.ingest(
        {
          kind: 'chunks',
          hash: 'emptyfilehash',
          chunkCount: 1,
          name: 'empty-file.dwg',
          size: 0,
        },
        toTarget(makeContext())
      );

      expect(result).toBeDefined();
      expect(result.ret).toBe(MxUploadReturn.kOk);
    });
  });

  describe('Scenario 3: Exception Case - Conversion Engine Failure', () => {
    it('should handle conversion engine failure correctly', async () => {
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: false,
        ret: {
          code: -1,
          message: 'Conversion failed: Invalid CAD format',
        },
        error: 'Invalid file format',
      });

      mockMxFileSystemService.exists.mockResolvedValue(true);
      mockMxFileSystemService.readDirectory.mockResolvedValue([
        'chunk-000',
        'chunk-001',
      ]);

      const result = await service.ingest(
        {
          kind: 'chunks',
          hash: mockFileHash,
          chunkCount: 2,
          name: mockFileName,
          size: mockFileSize,
        },
        toTarget(makeContext())
      );

      expect(result.ret).toBe(MxUploadReturn.kConvertFileError);

      // Node was created first (UPLOADING), then deleted on conversion failure
      expect(mockFileTreeService.createFileNode).toHaveBeenCalled();
      expect(mockNodeTrashService.deleteNode).toHaveBeenCalled();

      // No storage allocation should happen after conversion failure
      expect(mockStorageManager.allocateNodeStorage).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 4: Exception Case - Chunk Directory Missing', () => {
    it('should handle missing chunk directory correctly', async () => {
      mockMxFileSystemService.exists.mockResolvedValue(false);

      const result = await service.ingest(
        {
          kind: 'chunks',
          hash: 'missinghash',
          chunkCount: 5,
          name: 'missing-chunks.dwg',
          size: mockFileSize,
        },
        toTarget(makeContext())
      );

      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
    });
  });

  describe('Scenario 5: Edge Case - File Already Exists (Fast Path)', () => {
    it('should handle file already existing scenario', async () => {
      mockMxFileSystemService.exists.mockResolvedValue(true);

      const result = await service.checkExist(
        mockFileHash,
        mockFileName,
        toTarget(makeContext({ conflictStrategy: 'rename' as const }))
      );

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(result.nodeId).toBeDefined();
      expect(mockFileTreeService.createFileNode).toHaveBeenCalled();
    });
  });

  describe('Scenario 6: Edge Case - Large File Upload (100MB)', () => {
    it('should handle large file upload successfully', async () => {
      const largeFileSize = 104857600; // 100MB
      const largeFileHash = 'largefilehash1234567890';

      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mockMxFileSystemService.exists.mockResolvedValue(true);
      mockMxFileSystemService.readDirectory.mockResolvedValue(
        Array.from(
          { length: 100 },
          (_, i) => `chunk-${String(i).padStart(3, '0')}`
        )
      );

      const result = await service.ingest(
        {
          kind: 'chunks',
          hash: largeFileHash,
          chunkCount: 100,
          name: 'large-drawing.dwg',
          size: largeFileSize,
        },
        toTarget(makeContext())
      );

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(result.tz).toBe(true);
    });
  });

  describe('Scenario 7: Edge Case - Library File Upload (Skip MX)', () => {
    it('should skip MX commit for library files', async () => {
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mockMxFileSystemService.exists.mockResolvedValue(true);
      mockMxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);

      const result = await service.ingest(
        {
          kind: 'chunks',
          hash: mockFileHash,
          chunkCount: 1,
          name: 'library-file.dwg',
          size: mockFileSize,
        },
        toTarget(makeContext({ isLibrary: true }))
      );

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(
        mockVersionControlService.commitNodeDirectory
      ).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 8: Edge Case - MXWeb File Direct Upload', () => {
    it('should handle MXWeb file upload without conversion', async () => {
      mockMxFileSystemService.exists.mockResolvedValue(true);
      mockMxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);

      const result = await service.ingest(
        {
          kind: 'chunks',
          hash: 'mxwebfilehash',
          chunkCount: 1,
          name: 'direct-upload.mxweb',
          size: mockFileSize,
        },
        toTarget(makeContext())
      );

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(mockFileConversionService.convertFile).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 9: Exception Case - Parent Node Does Not Exist', () => {
    it('should handle non-existent parent node correctly', async () => {
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mockMxFileSystemService.exists.mockResolvedValue(true);
      mockMxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);
      mockFileTreeService.getNode.mockResolvedValueOnce(null);

      const result = await service.ingest(
        {
          kind: 'chunks',
          hash: mockFileHash,
          chunkCount: 1,
          name: mockFileName,
          size: mockFileSize,
        },
        toTarget(makeContext({ nodeId: 'non-existent-node' }))
      );

      expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
    });
  });

  describe('Scenario 10: Edge Case - Concurrent Upload Detection', () => {
    it('should detect and handle concurrent uploads of the same file', async () => {
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mockMxFileSystemService.exists.mockResolvedValue(true);
      mockMxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);

      // First call sets merge flag
      mockCacheManagerService.get.mockResolvedValueOnce(undefined);
      const promise1 = service.ingest(
        {
          kind: 'chunks',
          hash: mockFileHash,
          chunkCount: 1,
          name: mockFileName,
          size: mockFileSize,
        },
        toTarget(makeContext())
      );

      // Second call detects merge in progress
      mockCacheManagerService.get.mockResolvedValueOnce(true);
      const promise2 = service.ingest(
        {
          kind: 'chunks',
          hash: mockFileHash,
          chunkCount: 1,
          name: mockFileName,
          size: mockFileSize,
        },
        toTarget(makeContext({ userId: 'another-user' }))
      );

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.ret).toBe(MxUploadReturn.kOk);
      expect(result2.ret).toBe(MxUploadReturn.kOk);
    });
  });
});
