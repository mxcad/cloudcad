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
import { AsyncConversionService } from '../conversion/async-conversion.service';
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

  const mockAsyncConversionService = {
    registerTask: jest.fn().mockResolvedValue('async_node1_1234567890'),
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
        {
          provide: AsyncConversionService,
          useValue: mockAsyncConversionService,
        },
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

  describe('转换失败占位释放（#433 异步化：后台处理）', () => {
    // 后台转换任务 fire-and-forget，需冲刷微任务链使其完成后再断言
    async function flushMicrotasks(count = 12): Promise<void> {
      for (let i = 0; i < count; i++) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    it('上传立即返回 kOk（节点 PROCESSING），转换失败在后台释放占位 + 删节点', async () => {
      mockFileConversionService.needsConversion.mockReturnValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);
      mockFileTreeService.createFileNode.mockResolvedValue({ id: 'cad1' });
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: false,
        ret: { code: 1 },
      });

      // 上传请求立即返回 kOk（不阻塞等待转换），节点保持 PROCESSING
      const result = await service.ingest(fileSource(), target());
      expect(result).toEqual({
        ret: MxUploadReturn.kOk,
        nodeId: 'cad1',
        created: true,
      });
      expect(mockRestrictionEngine.reserveConversionCountOrThrow).toHaveBeenCalledWith(
        'user1'
      );

      // 冲刷后台转换任务微任务链（fire-and-forget，mock 立即 resolve 故任务已完成）
      await flushMicrotasks();

      // 后台任务：转换失败 → 释放占位 + 节点 FAILED + 删除节点
      expect(mockRestrictionEngine.releaseConversionCount).toHaveBeenCalledWith(
        'user1'
      );
      expect(mockNodeStatusTransitioner.transition).toHaveBeenCalledWith(
        'cad1',
        FileStatus.PROCESSING,
        FileStatus.FAILED
      );
      expect(mockNodeTrashService.deleteNode).toHaveBeenCalledWith('cad1', true);
    });
  });

  describe('S5-2 上传链路统一：后台转换注册 node.taskId 进面板「云端」列表', () => {
    async function flushMicrotasks(count = 12): Promise<void> {
      for (let i = 0; i < count; i++) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    it('后台转换前调用 registerTask 写 node.taskId（上传图纸进面板云端列表）', async () => {
      mockFileConversionService.needsConversion.mockReturnValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);
      mockFileTreeService.createFileNode.mockResolvedValue({ id: 'cad1' });
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0 },
      });
      mockMaterializer.materialize.mockResolvedValue({ nodeId: 'cad1' });

      const result = await service.ingest(fileSource(), target());
      expect(result).toEqual({
        ret: MxUploadReturn.kOk,
        nodeId: 'cad1',
        created: true,
      });

      await flushMicrotasks();

      // S5-2：后台转换前注册 node.taskId（写 taskId + 确保 PROCESSING），
      // 使上传图纸进面板「云端」列表（node.taskId 非空 = 云端任务）。
      expect(mockAsyncConversionService.registerTask).toHaveBeenCalledWith('cad1');
      // 转换完成 + 落盘 + 节点 COMPLETED
      expect(mockFileConversionService.convertFile).toHaveBeenCalled();
      expect(mockMaterializer.materialize).toHaveBeenCalled();
      expect(mockNodeStatusTransitioner.transition).toHaveBeenCalledWith(
        'cad1',
        FileStatus.PROCESSING,
        FileStatus.COMPLETED
      );
    });
  });

  describe('外部参照 DWG 上传（保持同步，不建节点）', () => {
    it('srcDwgNodeId 场景：同步转换 + handleExtRef，不建节点，返回 kOk + created:false', async () => {
      mockFileConversionService.needsConversion.mockReturnValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0, tz: true },
      });
      mockUploadUtilityService.getConvertedFileName.mockReturnValue(
        'hash1.dwg.mxweb'
      );

      const result = await service.ingest(
        fileSource(),
        target({ srcDwgNodeId: 'dwg-node-1', isImage: false })
      );

      // 外部参照：不建数据库节点，同步转换 + handleExtRef（请求返回即就位）
      expect(result).toEqual({
        ret: MxUploadReturn.kOk,
        tz: true,
        created: false,
      });
      expect(mockFileTreeService.createFileNode).not.toHaveBeenCalled();
      expect(mockMaterializer.handleExtRef).toHaveBeenCalledWith({
        srcDwgNodeId: 'dwg-node-1',
        name: 'upload.dwg',
        fileHash: 'hash1',
        sourcePath: expect.any(String),
      });
    });

    it('外部参照转换失败：同步释放占位 + 返回 kConvertFileError（不删节点）', async () => {
      mockFileConversionService.needsConversion.mockReturnValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: false,
        ret: { code: 1 },
      });

      const result = await service.ingest(
        fileSource(),
        target({ srcDwgNodeId: 'dwg-node-1', isImage: false })
      );

      expect(result).toEqual({ ret: MxUploadReturn.kConvertFileError });
      expect(mockMaterializer.handleExtRef).not.toHaveBeenCalled();
      expect(mockNodeTrashService.deleteNode).not.toHaveBeenCalled();
      expect(mockRestrictionEngine.releaseConversionCount).toHaveBeenCalledWith(
        'user1'
      );
    });
  });

  describe('无 nodeId 打开（CAD 编辑器打开图纸 = 纯打开/预览，不建节点）', () => {
    it('登录用户无 nodeId：同步转换 + 不建节点，返回 kOk + created:false（回归：#433 前转换无条件执行）', async () => {
      mockFileConversionService.needsConversion.mockReturnValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: true,
        ret: { code: 0 },
      });

      // 无 nodeId（CAD 编辑器打开图纸，游客与登录用户一致）：target.parentNodeId 为空
      const result = await service.ingest(
        fileSource(),
        target({ parentNodeId: '' })
      );

      // 转换执行、不建数据库节点、返回 kOk（前端经 public-file/access/<hash>.mxweb 打开）
      expect(result).toEqual({ ret: MxUploadReturn.kOk, created: false });
      expect(mockFileConversionService.convertFile).toHaveBeenCalledWith({
        srcPath: '/tmp/upload.dwg',
        fileHash: 'hash1',
        createPreloadingData: true,
      });
      expect(mockFileTreeService.createFileNode).not.toHaveBeenCalled();
      expect(mockNodeStatusTransitioner.transition).not.toHaveBeenCalled();
      // 转换成功，不释放占位
      expect(mockRestrictionEngine.releaseConversionCount).not.toHaveBeenCalled();
    });

    it('无 nodeId 转换失败：同步释放占位 + 返回 kConvertFileError（不建节点、不删节点）', async () => {
      mockFileConversionService.needsConversion.mockReturnValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);
      mockFileConversionService.convertFile.mockResolvedValue({
        isOk: false,
        ret: { code: 1 },
      });

      const result = await service.ingest(
        fileSource(),
        target({ parentNodeId: '' })
      );

      expect(result).toEqual({ ret: MxUploadReturn.kConvertFileError });
      expect(mockFileTreeService.createFileNode).not.toHaveBeenCalled();
      expect(mockNodeTrashService.deleteNode).not.toHaveBeenCalled();
      expect(mockRestrictionEngine.releaseConversionCount).toHaveBeenCalledWith(
        'user1'
      );
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
