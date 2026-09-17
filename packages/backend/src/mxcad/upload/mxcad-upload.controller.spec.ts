///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MxcadUploadController } from './mxcad-upload.controller';
import { DrawingIngestService } from './drawing-ingest.service';
import { ChunkUploadManagerService } from '../services/chunk-upload-manager.service';
import { UploadUtilityService } from './upload-utility.service';
import { MxCadRequestContextBuilder } from '../core/mxcad-request-context-builder';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequireProjectPermissionGuard } from '../../common/guards/require-project-permission.guard';
import { QuotaExceededException } from '../../vip/errors/quota-exceeded.error';
import { MxUploadReturn } from '../enums/mxcad-return.enum';

describe('MxcadUploadController - 分片上传配额预检', () => {
  let controller: MxcadUploadController;

  const mockDrawingIngestService = {
    assertQuotaBeforeUpload: jest.fn(),
    checkExist: jest.fn(),
    ingest: jest.fn(),
  };

  const mockChunkUploadManager = {
    checkChunkExist: jest.fn(),
    uploadChunk: jest.fn(),
  };

  const mockUploadUtilityService = {
    checkChunkExistsInStorage: jest.fn(),
    checkFileExistsInStorage: jest.fn(),
  };

  const mockRequestContextBuilder = {
    buildContextFromRequest: jest.fn(),
  };

  const mockAuditLogService = {
    log: jest.fn(),
    logProjectNodeAction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MxcadUploadController],
      providers: [
        { provide: DrawingIngestService, useValue: mockDrawingIngestService },
        {
          provide: ChunkUploadManagerService,
          useValue: mockChunkUploadManager,
        },
        { provide: UploadUtilityService, useValue: mockUploadUtilityService },
        {
          provide: MxCadRequestContextBuilder,
          useValue: mockRequestContextBuilder,
        },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    })
      .overrideGuard(RequireProjectPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(MxcadUploadController);

    mockRequestContextBuilder.buildContextFromRequest.mockResolvedValue({
      userId: 'user1',
      nodeId: 'node1',
      conflictStrategy: 'rename',
      isLibrary: false,
    });
    mockChunkUploadManager.uploadChunk.mockResolvedValue({
      ret: MxUploadReturn.kOk,
    });
  });

  const chunkRequest = (overrides: Record<string, unknown> = {}) => ({
    body: {
      hash: 'hash1',
      name: 'drawing.dwg',
      size: 10 * 1024 * 1024,
      nodeId: 'node1',
      chunk: 1,
      chunks: 3,
      ...overrides,
    },
    query: {},
  });

  it('配额不足时立即 403，不写入分片', async () => {
    mockDrawingIngestService.assertQuotaBeforeUpload.mockRejectedValue(
      new QuotaExceededException('个人空间超出限额', {
        restrictionKey: 'personalStorage',
      })
    );

    const req = chunkRequest();
    await expect(
      controller.uploadFile(
        [{} as Express.Multer.File],
        req.body as never,
        req as never
      )
    ).rejects.toThrow(QuotaExceededException);

    expect(
      mockDrawingIngestService.assertQuotaBeforeUpload
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user1',
        parentNodeId: 'node1',
        fileSize: 10 * 1024 * 1024,
      })
    );
    expect(mockChunkUploadManager.uploadChunk).not.toHaveBeenCalled();
  });

  it('skipDb 分片跳过配额预检（仅传文件不占配额）', async () => {
    const req = chunkRequest({ skipDb: true });
    await controller.uploadFile(
      [{} as Express.Multer.File],
      req.body as never,
      req as never
    );

    expect(mockDrawingIngestService.assertQuotaBeforeUpload).not.toHaveBeenCalled();
    expect(mockChunkUploadManager.uploadChunk).toHaveBeenCalledTimes(1);
  });

  it('配额充足时每个分片正常写入', async () => {
    const req = chunkRequest();
    const result = await controller.uploadFile(
      [{} as Express.Multer.File],
      req.body as never,
      req as never
    );

    expect(
      mockDrawingIngestService.assertQuotaBeforeUpload
    ).toHaveBeenCalledTimes(1);
    expect(mockChunkUploadManager.uploadChunk).toHaveBeenCalledTimes(1);
    expect(result.ret).toBe(MxUploadReturn.kOk);
  });

  it('合并成功时调用 FILE_CREATE 审计入口', async () => {
    mockChunkUploadManager.uploadChunk.mockResolvedValue({
      ret: MxUploadReturn.kOk,
      nodeId: 'new-node-1',
      created: true,
    });

    const req = chunkRequest({ chunk: 2, chunks: 3 });
    const result = await controller.uploadFile(
      [{} as Express.Multer.File],
      req.body as never,
      req as never
    );

    expect(result.nodeId).toBe('new-node-1');
    // 项目内判断收敛在 AuditLogService.logProjectNodeAction（audit-log.service.spec 覆盖）
    expect(mockAuditLogService.logProjectNodeAction).toHaveBeenCalledWith(
      'FILE_CREATE',
      'new-node-1',
      'user1',
    );
  });

  it('skip 冲突（未新建节点）时不记 FILE_CREATE', async () => {
    mockChunkUploadManager.uploadChunk.mockResolvedValue({
      ret: MxUploadReturn.kFileAlreadyExist,
      nodeId: 'existing-node-1',
    });

    const req = chunkRequest({ chunk: 2, chunks: 3 });
    await controller.uploadFile(
      [{} as Express.Multer.File],
      req.body as never,
      req as never
    );

    expect(mockAuditLogService.logProjectNodeAction).not.toHaveBeenCalled();
  });

  describe('fileisExist 秒传新建节点审计', () => {
    const existRequest = (overrides: Record<string, unknown> = {}) => ({
      body: {
        fileHash: 'hash1',
        filename: 'drawing.dwg',
        fileSize: 1024,
        nodeId: 'node1',
        conflictStrategy: 'rename',
        ...overrides,
      },
      query: {},
    });

    it('秒传命中且新建节点时记 FILE_CREATE', async () => {
      mockUploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);
      mockDrawingIngestService.checkExist.mockResolvedValue({
        ret: MxUploadReturn.kFileAlreadyExist,
        nodeId: 'new-node-1',
        created: true,
      });

      const req = existRequest();
      const result = await controller.checkFileExist(
        req.body as never,
        req as never
      );

      expect(result.exists).toBe(true);
      expect(result.nodeId).toBe('new-node-1');
      expect(mockAuditLogService.logProjectNodeAction).toHaveBeenCalledWith(
        'FILE_CREATE',
        'new-node-1',
        'user1'
      );
    });

    it('skip 冲突（返回已有节点）时不记 FILE_CREATE', async () => {
      mockUploadUtilityService.checkFileExistsInStorage.mockResolvedValue(true);
      mockDrawingIngestService.checkExist.mockResolvedValue({
        ret: MxUploadReturn.kFileAlreadyExist,
        nodeId: 'existing-node-1',
      });

      const req = existRequest();
      await controller.checkFileExist(req.body as never, req as never);

      expect(mockAuditLogService.logProjectNodeAction).not.toHaveBeenCalled();
    });

    it('存储无文件（非秒传）时不记 FILE_CREATE', async () => {
      mockUploadUtilityService.checkFileExistsInStorage.mockResolvedValue(
        false
      );
      mockDrawingIngestService.checkExist.mockResolvedValue({
        ret: MxUploadReturn.kFileNoExist,
      });

      const req = existRequest();
      await controller.checkFileExist(req.body as never, req as never);

      expect(mockAuditLogService.logProjectNodeAction).not.toHaveBeenCalled();
    });
  });

  describe('body.name 路径遍历清洗（落库前 sanitize）', () => {
    const wholeFileRequest = (overrides: Record<string, unknown> = {}) => ({
      body: {
        hash: 'hash1',
        name: 'drawing.dwg',
        size: 1024,
        nodeId: 'node1',
        ...overrides,
      },
      query: {},
    });

    it('含 .. 路径段的名字清洗为 basename 后再进 ingest', async () => {
      mockDrawingIngestService.ingest.mockResolvedValue({
        ret: MxUploadReturn.kOk,
        nodeId: 'n1',
        created: false,
      });
      const req = wholeFileRequest({ name: '../../evil.dwg' });
      await controller.uploadFile(
        [{} as Express.Multer.File],
        req.body as never,
        req as never,
      );
      expect(mockDrawingIngestService.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'evil.dwg' }),
        expect.anything(),
      );
    });

    it('清洗后为空的名字（纯点/路径段）400，不进 ingest', async () => {
      const req = wholeFileRequest({ name: '..' });
      await expect(
        controller.uploadFile(
          [{} as Express.Multer.File],
          req.body as never,
          req as never,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockDrawingIngestService.ingest).not.toHaveBeenCalled();
    });

    it('含合法特殊字符的名字（括号/空格）不被误拒', async () => {
      mockDrawingIngestService.ingest.mockResolvedValue({
        ret: MxUploadReturn.kOk,
        nodeId: 'n1',
        created: false,
      });
      const req = wholeFileRequest({ name: '图纸 (1).dwg' });
      await controller.uploadFile(
        [{} as Express.Multer.File],
        req.body as never,
        req as never,
      );
      expect(mockDrawingIngestService.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ name: '图纸 (1).dwg' }),
        expect.anything(),
      );
    });
  });
});
