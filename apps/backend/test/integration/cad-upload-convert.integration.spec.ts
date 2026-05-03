import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FileConversionUploadService } from '../../../src/mxcad/upload/file-conversion-upload.service';
import { FileConversionService } from '../../../src/mxcad/conversion/file-conversion.service';
import { FileSystemService as MxFileSystemService } from '../../../src/mxcad/infra/file-system.service';
import { FileSystemService } from '../../../src/file-system/file-system.service';
import { FileSystemNodeService } from '../../../src/mxcad/node/filesystem-node.service';
import { CacheManagerService } from '../../../src/mxcad/infra/cache-manager.service';
import { StorageManager } from '../../../src/common/services/storage-manager.service';
import { StorageService } from '../../../src/storage/storage.service';
import { ThumbnailGenerationService } from '../../../src/mxcad/infra/thumbnail-generation.service';
import { UploadUtilityService } from '../../../src/mxcad/upload/upload-utility.service';
import { FileMergeService } from '../../../src/mxcad/upload/file-merge.service';
import { ExternalRefService } from '../../../src/mxcad/external-ref/external-ref.service';
import { ExternalReferenceUpdateService } from '../../../src/mxcad/external-ref/external-reference-update.service';
import { MxUploadReturn } from '../../../src/mxcad/enums/mxcad-return.enum';
import { VERSION_CONTROL_TOKEN, IVersionControl } from '../../../src/version-control/interfaces/version-control.interface';
import { ProcessRunnerService } from '@cloudcad/conversion-engine';
import { PrismaService } from '../../../src/database/database.service';
import { FileTreeService } from '../../../src/file-system/file-tree/file-tree.service';

