///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NodeType, FileStatus } from '@cloudcad/db';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import { NodeTrashService } from '../../file-operations/node-trash.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { CacheManagerService } from '../infra/cache-manager.service';
import { QuotaExceededException } from '../../vip/errors/quota-exceeded.error';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { UploadUtilityService } from './upload-utility.service';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import {
  DrawingIngestService,
  IngestSource,
  IngestTarget,
} from './drawing-ingest.service';
import { FileNodeMaterializer } from './file-node-materializer.service';

describe('DrawingIngestService', () => {
  let service: DrawingIngestService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('../../uploads'),
  };

  const mockFileSystemService = {
    getFileSize: jest.fn(),
    getMd5Path: jest.fn((p: string) => `/tmp/${p}`),
    exists: jest.fn(),
    writeStatusFile: jest.fn(),
    deleteDirectory: jest.fn(),
    getChunkTempDirPath: jest.fn(),
    readDirectory: jest.fn(),
  };

  const mockFileTreeService = {
    getChildren: jest.fn(),
    createFileNode: jest.fn(),
  };

  const mockNodeTrashService = {
    deleteNode: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };

  const mockFileConversionService = {
    getConvertedExtension: jest.fn().mockReturnValue(''),
    needsConversion: jest.fn().mockReturnValue(false),
    convertFile: jest.fn(),
  };

  const mockUploadUtilityService = {
    checkFileExistsInStorage: jest.fn(),
    getConvertedFileName: jest.fn(),
    generateUniqueFileName: jest.fn(),
  };

  const mockNodeMutationGuard = {
    assertByteQuota: jest.fn(),
  };

  const mockRestrictionEngine = {
    reserveConversionCountOrThrow: jest.fn(),
    reserveGuestConversionCountOrThrow: jest.fn(),
    releaseConversionCount: jest.fn(),
    releaseGuestConversionCount: jest.fn(),
  };

  const mockNodeStatusTransitioner = {
    transition: jest.fn(),
  };

  const mockMaterializer = {
    resolveParentId: jest.fn(),
    getMimeType: jest.fn().mockReturnValue('application/octet-stream'),
    materialize: jest.fn(),
    handleExtRef: jest.fn(),
  };

  function fileSource(
    overrides?: Partial<Extract<IngestSource, { kind: 'file' }>>
  ): IngestSource {
    return {
      kind: 'file',
      filePath: '/tmp/upload.dwg',
      fileHash: 'hash1',
      name: 'upload.dwg',
      size: 1024,
      ...overrides,
    };
  }

  function target(overrides?: Partial<IngestTarget>): IngestTarget {
    return {
      userId: 'user1',
      parentNodeId: 'parent1',
      ownerId: 'user1',
      ...overrides,
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DrawingIngestService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MxFileSystemService, useValue: mockFileSystemService },
        { provide: FileTreeService, useValue: mockFileTreeService },
        { provide: NodeTrashService, useValue: mockNodeTrashService },
        { provide: CacheManagerService, useValue: mockCacheManager },
        {
          provide: FileConversionService,
          useValue: mockFileConversionService,
        },
        { provide: UploadUtilityService, useValue: mockUploadUtilityService },
        { provide: NodeMutationGuard, useValue: mockNodeMutationGuard },
        { provide: RestrictionEngine, useValue: mockRestrictionEngine },
        {
          provide: NodeStatusTransitioner,
          useValue: mockNodeStatusTransitioner,
        },
        { provide: FileNodeMaterializer, useValue: mockMaterializer },
      ],
    }).compile();
    service = module.get<DrawingIngestService>(DrawingIngestService);

    mockMaterializer.resolveParentId.mockResolvedValue('parent1');
    mockMaterializer.materialize.mockResolvedValue({ nodeId: 'node1' });
    mockRestrictionEngine.reserveConversionCountOrThrow.mockResolvedValue(
      undefined
    );
    mockRestrictionEngine.releaseConversionCount.mockResolvedValue(undefined);
  });

  describe('秒传 ret 码', () => {
    it('should return kFileAlreadyExist with nodeId when file exists in storage', async () => {
      mockUploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);

      const result = await service.ingest(fileSource(), target());

      expect(result).toEqual({
        ret: MxUploadReturn.kFileAlreadyExist,
        nodeId: 'node1',
        created: true,
      });
      expect(mockNodeMutationGuard.assertByteQuota).toHaveBeenCalledWith(
        { node: { id: 'parent1' }, incrementBytes: 1024 },
        'user1'
      );
      expect(mockMaterializer.materialize).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 'parent1',
          name: 'upload.dwg',
          source: { kind: 'artifacts', suffix: 'dwg', uploadPath: '../../uploads' },
        })
      );
    });
  });

  describe('冲突策略三分支（秒传落盘）', () => {
    function setupExistingFile() {
      mockUploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);
      mockFileTreeService.getChildren.mockResolvedValue({
        nodes: [
          {
            id: 'existing1',
            nodeType: NodeType.FILE,
            name: 'upload.dwg',
          },
        ],
      });
    }

    it('skip：同名文件已存在时提前返回 kFileAlreadyExist，不落盘', async () => {
      setupExistingFile();

      const result = await service.checkExist('hash1', 'upload.dwg', {
        ...target(),
        conflictStrategy: 'skip',
      });

      expect(result).toEqual({
        ret: MxUploadReturn.kFileAlreadyExist,
        nodeId: 'existing1',
      });
      expect(mockMaterializer.materialize).not.toHaveBeenCalled();
      expect(mockNodeTrashService.deleteNode).not.toHaveBeenCalled();
    });

    it('overwrite：先删除旧节点再以原名落盘', async () => {
      setupExistingFile();

      const result = await service.checkExist('hash1', 'upload.dwg', {
        ...target(),
        conflictStrategy: 'overwrite',
      });

      expect(mockNodeTrashService.deleteNode).toHaveBeenCalledWith(
        'existing1',
        true
      );
      expect(mockMaterializer.materialize).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'upload.dwg' })
      );
      expect(result).toEqual({
        ret: MxUploadReturn.kFileAlreadyExist,
        nodeId: 'node1',
        created: true,
      });
    });

    it('rename：以唯一文件名落盘', async () => {
      setupExistingFile();
      mockUploadUtilityService.generateUniqueFileName.mockResolvedValue(
        'upload (1).dwg'
      );

      const result = await service.checkExist('hash1', 'upload.dwg', {
        ...target(),
        conflictStrategy: 'rename',
      });

      expect(mockMaterializer.materialize).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'upload (1).dwg' })
      );
      expect(result).toEqual({
        ret: MxUploadReturn.kFileAlreadyExist,
        nodeId: 'node1',
        created: true,
      });
    });
  });

  describe('转换失败占位释放', () => {
    it('should release conversion reservation and delete failed node', async () => {
      mockFileConversionService.needsConversion.mockReturnValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);
      mockFileTreeService.createFileNode.mockResolvedValue({ id: 'cad1' });
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: false,
        ret: { code: 1 },
      });

      const result = await service.ingest(fileSource(), target());

      expect(mockRestrictionEngine.reserveConversionCountOrThrow).toHaveBeenCalledWith(
        'user1'
      );
      expect(mockRestrictionEngine.releaseConversionCount).toHaveBeenCalledWith(
        'user1'
      );
      expect(mockNodeStatusTransitioner.transition).toHaveBeenCalledWith(
        'cad1',
        FileStatus.PROCESSING,
        FileStatus.FAILED
      );
      expect(mockNodeTrashService.deleteNode).toHaveBeenCalledWith(
        'cad1',
        true
      );
      expect(result).toEqual({ ret: MxUploadReturn.kConvertFileError });
    });
  });

  describe('上传前配额预检（checkExist 时机前移）', () => {
    it('fileSize 超出配额时立即拒绝，不进入落盘', async () => {
      const quotaError = new QuotaExceededException('个人空间超出限额', {
        restrictionKey: 'personalStorage',
      });
      mockNodeMutationGuard.assertByteQuota.mockRejectedValueOnce(quotaError);

      await expect(
        service.checkExist('hash1', 'upload.dwg', {
          ...target(),
          fileSize: 2048,
        })
      ).rejects.toThrow(QuotaExceededException);

      expect(mockNodeMutationGuard.assertByteQuota).toHaveBeenCalledWith(
        { node: { id: 'parent1' }, incrementBytes: 2048 },
        'user1'
      );
      expect(mockMaterializer.materialize).not.toHaveBeenCalled();
    });

    it('fileSize 未上报（去重检查场景）时跳过配额断言', async () => {
      await service.checkExist('hash1', 'upload.dwg', target());

      expect(mockNodeMutationGuard.assertByteQuota).not.toHaveBeenCalled();
    });
  });

  describe('QuotaExceededException 传播', () => {
    it('should propagate quota error from quota check (配额在编排层)', async () => {
      mockUploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);
      mockNodeMutationGuard.assertByteQuota.mockRejectedValue(
        new QuotaExceededException('quota exceeded', {
          restrictionKey: 'bytes',
        })
      );

      await expect(
        service.ingest(fileSource(), target())
      ).rejects.toThrow(QuotaExceededException);
    });
  });
});
