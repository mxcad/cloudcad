///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test } from '@nestjs/testing';
import { NodeType } from '@cloudcad/db';
import { FileDownloadHandlerService } from './file-download-handler.service';
import { FileDownloadExportService } from './file-download-export.service';
import { FileTreeService } from '../file-tree/file-tree.service';

describe('FileDownloadHandlerService — 下载响应缓存策略（BUG-FS-02）', () => {
  let service: FileDownloadHandlerService;
  let getNode: jest.Mock;

  const makeRes = () => {
    const headers: Record<string, string> = {};
    const res: Record<string, unknown> = {
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      status: jest.fn(() => res),
      end: jest.fn(),
      headers,
    };
    return res as unknown as Record<string, unknown> & {
      setHeader: jest.Mock;
      status: jest.Mock;
      end: jest.Mock;
      headers: Record<string, string>;
    };
  };

  const fakeStream = () => ({
    pipe: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(),
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FileDownloadHandlerService,
        {
          provide: FileDownloadExportService,
          useValue: {
            downloadNode: jest.fn().mockResolvedValue({
              stream: fakeStream(),
              filename: 'test.dwg',
              mimeType: 'application/octet-stream',
            }),
          },
        },
        {
          provide: FileTreeService,
          useValue: {
            getNode: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(FileDownloadHandlerService);
    getNode = moduleRef.get(FileTreeService).getNode as jest.Mock;
  });

  it('文件节点：Cache-Control 为 no-cache（非 public, max-age=3600），ETag 已设置', async () => {
    getNode.mockResolvedValue({
      id: 'n1',
      name: 'test.dwg',
      nodeType: NodeType.FILE,
      fileHash: 'abc123',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const res = makeRes();
    await service.handleDownload('n1', 'u1', res as never);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('ETag', expect.any(String));
    // 不得再出现允许浏览器 1 小时缓存的 max-age
    expect(res.headers['Cache-Control']).not.toContain('max-age');
  });

  it('非文件节点（动态 ZIP 等）：Cache-Control 仍为 no-cache', async () => {
    getNode.mockResolvedValue({
      id: 'n2',
      name: 'bundle.zip',
      nodeType: NodeType.FOLDER,
    });
    const res = makeRes();
    await service.handleDownload('n2', 'u1', res as never);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
  });
});