describe('FileConversionUploadService - CAD Upload→Convert→Open Integration', () => {
  let service: FileConversionUploadService;
  let fileConversionService: jest.Mocked<FileConversionService>;
  let versionControlService: jest.Mocked<IVersionControl>;
  let storageManager: jest.Mocked<StorageManager>;
  let storageService: jest.Mocked<StorageService>;
  let fileSystemService: jest.Mocked<MxFileSystemService>;
  let fileSystemServiceMain: jest.Mocked<FileSystemService>;
  let fileSystemNodeService: jest.Mocked<FileSystemNodeService>;
  let uploadUtilityService: jest.Mocked<UploadUtilityService>;
  let thumbnailGenerationService: jest.Mocked<ThumbnailGenerationService>;

  const mockContext = {
    userId: 'user-123',
    nodeId: 'node-456',
    srcDwgNodeId: undefined,
    isImage: undefined,
    isLibrary: false,
  };

  const mockUploadOptions = {
    filePath: '/tmp/upload/test.dwg',
    hash: 'abc123def456',
    name: 'test.dwg',
    size: 1024000,
    context: mockContext,
  };

  const mockStorageInfo = {
    nodeId: 'new-node-789',
    directory: '202605',
    nodeDirectoryPath: '/data/files/202605/new-node-789',
    nodeDirectoryRelativePath: '202605/new-node-789',
    fileRelativePath: '202605/new-node-789/test.dwg.mxweb',
  };

  const mockConvertedFileName = 'abc123def456.dwg.mxweb';

  beforeEach(async () => {
    const mockFileConversionService = {
      convertFile: jest.fn(),
      needsConversion: jest.fn().mockReturnValue(true),
      getConvertedExtension: jest.fn().mockReturnValue('.mxweb'),
    };

    const mockVersionControlService = {
      isReady: jest.fn().mockReturnValue(true),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      commitNodeDirectory: jest.fn().mockResolvedValue({ success: true, message: 'Commit successful' }),
    };

    const mockStorageManager = {
      allocateNodeStorage: jest.fn().mockResolvedValue(mockStorageInfo),
    };

    const mockStorageService = {
      copyFromFs: jest.fn().mockResolvedValue(undefined),
    };

    const mockFileSystemService = {
      writeStatusFile: jest.fn().mockResolvedValue(true),
      getFileSize: jest.fn().mockResolvedValue(1024000),
      readDirectory: jest.fn().mockResolvedValue([mockConvertedFileName]),
      exists: jest.fn().mockReturnValue(true),
      createDirectory: jest.fn().mockResolvedValue(true),
      deleteDirectory: jest.fn().mockResolvedValue(true),
    };

    const mockFileSystemServiceMain = {
      getNode: jest.fn().mockResolvedValue({
        id: 'node-456',
        isFolder: true,
        parentId: 'parent-123',
      }),
      createFileNode: jest.fn().mockResolvedValue({
        id: 'new-node-789',
        name: 'test.dwg',
        fileHash: 'abc123def456',
        size: 1024000,
        mimeType: 'application/dwg',
        extension: '.dwg',
        parentId: 'node-456',
        ownerId: 'user-123',
      }),
      updateNodePath: jest.fn().mockResolvedValue(undefined),
    };

    const mockFileSystemNodeService = {
      getMimeType: jest.fn().mockReturnValue('application/dwg'),
    };

    const mockUploadUtilityService = {
      checkFileExistsInStorage: jest.fn().mockResolvedValue(false),
      getConvertedFileName: jest.fn().mockReturnValue(mockConvertedFileName),
    };

    const mockThumbnailGenerationService = {
      isEnabled: jest.fn().mockReturnValue(false),
      generateThumbnail: jest.fn().mockResolvedValue({ success: false }),
    };

    const mockCacheManager = {
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const mockFileMergeService = {
      performFileExistenceCheck: jest.fn(),
    };

    const mockExternalRefService = {
      handleExternalReferenceFile: jest.fn().mockResolvedValue(undefined),
      handleExternalReferenceImage: jest.fn().mockResolvedValue(undefined),
    };

    const mockExternalReferenceUpdateService = {
      updateAfterUpload: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileConversionUploadService,
        { provide: ConfigService, useValue: {} },
        { provide: FileConversionService, useValue: mockFileConversionService },
        { provide: 'FileSystemServiceMain', useValue: mockFileSystemServiceMain },
        { provide: MxFileSystemService, useValue: mockFileSystemService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: CacheManagerService, useValue: mockCacheManager },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ThumbnailGenerationService, useValue: mockThumbnailGenerationService },
        { provide: UploadUtilityService, useValue: mockUploadUtilityService },
        { provide: FileMergeService, useValue: mockFileMergeService },
        { provide: ExternalRefService, useValue: mockExternalRefService },
        { provide: ExternalReferenceUpdateService, useValue: mockExternalReferenceUpdateService },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
      ],
    }).compile();

    service = module.get<FileConversionUploadService>(FileConversionUploadService);
    fileConversionService = module.get(FileConversionService);
    versionControlService = module.get(VERSION_CONTROL_TOKEN);
    storageManager = module.get(StorageManager);
    storageService = module.get(StorageService);
    fileSystemService = module.get(MxFileSystemService);
    fileSystemServiceMain = module.get('FileSystemServiceMain');
    fileSystemNodeService = module.get(FileSystemNodeService);
    uploadUtilityService = module.get(UploadUtilityService);
    thumbnailGenerationService = module.get(ThumbnailGenerationService);
  });

  describe('uploadAndConvertFileWithPermission', () => {
    describe('Case 1: Normal Flow - CAD File Upload, Conversion, and Node Creation', () => {
      it('should successfully upload, convert CAD file, and create file node', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: {
            code: 0,
            message: 'Conversion successful',
            newpath: '/data/conversion/abc123def456.dwg.mxweb',
            tz: true,
          },
        });

        const result = await service.uploadAndConvertFileWithPermission(mockUploadOptions);

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(result.tz).toBe(true);

        expect(fileConversionService.needsConversion).toHaveBeenCalledWith('test.dwg');
        expect(fileConversionService.convertFile).toHaveBeenCalledWith({
          srcPath: mockUploadOptions.filePath,
          fileHash: mockUploadOptions.hash,
          createPreloadingData: true,
        });

        expect(fileSystemService.writeStatusFile).toHaveBeenCalledWith(
          'test.dwg',
          1024000,
          'abc123def456',
          '/tmp/upload/test.dwg'
        );

        expect(storageManager.allocateNodeStorage).toHaveBeenCalledWith(
          'new-node-789',
          'test.dwg'
        );

        expect(fileSystemServiceMain.createFileNode).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'test.dwg',
            fileHash: 'abc123def456',
            size: 1024000,
            extension: '.dwg',
            ownerId: 'user-123',
          })
        );

        expect(fileSystemServiceMain.updateNodePath).toHaveBeenCalledWith(
          'new-node-789',
          expect.stringContaining('mxweb')
        );

        expect(versionControlService.commitNodeDirectory).toHaveBeenCalledWith(
          mockStorageInfo.nodeDirectoryPath,
          'Upload file: test.dwg',
          'user-123',
          'Useruser-123'
        );
      });

      it('should verify converted file name follows expected pattern', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        await service.uploadAndConvertFileWithPermission(mockUploadOptions);

        expect(uploadUtilityService.getConvertedFileName).toHaveBeenCalledWith(
          'abc123def456',
          'test.dwg'
        );
        expect(uploadUtilityService.getConvertedFileName('abc123def456', 'test.dwg')).toBe('abc123def456.dwg.mxweb');
      });
    });

    describe('Case 2: Conversion Failure', () => {
      it('should return error when CAD conversion fails', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: false,
          ret: {
            code: -1,
            message: 'Conversion failed: invalid file format',
          },
          error: 'Conversion failed: invalid file format',
        });

        const result = await service.uploadAndConvertFileWithPermission(mockUploadOptions);

        expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
        expect(result.tz).toBeUndefined();

        expect(storageManager.allocateNodeStorage).not.toHaveBeenCalled();
        expect(fileSystemServiceMain.createFileNode).not.toHaveBeenCalled();
        expect(versionControlService.commitNodeDirectory).not.toHaveBeenCalled();
      });

      it('should return error when conversion throws exception', async () => {
        fileConversionService.convertFile.mockRejectedValue(
          new Error('Conversion program not found')
        );

        const result = await service.uploadAndConvertFileWithPermission(mockUploadOptions);

        expect(result.ret).toBe(MxUploadReturn.kConvertFileError);

        expect(storageManager.allocateNodeStorage).not.toHaveBeenCalled();
        expect(fileSystemServiceMain.createFileNode).not.toHaveBeenCalled();
      });
    });

    describe('Case 3: Edge Cases', () => {
      it('should skip SVN commit when uploading to library (isLibrary=true)', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        const libraryContext = {
          ...mockContext,
          isLibrary: true,
        };

        const result = await service.uploadAndConvertFileWithPermission({
          ...mockUploadOptions,
          context: libraryContext,
        });

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(versionControlService.commitNodeDirectory).not.toHaveBeenCalled();
      });

      it('should handle external reference DWG file upload correctly', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        const externalRefContext = {
          ...mockContext,
          srcDwgNodeId: 'existing-dwg-node-999',
          isImage: false,
        };

        const result = await service.uploadAndConvertFileWithPermission({
          ...mockUploadOptions,
          context: externalRefContext,
        });

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileSystemServiceMain.createFileNode).not.toHaveBeenCalled();
        expect(storageManager.allocateNodeStorage).not.toHaveBeenCalled();
      });

      it('should handle file already exists (fast path / second upload)', async () => {
        uploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);

        const existingNode = {
          id: 'existing-node-999',
          isFolder: false,
          parentId: 'parent-456',
        };
        fileSystemServiceMain.getNode.mockResolvedValue(existingNode);
        fileSystemServiceMain.createFileNode.mockResolvedValue({
          id: 'new-ref-node-888',
          name: 'test.dwg',
          fileHash: 'abc123def456',
          size: 1024000,
          mimeType: 'application/dwg',
          extension: '.dwg',
          parentId: 'parent-456',
          ownerId: 'user-123',
        });
        storageManager.allocateNodeStorage.mockResolvedValue(mockStorageInfo);
        fileSystemService.readDirectory.mockResolvedValue([mockConvertedFileName]);

        const result = await service.uploadAndConvertFileWithPermission(mockUploadOptions);

        expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
        expect(result.nodeId).toBe('new-ref-node-888');
        expect(fileConversionService.convertFile).not.toHaveBeenCalled();
        expect(versionControlService.commitNodeDirectory).toHaveBeenCalled();
      });

      it('should return error when parent node does not exist', async () => {
        fileSystemServiceMain.getNode.mockResolvedValue(null);

        const result = await service.uploadAndConvertFileWithPermission(mockUploadOptions);

        expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
        expect(fileConversionService.convertFile).not.toHaveBeenCalled();
      });

      it('should return error when parent node has no parentId', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        fileSystemServiceMain.getNode.mockResolvedValueOnce({
          id: 'node-456',
          isFolder: false,
          parentId: null,
        });

        const result = await service.uploadAndConvertFileWithPermission(mockUploadOptions);

        expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
      });

      it('should skip node creation when context.nodeId is missing', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        const result = await service.uploadAndConvertFileWithPermission({
          ...mockUploadOptions,
          context: {
            ...mockContext,
            nodeId: undefined,
          },
        });

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileSystemServiceMain.createFileNode).not.toHaveBeenCalled();
        expect(storageManager.allocateNodeStorage).not.toHaveBeenCalled();
      });

      it('should handle SVN commit failure gracefully', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        versionControlService.commitNodeDirectory.mockRejectedValue(
          new Error('SVN commit failed')
        );

        const result = await service.uploadAndConvertFileWithPermission(mockUploadOptions);

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(versionControlService.commitNodeDirectory).toHaveBeenCalled();
      });
    });

    describe('Non-CAD File Handling', () => {
      it('should copy non-CAD files without conversion', async () => {
        fileConversionService.needsConversion.mockReturnValue(false);

        const nonCadOptions = {
          ...mockUploadOptions,
          name: 'readme.txt',
        };

        const result = await service.uploadAndConvertFileWithPermission(nonCadOptions);

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileConversionService.convertFile).not.toHaveBeenCalled();
        expect(storageService.copyFromFs).toHaveBeenCalled();
      });
    });

    describe('MXWeb File Direct Copy', () => {
      it('should handle MXWeb file direct copy without conversion', async () => {
        fileConversionService.needsConversion.mockReturnValue(false);

        const mxwebOptions = {
          ...mockUploadOptions,
          name: 'design.mxweb',
        };

        const result = await service.uploadAndConvertFileWithPermission(mxwebOptions);

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileConversionService.convertFile).not.toHaveBeenCalled();
        expect(storageService.copyFromFs).toHaveBeenCalled();
      });
    });
  });

  describe('checkFileExist', () => {
    it('should return file already exist when file is found in storage', async () => {
      uploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);

      const result = await service.checkFileExist('test.dwg', 'abc123def456', mockContext);

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
    });

    it('should return file no exist when file is not found', async () => {
      uploadUtilityService.checkFileExistsInStorage.mockResolvedValue(false);

      const result = await service.checkFileExist('test.dwg', 'abc123def456', mockContext);

      expect(result.ret).toBe(MxUploadReturn.kFileNoExist);
    });
  });
});