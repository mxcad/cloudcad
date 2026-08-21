///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DrawingIngestService } from '../../src/mxcad/upload/drawing-ingest.service';
import { FileConversionService } from '../../src/mxcad/conversion/file-conversion.service';
import { FileSystemService as MxFileSystemService } from '../../src/mxcad/infra/file-system.service';
import { FileSystemNodeService } from '../../src/mxcad/node/filesystem-node.service';
import { CacheManagerService } from '../../src/mxcad/infra/cache-manager.service';
import { StorageManager } from '../../src/storage-management/services/storage-manager.service';
import { ThumbnailGenerationService } from '../../src/mxcad/infra/thumbnail-generation.service';
import { UploadUtilityService } from '../../src/mxcad/upload/upload-utility.service';
import { NodeStatusTransitioner } from '../../src/file-system/file-status/node-status-transitioner';
import { FileTreeService } from '../../src/file-system/file-tree/file-tree.service';
import { NodeTrashService } from '../../src/file-operations/node-trash.service';
import { RestrictionEngine } from '../../src/vip/restriction-engine.service';
import { NodeMutationGuard } from '../../src/file-operations/node-mutation.guard';
import { I_EXTERNAL_REF_FACADE } from '../../src/mxcad/external-ref/interfaces/ext-ref-facade.interface';
import { IStorageService } from '../../src/storage/interfaces/storage-service.interface';
import { FileNodeMaterializer } from '../../src/mxcad/upload/file-node-materializer.service';
import { MxUploadReturn } from '../../src/mxcad/enums/mxcad-return.enum';
import type { IngestTarget } from '../../src/mxcad/upload/drawing-ingest.service';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

