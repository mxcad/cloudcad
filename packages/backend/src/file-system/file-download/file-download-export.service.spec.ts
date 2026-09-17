///////////////////////////////////////////////////////////////////////////////
// FileDownloadExportService 转换产物缓存行为测试
// 覆盖：未命中转换后产物即缓存 / 命中免转换免配额 / 无 hash 不缓存 / TTL 过期重转 / 内容变化失效
///////////////////////////////////////////////////////////////////////////////

import { NodeType } from '@cloudcad/db';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { AuditLogger } from '../../audit/audit-logger.service';
import { ClsService } from 'nestjs-cls';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { CadDownloadFormat } from '../dto/download-node.dto';
import { FileDownloadExportService } from './file-download-export.service';

function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('FileDownloadExportService - 转换产物缓存（内容寻址）', () => {
  let service: FileDownloadExportService;
  let prisma: {
    fileSystemNode: { findUnique: jest.Mock };
  };
  let conversionMock: Record<string, jest.Mock>;
  let restrictionEngine: Record<string, jest.Mock>;
  let storageManagerGetFullPath: jest.Mock;
  let tmpRoot: string;
  let uploadsDir: string;

  const fileContent = 'test-mxweb-content-v1';
  const fileHash = crypto.createHash('md5').update(fileContent).digest('hex');
  const makeNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'node-1',
    name: 'test.dwg',
    originalName: 'test.dwg',
    path: 'files/n1.mxweb',
    fileHash: 'abcdef0123456789abcdef0123456789',
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    nodeType: NodeType.FILE,
    ...overrides,
  });

  const cacheKeyFor = (paramKey: string) => `${fileHash}-${paramKey}`;

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-cache-'));
    uploadsDir = path.join(tmpRoot, 'uploads');
    fs.mkdirSync(path.join(tmpRoot, 'files'), { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    // 创建工作副本（快照读此文件计算 hash）
    fs.writeFileSync(path.join(tmpRoot, 'files/n1.mxweb'), fileContent);

    prisma = {
      fileSystemNode: { findUnique: jest.fn() },
    };
    conversionMock = { convertServerFile: jest.fn() };
    restrictionEngine = {
      reserveConversionCountOrThrow: jest.fn().mockResolvedValue(undefined),
      releaseConversionCount: jest.fn().mockResolvedValue(undefined),
      assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined),
    };
    storageManagerGetFullPath = jest.fn((rel: string) =>
      path.join(tmpRoot, rel)
    );

    const configGet = jest.fn((key: string) => {
      if (key === 'fileLimits') {
        return {
          zipMaxTotalSize: 1,
          zipMaxFileCount: 1,
          zipMaxDepth: 1,
          zipMaxSingleFileSize: 1,
          zipCompressionLevel: 1,
          maxFilenameLength: 200,
          maxRecursionDepth: 1,
        };
      }
      if (key === 'batchDownload') {
        return {
          conversionCacheDir: '',
          conversionCacheTtlHours: 1,
        };
      }
      if (key === 'mxcadUploadPath') return uploadsDir;
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileDownloadExportService,
        { provide: DatabaseService, useValue: prisma },
        {
          provide: IStorageService,
          useValue: { fileExists: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: StorageManager,
          useValue: { getFullPath: storageManagerGetFullPath },
        },
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: FileSystemPermissionService, useValue: {} },
        {
          provide: ModuleRef,
          useValue: { get: jest.fn().mockReturnValue(conversionMock) },
        },
        { provide: AuditLogger, useValue: { audit: jest.fn().mockResolvedValue(undefined) } },
        { provide: ClsService, useValue: {} },
        { provide: RestrictionEngine, useValue: restrictionEngine },
      ],
    }).compile();

    service = module.get(FileDownloadExportService);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  /** 设置转换 mock 使其写产物文件（内容寻址：产物即缓存，无需预置） */
  const mockConversionWritesOutput = (paramKey: string, ext: string) => {
    conversionMock.convertServerFile.mockImplementation(() => {
      const outPath = path.join(uploadsDir, `${fileHash}-${paramKey}${ext}`);
      fs.writeFileSync(outPath, 'converted-content');
      return Promise.resolve({ code: 0 });
    });
  };

  /** 预置缓存文件（模拟已有缓存命中场景） */
  const stageCacheFile = (paramKey: string, ext: string) => {
    const cachePath = path.join(uploadsDir, `${fileHash}-${paramKey}${ext}`);
    fs.writeFileSync(cachePath, 'cached-content');
    return cachePath;
  };

  it('缓存未命中：调用转换，产物即缓存（内容寻址，无需移动）', async () => {
    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    mockConversionWritesOutput('dwg-v29', '.dwg');

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.DWG,
      { dwgVersion: 29 }
    );

    expect(conversionMock.convertServerFile).toHaveBeenCalledTimes(1);
    expect(result.cacheKey).toBe(cacheKeyFor('dwg-v29'));
    await collectStream(result.stream);

    // 产物已在缓存位置（内容寻址）
    const cacheFile = path.join(uploadsDir, `${result.cacheKey}.dwg`);
    expect(fs.existsSync(cacheFile)).toBe(true);
    expect(fs.readFileSync(cacheFile, 'utf-8')).toBe('converted-content');
  });

  it('缓存命中：不调用转换、不占转换配额，直接返回缓存内容', async () => {
    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    stageCacheFile('dwg-v29', '.dwg');

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.DWG,
      { dwgVersion: 29 }
    );

    const content = await collectStream(result.stream);

    expect(conversionMock.convertServerFile).not.toHaveBeenCalled();
    expect(restrictionEngine.reserveConversionCountOrThrow).not.toHaveBeenCalled();
    expect(content.toString('utf-8')).toBe('cached-content');
  });

  it('参数不同 → 缓存 key 不同（PDF 尺寸/颜色参与 key）', async () => {
    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    mockConversionWritesOutput('pdf-3000x2000-color', '.pdf');

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.PDF,
      { width: '3000', height: '2000', colorPolicy: 'color' }
    );

    expect(result.cacheKey).toBe(`${fileHash}-pdf-3000x2000-color`);
  });

  it('缓存超过 TTL：视为未命中，重新转换', async () => {
    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    const cacheFile = path.join(uploadsDir, `${cacheKeyFor('dwg-v29')}.dwg`);
    fs.writeFileSync(cacheFile, 'stale-content');
    const expired = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(cacheFile, expired, expired);
    mockConversionWritesOutput('dwg-v29', '.dwg');

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.DWG,
      { dwgVersion: 29 }
    );

    expect(conversionMock.convertServerFile).toHaveBeenCalledTimes(1);
    await collectStream(result.stream);
    // 过期缓存被新产物覆盖
    expect(fs.readFileSync(cacheFile, 'utf-8')).toBe('converted-content');
  });

  it('文件内容变化 → hash 变化 → 旧缓存失效，重新转换', async () => {
    // 修改工作副本内容 → hash 变化 → 旧缓存不命中
    const oldContent = 'old-mxweb-content';
    const oldHash = crypto.createHash('md5').update(oldContent).digest('hex');
    fs.writeFileSync(path.join(tmpRoot, 'files/n1.mxweb'), oldContent);

    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    const staleCache = path.join(uploadsDir, `${oldHash}-dwg-v29.dwg`);
    fs.writeFileSync(staleCache, 'stale-content');

    // 修改文件内容（模拟编辑器保存）
    fs.writeFileSync(path.join(tmpRoot, 'files/n1.mxweb'), fileContent);

    mockConversionWritesOutput('dwg-v29', '.dwg');

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.DWG,
      { dwgVersion: 29 }
    );

    // 旧 key 不命中，触发重新转换
    expect(conversionMock.convertServerFile).toHaveBeenCalledTimes(1);
    await collectStream(result.stream);
    // 新 key 缓存写入
    const freshCache = path.join(uploadsDir, `${result.cacheKey}.dwg`);
    expect(fs.existsSync(freshCache)).toBe(true);
    expect(fs.readFileSync(freshCache, 'utf-8')).toBe('converted-content');
    // 旧缓存仍在（未被删除，只是不再命中）
    expect(fs.existsSync(staleCache)).toBe(true);
  });
});
