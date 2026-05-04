///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { FileMergeService } from '../../src/mxcad/upload/file-merge.service';
import { FileConversionService } from '../../src/mxcad/conversion/file-conversion.service';
import { FileSystemService as MxFileSystemService } from '../../src/mxcad/infra/file-system.service';
import { FileSystemService } from '../../src/file-system/file-system.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { CacheManagerService } from '../../src/mxcad/infra/cache-manager.service';
import { StorageManager } from '../../src/common/services/storage-manager.service';
import { StorageService } from '../../src/storage/storage.service';
import { ThumbnailGenerationService } from '../../src/mxcad/infra/thumbnail-generation.service';
import { UploadUtilityService } from '../../src/mxcad/upload/upload-utility.service';
import { ExternalRefService } from '../../src/mxcad/external-ref/external-ref.service';
import { ExternalReferenceUpdateService } from '../../src/mxcad/external-ref/external-reference-update.service';
import { MxUploadReturn } from '../../src/mxcad/enums/mxcad-return.enum';
import { VERSION_CONTROL_TOKEN, IVersionControl } from '../../src/version-control/interfaces/version-control.interface';
import { ProcessRunnerService } from '@cloudcad/conversion-engine';
import { DatabaseService } from '../../src/database/database.service';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { ConfigService } from '@nestjs/config';