describe('DrawingIngestService - CAD Upload→Convert→Open Integration', () => {
  let service: DrawingIngestService;
  let fileConversionService: jest.Mocked<FileConversionService>;
  let fileTreeService: jest.Mocked<FileTreeService>;
  let nodeTrashService: jest.Mocked<NodeTrashService>;
  let storageManager: jest.Mocked<StorageManager>;
  let storageService: jest.Mocked<IStorageService>;
  let fileSystemService: jest.Mocked<MxFileSystemService>;
  let uploadUtilityService: jest.Mocked<UploadUtilityService>;
  let externalRefFacade: any;
  let restrictionEngine: any;

  let uploadDir: string;
  let filesDataDir: string;
  let nodeDirectory: string;

  const hash = 'abc123def456';
  const convertedFileName = `${hash}.dwg.mxweb`;

  const mockContext = {
    userId: 'user-123',
    nodeId: 'node-456',
    srcDwgNodeId: undefined,
    isImage: undefined,
    isLibrary: false,
    userRole: 'USER',
  };

  const toTarget = (ctx: typeof mockContext = mockContext): IngestTarget => ({
    userId: ctx.userId,
    parentNodeId: ctx.nodeId,
    ownerId: ctx.userId,
    srcDwgNodeId: ctx.srcDwgNodeId,
    isImage: ctx.isImage,
    conflictStrategy: 'rename',
    isLibrary: ctx.isLibrary,
  });

  const mockUploadOptions = {
    filePath: '/tmp/upload/test.dwg',
    fileHash: hash,
    name: 'test.dwg',
    size: 1024000,
    context: mockContext,
  };

  const mockStorageInfo = {
    nodeId: 'new-node-789',
    directory: '202605',
    nodeDirectoryPath: '',
    nodeDirectoryRelativePath: '202605/new-node-789',
    fileRelativePath: '202605/new-node-789/test.dwg.mxweb',
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'mxcadUploadPath') return uploadDir;
      if (key === 'filesDataPath') return filesDataDir;
      return undefined;
    }),
  };

  beforeAll(async () => {
    uploadDir = path.join(
      process.cwd(),
      'temp-test-upload-convert-' + Date.now()
    );
    filesDataDir = path.join(uploadDir, 'filesData');
    nodeDirectory = path.join(filesDataDir, '202605', 'new-node-789');
    await fsPromises.mkdir(nodeDirectory, { recursive: true });
    await fsPromises.writeFile(
      path.join(uploadDir, convertedFileName),
      'converted mock mxweb'
    );
  });

  afterAll(async () => {
    try {
      await fsPromises.rm(uploadDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(async () => {
    mockStorageInfo.nodeDirectoryPath = nodeDirectory;

    // resetMocks 会清空模块级 jest.fn 实现，需在每用例重设
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'mxcadUploadPath') return uploadDir;
      if (key === 'filesDataPath') return filesDataDir;
      return undefined;
    });

    const mockFileConversionService = {
      convertFile: jest.fn(),
      needsConversion: jest.fn().mockReturnValue(true),
      getConvertedExtension: jest.fn().mockReturnValue('.mxweb'),
    };

    const mockStorageManager = {
      allocateNodeStorage: jest.fn().mockResolvedValue(mockStorageInfo),
      getFullPath: jest.fn().mockImplementation((p: string) => p),
    };

    const mockStorageService = {
      copyFromFs: jest.fn().mockResolvedValue(undefined),
    };

    const mockFileSystemService = {
      writeStatusFile: jest.fn().mockResolvedValue(true),
      getFileSize: jest.fn().mockResolvedValue(1024000),
      readDirectory: jest.fn().mockResolvedValue([convertedFileName]),
      exists: jest.fn().mockReturnValue(true),
      createDirectory: jest.fn().mockResolvedValue(true),
      deleteDirectory: jest.fn().mockResolvedValue(true),
      getMd5Path: jest
        .fn()
        .mockReturnValue(path.join(uploadDir, convertedFileName)),
    };

    const mockFileTreeService = {
      getNode: jest.fn().mockResolvedValue({
        id: 'node-456',
        nodeType: 'FOLDER',
        parentId: 'parent-123',
      }),
      createFileNode: jest.fn().mockResolvedValue({
        id: 'new-node-789',
        name: 'test.dwg',
        fileHash: hash,
        size: 1024000,
        mimeType: 'application/dwg',
        extension: '.dwg',
        parentId: 'node-456',
        ownerId: 'user-123',
      }),
      updateNodePath: jest.fn().mockResolvedValue(undefined),
      updateFileStatus: jest.fn().mockResolvedValue(undefined),
      getProjectId: jest.fn().mockResolvedValue('project-456'),
      getChildren: jest.fn().mockResolvedValue({ nodes: [] }),
    };

    const mockNodeTrashService = {
      deleteNode: jest.fn().mockResolvedValue(undefined),
    };

    const mockFileSystemNodeService = {
      getMimeType: jest.fn().mockReturnValue('application/dwg'),
    };

    const mockUploadUtilityService = {
      checkFileExistsInStorage: jest.fn().mockResolvedValue(false),
      getConvertedFileName: jest.fn().mockReturnValue(convertedFileName),
      generateUniqueFileName: jest.fn().mockResolvedValue('test.dwg'),
    };

    const mockThumbnailGenerationService = {
      isEnabled: jest.fn().mockReturnValue(false),
      generateThumbnail: jest.fn().mockResolvedValue({ success: false }),
    };

    const mockCacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
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
        DrawingIngestService,
        NodeStatusTransitioner,
        FileNodeMaterializer,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MxFileSystemService, useValue: mockFileSystemService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: NodeTrashService, useValue: mockNodeTrashService },
        { provide: FileSystemNodeService, useValue: mockFileSystemNodeService },
        { provide: CacheManagerService, useValue: mockCacheManager },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: FileConversionService, useValue: mockFileConversionService },
        { provide: I_EXTERNAL_REF_FACADE, useValue: mockExternalRefFacade },
        { provide: UploadUtilityService, useValue: mockUploadUtilityService },
        {
          provide: ThumbnailGenerationService,
          useValue: mockThumbnailGenerationService,
        },
        { provide: IStorageService, useValue: mockStorageService },
        { provide: RestrictionEngine, useValue: mockRestrictionEngine },
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
    fileConversionService = module.get(FileConversionService);
    fileTreeService = module.get(FileTreeService);
    nodeTrashService = module.get(NodeTrashService);
    storageManager = module.get(StorageManager);
    storageService = module.get(IStorageService);
    fileSystemService = module.get(MxFileSystemService);
    uploadUtilityService = module.get(UploadUtilityService);
    externalRefFacade = module.get(I_EXTERNAL_REF_FACADE);
    restrictionEngine = module.get(RestrictionEngine);
  });

  describe('ingest - whole file', () => {
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

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget()
        );

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(result.tz).toBe(true);

        expect(fileConversionService.needsConversion).toHaveBeenCalledWith(
          'test.dwg'
        );
        expect(fileConversionService.convertFile).toHaveBeenCalledWith(
          expect.objectContaining({
            srcPath: mockUploadOptions.filePath,
            fileHash: hash,
            createPreloadingData: true,
          })
        );

        expect(fileSystemService.writeStatusFile).toHaveBeenCalledWith(
          'test.dwg',
          1024000,
          hash,
          '/tmp/upload/test.dwg'
        );

        expect(storageManager.allocateNodeStorage).toHaveBeenCalledWith(
          'new-node-789',
          'test.dwg'
        );

        expect(fileTreeService.createFileNode).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'test.dwg',
            fileHash: hash,
            size: 1024000,
            extension: '.dwg',
            ownerId: 'user-123',
          })
        );

        expect(fileTreeService.updateNodePath).toHaveBeenCalledWith(
          'new-node-789',
          expect.stringContaining('mxweb')
        );

        expect(externalRefFacade.updateAfterUpload).toHaveBeenCalledWith(
          'node-456'
        );
      });

      it('should verify converted file name follows expected pattern', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget()
        );

        expect(
          uploadUtilityService.getConvertedFileName(hash, 'test.dwg')
        ).toBe(convertedFileName);
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

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget()
        );

        expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
        expect(result.tz).toBeUndefined();

        expect(restrictionEngine.releaseConversionCount).toHaveBeenCalledWith(
          'user-123'
        );
        expect(nodeTrashService.deleteNode).toHaveBeenCalledWith(
          'new-node-789',
          true
        );
        expect(storageManager.allocateNodeStorage).not.toHaveBeenCalled();
      });

      it('should propagate error when conversion throws exception', async () => {
        fileConversionService.convertFile.mockRejectedValue(
          new Error('Conversion program not found')
        );

        await expect(
          service.ingest({ kind: 'file', ...mockUploadOptions }, toTarget())
        ).rejects.toThrow('Conversion program not found');

        expect(restrictionEngine.releaseConversionCount).toHaveBeenCalledWith(
          'user-123'
        );
      });
    });

    describe('Case 3: Edge Cases', () => {
      it('should handle library upload and still create the file node', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget({ ...mockContext, isLibrary: true })
        );

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileTreeService.createFileNode).toHaveBeenCalled();
      });

      it('should handle external reference DWG file upload correctly', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget({
            ...mockContext,
            srcDwgNodeId: 'existing-dwg-node-999',
            isImage: false,
          })
        );

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileTreeService.createFileNode).not.toHaveBeenCalled();
        expect(storageManager.allocateNodeStorage).not.toHaveBeenCalled();
        expect(
          externalRefFacade.handleExternalReferenceFile
        ).toHaveBeenCalledWith(
          hash,
          'existing-dwg-node-999',
          'test.dwg',
          path.join(uploadDir, convertedFileName)
        );
      });

      it('should handle file already exists (fast path / second upload)', async () => {
        uploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);

        const existingNode = {
          id: 'existing-node-999',
          nodeType: 'FILE',
          parentId: 'parent-456',
        };
        fileTreeService.getNode.mockResolvedValue(existingNode as any);
        fileTreeService.createFileNode.mockResolvedValue({
          id: 'new-ref-node-888',
          name: 'test.dwg',
          fileHash: hash,
          size: 1024000,
          mimeType: 'application/dwg',
          extension: '.dwg',
          parentId: 'parent-456',
          ownerId: 'user-123',
        } as any);

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget()
        );

        expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
        expect(result.nodeId).toBe('new-ref-node-888');
        expect(fileConversionService.convertFile).not.toHaveBeenCalled();
      });

      it('should return error when parent node does not exist (fast path)', async () => {
        uploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);
        fileTreeService.getNode.mockResolvedValue(null);

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget()
        );

        expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
        expect(fileConversionService.convertFile).not.toHaveBeenCalled();
      });

      it('should return error when parent node has no parentId (fast path)', async () => {
        uploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);
        fileTreeService.getNode.mockResolvedValueOnce({
          id: 'node-456',
          nodeType: 'FILE',
          parentId: null,
        } as any);

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget()
        );

        expect(result.ret).toBe(MxUploadReturn.kConvertFileError);
      });

      it('should skip node creation when context.nodeId is missing', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget({ ...mockContext, nodeId: undefined })
        );

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileTreeService.createFileNode).not.toHaveBeenCalled();
        expect(storageManager.allocateNodeStorage).not.toHaveBeenCalled();
      });

      it('should handle external-ref update failure gracefully', async () => {
        fileConversionService.convertFile.mockResolvedValue({
          isOk: true,
          ret: { code: 0, tz: true },
        });

        externalRefFacade.updateAfterUpload.mockRejectedValue(
          new Error('external-ref update failed')
        );

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions },
          toTarget()
        );

        expect(result.ret).toBe(MxUploadReturn.kOk);
      });
    });

    describe('Non-CAD File Handling', () => {
      it('should copy non-CAD files without conversion', async () => {
        fileConversionService.needsConversion.mockReturnValue(false);

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions, name: 'readme.txt' },
          toTarget()
        );

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileConversionService.convertFile).not.toHaveBeenCalled();
        expect(storageService.copyFromFs).toHaveBeenCalled();
      });
    });

    describe('MXWeb File Direct Copy', () => {
      it('should handle MXWeb file direct copy without conversion', async () => {
        fileConversionService.needsConversion.mockReturnValue(false);

        const result = await service.ingest(
          { kind: 'file', ...mockUploadOptions, name: 'design.mxweb' },
          toTarget()
        );

        expect(result.ret).toBe(MxUploadReturn.kOk);
        expect(fileConversionService.convertFile).not.toHaveBeenCalled();
        expect(storageService.copyFromFs).toHaveBeenCalled();
      });
    });
  });

  describe('checkExist', () => {
    it('should return file already exist when file is found in storage', async () => {
      const result = await service.checkExist(hash, 'test.dwg', toTarget());

      expect(result.ret).toBe(MxUploadReturn.kFileAlreadyExist);
    });

    it('should return file no exist when file is not found', async () => {
      fileSystemService.exists.mockResolvedValue(false);

      const result = await service.checkExist(hash, 'test.dwg', toTarget());

      expect(result.ret).toBe(MxUploadReturn.kFileNoExist);
    });
  });
});
