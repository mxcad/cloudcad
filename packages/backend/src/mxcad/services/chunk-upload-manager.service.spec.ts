///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChunkUploadManagerService } from './chunk-upload-manager.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { FileSystemService } from '../infra/file-system.service';
import { DrawingIngestService } from '../upload/drawing-ingest.service';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import type { UploadChunkOptions } from '../upload/file-upload-manager.types';
import * as path from 'path';

/** 与实现同用 path.join，跨平台分隔符一致 */
const chunkPath = (index: number) => path.join('/tmp/chunks/hash1', `${index}_hash1`);

describe('ChunkUploadManagerService', () => {
  let service: ChunkUploadManagerService;

  const mockFileSystemService = {
    getChunkTempDirPath: jest.fn(),
    exists: jest.fn(),
    getFileSize: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn(),
  };

  const mockDrawingIngestService = {
    ingest: jest.fn(),
  };

  const context = {
    userId: 'user1',
    nodeId: 'node1',
    ip: '127.0.0.1',
  };

  const options = (overrides: Partial<UploadChunkOptions> = {}): UploadChunkOptions =>
    ({
      hash: 'hash1',
      name: 'drawing.dwg',
      size: 1024,
      chunk: 0,
      chunks: 3,
      context,
      ...overrides,
    }) as UploadChunkOptions;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockFileSystemService.getChunkTempDirPath.mockReturnValue(
      '/tmp/chunks/hash1'
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChunkUploadManagerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({ chunkMaxConcurrent: 2 }),
          },
        },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
        { provide: FileSystemService, useValue: mockFileSystemService },
        { provide: DrawingIngestService, useValue: mockDrawingIngestService },
      ],
    }).compile();

    service = module.get(ChunkUploadManagerService);
    mockRuntimeConfigService.getValue.mockResolvedValue(100); // maxFileSize=100MB
  });

  describe('checkChunkExist（分片存在性单一权威）', () => {
    it('chunk 0 且大小超限 → kErrorParam（不查盘）', async () => {
      const result = await service.checkChunkExist(
        options({ size: 200 * 1024 * 1024 })
      );
      expect(result.ret).toBe(MxUploadReturn.kErrorParam);
      expect(mockFileSystemService.exists).not.toHaveBeenCalled();
    });

    it('分片存在且大小匹配（非末片）→ kChunkAlreadyExist', async () => {
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);

      const result = await service.checkChunkExist(
        options({ chunk: 1, chunks: 3 })
      );
      expect(result.ret).toBe(MxUploadReturn.kChunkAlreadyExist);
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(
        chunkPath(1)
      );
    });

    it('分片存在但大小不匹配 → kChunkNoExist（防半截分片误判已传完）', async () => {
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(512);

      const result = await service.checkChunkExist(
        options({ chunk: 1, chunks: 3 })
      );
      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
    });

    it('分片不存在 → kChunkNoExist', async () => {
      mockFileSystemService.exists.mockResolvedValue(false);

      const result = await service.checkChunkExist(
        options({ chunk: 2, chunks: 3 })
      );
      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
    });

    it('末片存在且全部分片齐 → kChunkAlreadyExist（等待合并）', async () => {
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.getFileSize.mockResolvedValue(1024);

      const result = await service.checkChunkExist(
        options({ chunk: 2, chunks: 3 })
      );
      expect(result.ret).toBe(MxUploadReturn.kChunkAlreadyExist);
      // 末片分支逐个复核 0..chunks-1
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(chunkPath(0));
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(chunkPath(2));
    });

    it('检查抛错 → 兜底 kChunkNoExist（不向客户端泄漏异常）', async () => {
      mockFileSystemService.exists.mockRejectedValue(new Error('EIO'));

      const result = await service.checkChunkExist(
        options({ chunk: 1, chunks: 3 })
      );
      expect(result.ret).toBe(MxUploadReturn.kChunkNoExist);
    });
  });

  describe('uploadChunk', () => {
    it('非末片：multer 已落盘，仅确认接收，不触发合并', async () => {
      const result = await service.uploadChunk(
        options({ chunk: 0, chunks: 3 })
      );
      expect(result.ret).toBe(MxUploadReturn.kOk);
      expect(mockDrawingIngestService.ingest).not.toHaveBeenCalled();
    });

    it('末片：触发合并，透传 hash/name/size/chunkCount 与上下文', async () => {
      const ingestResult = { ret: MxUploadReturn.kOk, nodeId: 'node-new' };
      mockDrawingIngestService.ingest.mockResolvedValue(ingestResult);

      const result = await service.uploadChunk(
        options({ chunk: 2, chunks: 3, skipDb: true })
      );
      expect(result).toBe(ingestResult);
      expect(mockDrawingIngestService.ingest).toHaveBeenCalledWith(
        {
          kind: 'chunks',
          hash: 'hash1',
          name: 'drawing.dwg',
          size: 1024,
          chunkCount: 3,
          skipDb: true,
          forceConvert: undefined,
          ip: '127.0.0.1',
        },
        expect.objectContaining({
          userId: 'user1',
          parentNodeId: 'node1',
          ownerId: 'user1',
        })
      );
    });
  });
});
