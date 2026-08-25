///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as fsPromises from 'fs/promises';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { Readable } from 'stream';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotImplementedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { HttpStorageProvider } from './http-storage.provider';

function collect(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('HttpStorageProvider', () => {
  let server: http.Server;
  let port: number;
  let provider: HttpStorageProvider;
  let lastRequest: { method: string; path: string; body?: unknown } | null;

  const startServer = async (
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<number> => {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    return (server.address() as AddressInfo).port;
  };

  const createProvider = async (): Promise<HttpStorageProvider> => {
    const module = await Test.createTestingModule({
      providers: [
        HttpStorageProvider,
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
    return module.get(HttpStorageProvider);
  };

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('file operations', () => {
    it('should GET a file and return a readable stream', async () => {
      port = await startServer((req, res) => {
        lastRequest = { method: req.method ?? '', path: req.url ?? '' };
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(Buffer.from('file-content'));
      });
      provider = await createProvider();

      const stream = await provider.read('202601/node1/a.dwg');

      expect((await collect(stream)).toString()).toBe('file-content');
      expect(lastRequest?.method).toBe('GET');
      expect(lastRequest?.path).toBe('/v1/files/202601%2Fnode1%2Fa.dwg');
    });

    it('should PUT a buffer as base64 body', async () => {
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
          res.end(JSON.stringify({ path: '202601/node1/a.dwg', size: 4 }));
        });
      });
      provider = await createProvider();

      await provider.write('202601/node1/a.dwg', Buffer.from('data'));

      expect(lastRequest?.method).toBe('PUT');
      expect(lastRequest?.body).toEqual({
        contents: Buffer.from('data').toString('base64'),
      });
    });

    it('should PUT a string body as base64', async () => {
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
          res.end(JSON.stringify({ path: 'a.txt', size: 5 }));
        });
      });
      provider = await createProvider();

      await provider.write('a.txt', 'hello');

      expect(lastRequest?.body).toEqual({
        contents: Buffer.from('hello').toString('base64'),
      });
    });

    it('should DELETE a file', async () => {
      port = await startServer((req, res) => {
        lastRequest = { method: req.method ?? '', path: req.url ?? '' };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ deleted: true }));
      });
      provider = await createProvider();

      await provider.delete('202601/node1/a.dwg');

      expect(lastRequest?.method).toBe('DELETE');
    });

    it('should return true for exists on 200 and false on failure', async () => {
      let fail = false;
      port = await startServer((_req, res) => {
        if (fail) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end('x');
        }
      });
      provider = await createProvider();

      expect(await provider.exists('202601/node1/a.dwg')).toBe(true);
      fail = true;
      expect(await provider.exists('202601/node1/a.dwg')).toBe(false);
    });

    it('should copy a local FS file via readFile + PUT', async () => {
      const tmpDir = await fsPromises.mkdtemp(
        path.join(os.tmpdir(), 'http-storage-')
      );
      const srcPath = path.join(tmpDir, 'src.dwg');
      await fsPromises.writeFile(srcPath, Buffer.from('file-bytes'));
      try {
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
            res.end(JSON.stringify({ path: '202601/node1/a.dwg', size: 10 }));
          });
        });
        provider = await createProvider();

        await provider.copyFromFs(srcPath, '202601/node1/a.dwg');

        expect(lastRequest?.method).toBe('PUT');
        expect(lastRequest?.path).toBe('/v1/files/202601%2Fnode1%2Fa.dwg');
        expect(lastRequest?.body).toEqual({
          contents: Buffer.from('file-bytes').toString('base64'),
        });
      } finally {
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should return metadata via GET fallback', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': '12',
        });
        res.end(Buffer.from('file-content'));
      });
      provider = await createProvider();

      const meta = await provider.getMetaData('202601/node1/a.dwg');

      expect(meta.contentLength).toBe(12);
      expect(meta.contentType).toBe('application/octet-stream');
      expect(meta.etag).toBe('');
    });

    it('should throw when GET fails for metadata (404 → getFileInfo returns null)', async () => {
      port = await startServer((_req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
      });
      provider = await createProvider();

      await expect(provider.getMetaData('missing.dwg')).rejects.toThrow(/404/);
    });
  });

  describe('unsupported operations (storage-service 无对应接口)', () => {
    it.each([
      ['copy', () => provider.copy('a', 'b')],
      ['move', () => provider.move('a', 'b')],
      ['listAll', () => provider.listAll('prefix')],
      ['deleteAll', () => provider.deleteAll('prefix')],
      ['getUrl', () => provider.getUrl('key')],
    ])('%s should throw NotImplementedException', async (_name, fn) => {
      provider = await createProvider();
      await expect(fn()).rejects.toThrow(NotImplementedException);
    });
  });
});