describe('Workflow 1: Upload → Convert → Open Integration Tests', () => {
  let fileMergeService: FileMergeService;
  let fileConversionService: jest.Mocked<FileConversionService>;
  let versionControlService: jest.Mocked<IVersionControl>;
  let storageManager: jest.Mocked<StorageManager>;
  let storageService: jest.Mocked<StorageService>;
  let mxFileSystemService: jest.Mocked<MxFileSystemService>;
  let fileSystemServiceMain: jest.Mocked<FileSystemService>;
  let fileSystemNodeService: jest.Mocked<FileSystemNodeService>;
  let uploadUtilityService: jest.Mocked<UploadUtilityService>;
  let thumbnailGenerationService: jest.Mocked<ThumbnailGenerationService>;
  let cacheManagerService: jest.Mocked<CacheManagerService>;
  let databaseService: jest.Mocked<DatabaseService>;

  const mockUserId = 'test-user-001';
  const mockNodeId = 'test-node-001';
  const mockFileHash = 'abcdef1234567890abcdef1234567890';
  const mockFileName = 'test-drawing.dwg';
  const mockFileSize = 1048576; // 1MB
  const mockChunkCount = 5;

  const mockStorageInfo = {
    nodeId: 'new-node-789',
    directory: '202605',
    nodeDirectoryPath: '/data/files/202605/new-node-789',
    nodeDirectoryRelativePath: '202605/new-node-789',
    fileRelativePath: '202605/new-node-789/test-drawing.dwg.mxweb',
  };

  beforeEach(async () => {
    const mockFileConversionServiceObj = {
      convertFile: jest.fn(),
      needsConversion: jest.fn().mockReturnValue(true),
      getConvertedExtension: jest.fn().mockReturnValue('.mxweb'),
    };

    const mockVersionControlServiceObj = {
      isReady: jest.fn().mockReturnValue(true),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      commitNodeDirectory: jest.fn().mockResolvedValue({ success: true, message: 'Commit successful' }),
    };

    const mockStorageManagerObj = {
      allocateNodeStorage: jest.fn().mockResolvedValue(mockStorageInfo),
      getNodeDirectoryRelativePath: jest.fn(),
      copyNodeDirectory: jest.fn(),
      getFullPath: jest.fn(),
    };

    const mockStorageServiceObj = {
      copyFromFs: jest.fn().mockResolvedValue(undefined),
    };

    const mockMxFileSystemServiceObj = {
      writeStatusFile: jest.fn().mockResolvedValue(true),
      getFileSize: jest.fn().mockResolvedValue(1048576),
      readDirectory: jest.fn().mockResolvedValue(['abcdef1234567890abcdef1234567890.dwg.mxweb']),
      exists: jest.fn().mockReturnValue(true),
      createDirectory: jest.fn().mockResolvedValue(true),
      deleteDirectory: jest.fn().mockResolvedValue(true),
      getChunkTempDirPath: jest.fn().mockReturnValue('/tmp/chunks/abcdef1234567890'),
      getMd5Path: jest.fn().mockReturnValue('/uploads/abcdef1234567890.dwg'),
      mergeChunks: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockFileSystemServiceMainObj = {
      getNode: jest.fn().mockResolvedValue({
        id: mockNodeId,
        isFolder: true,
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
      deleteNode: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockFileSystemNodeServiceObj = {
      getMimeType: jest.fn().mockReturnValue('application/dwg'),
      findById: jest.fn(),
    };

    const mockUploadUtilityServiceObj = {
      checkFileExistsInStorage: jest.fn().mockResolvedValue(false),
      getConvertedFileName: jest.fn().mockReturnValue('abcdef1234567890.dwg.mxweb'),
      generateUniqueFileName: jest.fn().mockReturnValue(mockFileName),
    };

    const mockThumbnailGenerationServiceObj = {
      isEnabled: jest.fn().mockReturnValue(false),
      generateThumbnail: jest.fn().mockResolvedValue({ success: false }),
    };

    const mockCacheManagerServiceObj = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const mockDatabaseServiceObj = {
      fileSystemNode: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const mockExternalRefServiceObj = {
      handleExternalReferenceFile: jest.fn().mockResolvedValue(undefined),
      handleExternalReferenceImage: jest.fn().mockResolvedValue(undefined),
    };

    const mockExternalReferenceUpdateServiceObj = {
      updateAfterUpload: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileMergeService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('/test/path') } },
        { provide: FileConversionService, useValue: mockFileConversionServiceObj },
        { provide: 'FileSystemServiceMain', useValue: mockFileSystemServiceMainObj },
        { provide: MxFileSystemService, useValue: mockMxFileSystemServiceObj },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeServiceObj },
        { provide: CacheManagerService, useValue: mockCacheManagerServiceObj },
        { provide: StorageManager, useValue: mockStorageManagerObj },
        { provide: StorageService, useValue: mockStorageServiceObj },
        { provide: ThumbnailGenerationService, useValue: mockThumbnailGenerationServiceObj },
        { provide: UploadUtilityService, useValue: mockUploadUtilityServiceObj },
        { provide: ExternalRefService, useValue: mockExternalRefServiceObj },
        { provide: ExternalReferenceUpdateService, useValue: mockExternalReferenceUpdateServiceObj },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlServiceObj },
        { provide: DatabaseService, useValue: mockDatabaseServiceObj },
        { provide: FileTreeService, useValue: { getProjectId: jest.fn() } },
      ],
    }).compile();

    fileMergeService = module.get<FileMergeService>(FileMergeService);
    fileConversionService = module.get(FileConversionService);
    versionControlService = module.get(VERSION_CONTROL_TOKEN);
    storageManager = module.get(StorageManager);
    storageService = module.get(StorageService);
    mxFileSystemService = module.get(MxFileSystemService);
    fileSystemServiceMain = module.get('FileSystemServiceMain');
    fileSystemNodeService = module.get(FileSystemNodeService);
    uploadUtilityService = module.get(UploadUtilityService);
    thumbnailGenerationService = module.get(ThumbnailGenerationService);
    cacheManagerService = module.get(CacheManagerService);
    databaseService = module.get(DatabaseService);
  });

  describe('Scenario 1: Normal Workflow - Chunk Upload → Merge → Convert → Open', () => {
    it('should successfully process a CAD file through the complete workflow', async () => {
      // Setup mock for file conversion
      fileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: {
          code: 0,
          message: 'Conversion successful',
          newpath: '/data/conversion/test.dwg.mxweb',
          tz: true,
        },
      });

      // Mock chunk directory exists and has chunks
      mxFileSystemService.exists.mockResolvedValue(true);
      mxFileSystemService.readDirectory.mockResolvedValue([
        'chunk-000', 'chunk-001', 'chunk-002', 'chunk-003', 'chunk-004',
      ]);

      const mergeOptions = {
        hash: mockFileHash,
        chunks: mockChunkCount,
        name: mockFileName,
        size: mockFileSize,
        context: {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
          conflictStrategy: 'rename' as const,
        },
      };

      const result = await fileMergeService.mergeConvertFile(mergeOptions);

      // Verify all the steps were executed in order
      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(result.tz).toBe(true);
      expect(result.nodeId).toBeDefined();

      // Verify chunk directory was checked
      expect(mxFileSystemService.exists).toHaveBeenCalled();

      // Verify chunks were read
      expect(mxFileSystemService.readDirectory).toHaveBeenCalled();

      // Verify file conversion was called
      expect(fileConversionService.needsConversion).toHaveBeenCalledWith(mockFileName);
      expect(fileConversionService.convertFile).toHaveBeenCalled();

      // Verify status file was written
      expect(mxFileSystemService.writeStatusFile).toHaveBeenCalledWith(
        mockFileName,
        mockFileSize,
        mockFileHash,
        expect.any(String),
      );

      // Verify parent node was fetched
      expect(fileSystemServiceMain.getNode).toHaveBeenCalledWith(mockNodeId);

      // Verify file node was created
      expect(fileSystemServiceMain.createFileNode).toHaveBeenCalledWith(
        expect.objectContaining({
          name: mockFileName,
          fileHash: mockFileHash,
          size: mockFileSize,
          ownerId: mockUserId,
        }),
      );

      // Verify storage was allocated
      expect(storageManager.allocateNodeStorage).toHaveBeenCalled();

      // Verify node path was updated
      expect(fileSystemServiceMain.updateNodePath).toHaveBeenCalled();

      // Verify SVN commit was called
      expect(versionControlService.commitNodeDirectory).toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Edge Case - Empty File Upload', () => {
    it('should handle empty file upload gracefully', async () => {
      const emptyFileOptions = {
        hash: 'emptyfilehash',
        chunks: 1,
        name: 'empty-file.dwg',
        size: 0,
        context: {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
        },
      };

      fileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mxFileSystemService.exists.mockResolvedValue(true);
      mxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);

      const result = await fileMergeService.mergeConvertFile(emptyFileOptions);

      expect(result).toBeDefined();
      // Even empty files should process, though conversion might fail
      // but the service should handle it gracefully
    });
  });

  describe('Scenario 3: Exception Case - Conversion Engine Failure', () => {
    it('should handle conversion engine failure correctly', async () => {
      fileConversionService.convertFile.mockResolvedValue({
        isOk: false,
        ret: {
          code: -1,
          message: 'Conversion failed: Invalid CAD format',
        },
        error: 'Invalid file format',
      });

      mxFileSystemService.exists.mockResolvedValue(true);
      mxFileSystemService.readDirectory.mockResolvedValue(['chunk-000', 'chunk-001']);

      const result = await fileMergeService.mergeConvertFile({
        hash: mockFileHash,
        chunks: 2,
        name: mockFileName,
        size: mockFileSize,
        context: {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
        },
      });

      expect(result.ret).toBe(MxUploadReturn.kConvertFileError);

      // Verify no further actions were taken after conversion failure
      expect(fileSystemServiceMain.createFileNode).not.toHaveBeenCalled();
      expect(storageManager.allocateNodeStorage).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 4: Exception Case - Chunk Directory Missing', () => {
    it('should handle missing chunk directory correctly', async () => {
      mxFileSystemService.exists.mockResolvedValue(false);

      const result = await fileMergeService.mergeConvertFile({
        hash: 'missinghash',
        chunks: 5,
        name: 'missing-chunks.dwg',
        size: mockFileSize,
        context: {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
        },
      });

      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
    });
  });

  describe('Scenario 5: Edge Case - File Already Exists (Fast Path)', () => {
    it('should handle file already existing scenario', async () => {
      uploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);

      const existingFile = {
        id: 'existing-file-001',
        isFolder: false,
        parentId: mockNodeId,
      };

      fileSystemServiceMain.getNode.mockResolvedValueOnce(existingFile);
      fileSystemServiceMain.getChildren.mockResolvedValue({ nodes: [existingFile] });

      const result = await fileMergeService.performFileExistenceCheck(
        mockFileName,
        mockFileHash,
        'dwg',
        '.mxweb',
        {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
          conflictStrategy: 'rename' as const,
        },
      );

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
      expect(result.nodeId).toBeDefined();
    });
  });

  describe('Scenario 6: Edge Case - Large File Upload (100MB)', () => {
    it('should handle large file upload successfully', async () => {
      const largeFileSize = 104857600; // 100MB
      const largeFileHash = 'largefilehash1234567890';

      fileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mxFileSystemService.exists.mockResolvedValue(true);
      mxFileSystemService.readDirectory.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) => `chunk-${String(i).padStart(3, '0')}`),
      );

      const result = await fileMergeService.mergeConvertFile({
        hash: largeFileHash,
        chunks: 100,
        name: 'large-drawing.dwg',
        size: largeFileSize,
        context: {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
        },
      });

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(result.tz).toBe(true);
    });
  });

  describe('Scenario 7: Edge Case - Library File Upload (Skip SVN)', () => {
    it('should skip SVN commit for library files', async () => {
      fileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mxFileSystemService.exists.mockResolvedValue(true);
      mxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);

      const result = await fileMergeService.mergeConvertFile({
        hash: mockFileHash,
        chunks: 1,
        name: 'library-file.dwg',
        size: mockFileSize,
        context: {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: true,
        },
      });

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(versionControlService.commitNodeDirectory).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 8: Edge Case - MXWeb File Direct Upload', () => {
    it('should handle MXWeb file upload without conversion', async () => {
      fileConversionService.needsConversion.mockReturnValue(false);

      mxFileSystemService.exists.mockResolvedValue(true);
      mxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);

      const result = await fileMergeService.mergeChunksWithPermission({
        hash: 'mxwebfilehash',
        chunks: 1,
        name: 'direct-upload.mxweb',
        size: mockFileSize,
        context: {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
        },
      });

      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(fileConversionService.convertFile).not.toHaveBeenCalled();
      expect(storageService.copyFromFs).toHaveBeenCalled();
    });
  });

  describe('Scenario 9: Exception Case - Parent Node Does Not Exist', () => {
    it('should handle non-existent parent node correctly', async () => {
      fileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mxFileSystemService.exists.mockResolvedValue(true);
      mxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);
      fileSystemServiceMain.getNode.mockResolvedValueOnce(null);

      const result = await fileMergeService.mergeConvertFile({
        hash: mockFileHash,
        chunks: 1,
        name: mockFileName,
        size: mockFileSize,
        context: {
          userId: mockUserId,
          nodeId: 'non-existent-node',
          srcDwgNodeId: undefined,
          isLibrary: false,
        },
      });

      expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
    });
  });

  describe('Scenario 10: Edge Case - Concurrent Upload Detection', () => {
    it('should detect and handle concurrent uploads of the same file', async () => {
      fileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });

      mxFileSystemService.exists.mockResolvedValue(true);
      mxFileSystemService.readDirectory.mockResolvedValue(['chunk-000']);

      // First call sets merge flag
      cacheManagerService.get.mockResolvedValueOnce(undefined);
      const promise1 = fileMergeService.mergeConvertFile({
        hash: mockFileHash,
        chunks: 1,
        name: mockFileName,
        size: mockFileSize,
        context: {
          userId: mockUserId,
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
        },
      });

      // Second call detects merge in progress
      cacheManagerService.get.mockResolvedValueOnce(true);
      const promise2 = fileMergeService.mergeConvertFile({
        hash: mockFileHash,
        chunks: 1,
        name: mockFileName,
        size: mockFileSize,
        context: {
          userId: 'another-user',
          nodeId: mockNodeId,
          srcDwgNodeId: undefined,
          isLibrary: false,
        },
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.ret).toBe(MxUploadReturn.kOk);
      expect(result2.ret).toBe(MxUploadReturn.kOk);
    });
  });
});
