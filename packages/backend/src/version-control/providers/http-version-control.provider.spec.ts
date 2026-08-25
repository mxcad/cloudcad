///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as http from 'http';
import { AddressInfo } from 'net';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotImplementedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { HttpVersionControlProvider } from './http-version-control.provider';

describe('HttpVersionControlProvider', () => {
  let server: http.Server;
  let port: number;
  let provider: HttpVersionControlProvider;
  let lastRequest: {
    method: string;
    path: string;
    body?: unknown;
  } | null;

  const startServer = async (
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<number> => {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return (server.address() as AddressInfo).port;
  };

  const createProvider = async (): Promise<HttpVersionControlProvider> => {
    const module = await Test.createTestingModule({
      providers: [
        HttpVersionControlProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'STORAGE_SERVICE_URL'
                ? `http://127.0.0.1:${port}`
                : undefined
            ),
          },
        },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    return module.get(HttpVersionControlProvider);
  };

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('getFileHistory', () => {
    it('should GET svn history, map entries, reverse to ascending and keep totalCount', async () => {
      port = await startServer((req, res) => {
        lastRequest = { method: req.method ?? '', path: req.url ?? '' };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            entries: [
              {
                revision: 3,
                message: 'init',
                author: 'alice',
                timestamp: '2026-01-03T00:00:00.000Z',
              },
              {
                revision: 2,
                message: 'second',
                author: 'bob',
                timestamp: '2026-01-02T00:00:00.000Z',
              },
              {
                revision: 1,
                message: 'first',
                author: 'carol',
                timestamp: '2026-01-01T00:00:00.000Z',
              },
            ],
          })
        );
      });
      provider = await createProvider();

      const result = await provider.getFileHistory('202601/node1/a.dwg');

      expect(lastRequest?.path).toBe(
        '/v1/svn/history?path=202601%2Fnode1%2Fa.dwg'
      );
      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(3);
      // 新→旧输入，反转成旧→新与 embedded 行为一致
      expect(result.entries.map((e) => e.revision)).toEqual([1, 2, 3]);
      expect(result.entries[0].date).toBeInstanceOf(Date);
    });

    it('should limit returned entries but keep real totalCount', async () => {
      const entries = [];
      for (let i = 5; i >= 1; i--) {
        entries.push({
          revision: i,
          message: `rev ${i}`,
          author: 'alice',
          timestamp: `2026-01-0${i}T00:00:00.000Z`,
        });
      }
      port = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ entries }));
      });
      provider = await createProvider();

      const result = await provider.getFileHistory(
        '202601/node1/a.dwg',
        2
      );

      expect(result.totalCount).toBe(5);
      expect(result.entries.map((e) => e.revision)).toEqual([4, 5]);
    });

    it('should return failure when storage-service errors', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'svn down' }));
      });
      provider = await createProvider();

      const result = await provider.getFileHistory('202601/missing');

      expect(result.success).toBe(false);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('getFileContentAtRevision', () => {
    it('should GET svn cat and return buffer content', async () => {
      port = await startServer((req, res) => {
        lastRequest = { method: req.method ?? '', path: req.url ?? '' };
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(Buffer.from('revision-content'));
      });
      provider = await createProvider();

      const result = await provider.getFileContentAtRevision(
        '202601/node1/a.dwg',
        5
      );

      expect(lastRequest?.path).toBe(
        '/v1/svn/cat?path=202601%2Fnode1%2Fa.dwg&revision=5'
      );
      expect(result.success).toBe(true);
      expect(result.content?.toString()).toBe('revision-content');
    });

    it('should strip absolute path prefix against filesDataPath', async () => {
      port = await startServer((req, res) => {
        lastRequest = { method: req.method ?? '', path: req.url ?? '' };
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(Buffer.from('x'));
      });
      const module = await Test.createTestingModule({
        providers: [
          HttpVersionControlProvider,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'STORAGE_SERVICE_URL')
                  return `http://127.0.0.1:${port}`;
                if (key === 'filesDataPath') return 'C:/data/files';
                return undefined;
              }),
            },
          },
          { provide: ClsService, useValue: { get: jest.fn() } },
        ],
      }).compile();
      provider = module.get(HttpVersionControlProvider);

      await provider.getFileContentAtRevision(
        'C:\\data\\files\\202601\\node1\\a.dwg',
        3
      );

      expect(lastRequest?.path).toBe(
        '/v1/svn/cat?path=202601%2Fnode1%2Fa.dwg&revision=3'
      );
    });

    it('should mark as failed when content is empty', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end();
      });
      provider = await createProvider();

      const result = await provider.getFileContentAtRevision(
        '202601/node1/a.dwg',
        5
      );

      expect(result.success).toBe(false);
    });

    it('should mark as failed on HTTP error', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      });
      provider = await createProvider();

      const result = await provider.getFileContentAtRevision(
        '202601/node1/a.dwg',
        5
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('获取失败');
    });
  });

  describe('commitNodeDirectory', () => {
    it('should POST svn commit with storage-relative path and JSON message', async () => {
      port = await startServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          lastRequest = {
            method: req.method ?? '',
            path: req.url ?? '',
            body: JSON.parse(body),
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, output: 'committed r7' }));
        });
      });
      provider = await createProvider();

      const result = await provider.commitNodeDirectory(
        '202601/node1',
        'Save: a.dwg',
        'user-1',
        'Alice'
      );

      expect(lastRequest?.method).toBe('POST');
      expect(lastRequest?.path).toBe('/v1/svn/commit');
      const body = lastRequest?.body as { path: string; message: string };
      expect(body.path).toBe('202601/node1');
      const parsed = JSON.parse(body.message);
      expect(parsed.type).toBe('file_operation');
      expect(parsed.message).toBe('Save: a.dwg');
      expect(parsed.userId).toBe('user-1');
      expect(parsed.userName).toBe('Alice');
      expect(result.success).toBe(true);
    });

    it('should return failure when commit fails', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'commit rejected' }));
      });
      provider = await createProvider();

      const result = await provider.commitNodeDirectory(
        '202601/node1',
        'Save: a.dwg'
      );

      expect(result.success).toBe(false);
    });
  });

  describe('commitFiles', () => {
    it('should POST commit per file path', async () => {
      const calls: Array<{ method: string; path: string; body?: unknown }> =
        [];
      port = await startServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          calls.push({
            method: req.method ?? '',
            path: req.url ?? '',
            body: JSON.parse(body),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      });
      provider = await createProvider();

      const result = await provider.commitFiles(
        ['202601/node1/a.dwg', '202601/node1/b.dwg'],
        'batch'
      );

      expect(result.success).toBe(true);
      expect(calls).toHaveLength(2);
      expect((calls[0].body as { path: string }).path).toBe(
        '202601/node1/a.dwg'
      );
      expect((calls[1].body as { path: string }).path).toBe(
        '202601/node1/b.dwg'
      );
    });

    it('should return success for empty file list', async () => {
      provider = await createProvider();
      const result = await provider.commitFiles([], 'no files');
      expect(result.success).toBe(true);
    });
  });

  describe('unsupported operations', () => {
    it('commitWorkingCopy should throw NotImplementedException', async () => {
      provider = await createProvider();
      await expect(
        provider.commitWorkingCopy('full backup')
      ).rejects.toThrow(NotImplementedException);
    });

    it('deleteNodeDirectory should throw NotImplementedException', async () => {
      provider = await createProvider();
      await expect(
        provider.deleteNodeDirectory('202601/node1')
      ).rejects.toThrow(NotImplementedException);
    });

    it('listDirectoryAtRevision should throw NotImplementedException', async () => {
      provider = await createProvider();
      await expect(
        provider.listDirectoryAtRevision('202601/node1', 5)
      ).rejects.toThrow(NotImplementedException);
    });
  });

  describe('isFirstCommit', () => {
    it('should return true when history is empty', async () => {
      port = await startServer((req, res) => {
        lastRequest = { method: req.method ?? '', path: req.url ?? '' };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ entries: [] }));
      });
      provider = await createProvider();

      expect(await provider.isFirstCommit('202601/node1')).toBe(true);
      expect(lastRequest?.path).toBe('/v1/svn/history?path=202601%2Fnode1');
    });

    it('should return false when history has entries', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            entries: [
              { revision: 1, message: 'init', author: 'a', timestamp: '' },
            ],
          })
        );
      });
      provider = await createProvider();

      expect(await provider.isFirstCommit('202601/node1')).toBe(false);
    });
  });

  describe('readiness', () => {
    it('isReady should return true', async () => {
      provider = await createProvider();
      expect(provider.isReady()).toBe(true);
    });

    it('ensureInitialized should resolve without error', async () => {
      provider = await createProvider();
      await expect(provider.ensureInitialized()).resolves.toBeUndefined();
    });
  });
});
