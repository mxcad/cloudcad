///////////////////////////////////////////////////////////////////////////////
// FileDownloadExportService 转换产物缓存行为测试
// 覆盖：未命中转换后写入缓存 / 命中免转换免配额 / 无 fileHash 不缓存 / TTL 过期重转
///////////////////////////////////////////////////////////////////////////////

import { NodeType } from '@cloudcad/db';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

describe('FileDownloadExportService - 转换产物缓存', () => {
  let service: FileDownloadExportService;
  let prisma: {
    fileSystemNode: { findUnique: jest.Mock };
  };
  let conversionMock: Record<string, jest.Mock>;
  let restrictionEngine: Record<string, jest.Mock>;
  let storageManagerGetFullPath: jest.Mock;
  let tmpRoot: string;
  let cacheDir: string;

  const fileHash = 'abcdef0123456789abcdef0123456789';
  const updatedAt = new Date('2026-08-25T00:00:00.000Z');
  const makeNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'node-1',
    name: 'test.dwg',
    originalName: 'test.dwg',
    path: 'files/n1.mxweb',
    fileHash,
    updatedAt,
    nodeType: NodeType.FILE,
    ...overrides,
  });

  const cacheKeyFor = (node: { id: string; updatedAt: Date }, suffix: string) =>
    `${node.id}-${node.updatedAt.getTime()}-${suffix}`;

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-cache-'));
    cacheDir = path.join(tmpRoot, 'cache');
    fs.mkdirSync(path.join(tmpRoot, 'files'), { recursive: true });

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
          conversionCacheDir: cacheDir,
          conversionCacheTtlHours: 1,
        };
      }
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

  /** 在转换输出位置预置产物（模拟 convertServerFile 写盘成功） */
  const stageConvertedOutput = (nodePath: string, outName: string) => {
    const outPath = path.join(tmpRoot, path.dirname(nodePath), outName);
    fs.writeFileSync(outPath, 'converted-content');
    return outPath;
  };

  it('缓存未命中：调用转换并把产物移入缓存目录（不再删除）', async () => {
    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    const outPath = stageConvertedOutput(node.path, 'test.dwg');
    conversionMock.convertServerFile.mockResolvedValue({ code: 0 });

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.DWG,
      { dwgVersion: 29 }
    );

    expect(conversionMock.convertServerFile).toHaveBeenCalledTimes(1);
    expect(result.cacheKey).toBe(cacheKeyFor(node, 'dwg-v29'));
    await collectStream(result.stream);

    // 产物已移入缓存目录且保留
    const cacheFile = path.join(cacheDir, `${result.cacheKey}.dwg`);
    expect(fs.existsSync(cacheFile)).toBe(true);
    expect(fs.readFileSync(cacheFile, 'utf-8')).toBe('converted-content');
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it('缓存命中：不调用转换、不占转换配额，直接返回缓存内容', async () => {
    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    const cacheFile = path.join(cacheDir, `${cacheKeyFor(node, 'dwg-v29')}.dwg`);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, 'cached-content');

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.DWG,
      { dwgVersion: 29 }
    );

    // 先消费流（关闭文件句柄）再断言，避免 Windows 下 afterEach 清理临时目录时报句柄占用
    const content = await collectStream(result.stream);

    expect(conversionMock.convertServerFile).not.toHaveBeenCalled();
    expect(restrictionEngine.reserveConversionCountOrThrow).not.toHaveBeenCalled();
    expect(content.toString('utf-8')).toBe('cached-content');
  });

  it('参数不同 → 缓存 key 不同（PDF 尺寸/颜色参与 key）', async () => {
    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    stageConvertedOutput(node.path, 'test.pdf');
    conversionMock.convertServerFile.mockResolvedValue({ code: 0 });

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.PDF,
      { width: '3000', height: '2000', colorPolicy: 'color' }
    );

    expect(result.cacheKey).toBe(`${node.id}-${updatedAt.getTime()}-pdf-3000x2000-color`);
  });

  it('无 updatedAt 的节点不缓存（转换后走旧行为删除临时文件）', async () => {
    const node = makeNode({ updatedAt: null });
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    const outPath = stageConvertedOutput(node.path, 'test.dwg');
    conversionMock.convertServerFile.mockResolvedValue({ code: 0 });

    const result = await service.downloadNodeWithFormat(
      node.id,
      'user-1',
      CadDownloadFormat.DWG
    );

    expect(result.cacheKey).toBeUndefined();
    await collectStream(result.stream);
    // 等待流 end 回调异步删除
    await new Promise((r) => setTimeout(r, 20));
    expect(fs.existsSync(outPath)).toBe(false);
    expect(fs.existsSync(cacheDir)).toBe(false);
  });

  it('缓存超过 TTL：视为未命中，重新转换', async () => {
    const node = makeNode();
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    const cacheFile = path.join(cacheDir, `${cacheKeyFor(node, 'dwg-v29')}.dwg`);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, 'stale-content');
    const expired = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(cacheFile, expired, expired);
    stageConvertedOutput(node.path, 'test.dwg');
    conversionMock.convertServerFile.mockResolvedValue({ code: 0 });

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

  it('节点更新（updatedAt 变化）后旧缓存失效，重新转换', async () => {
    // 编辑器保存只更新 updatedAt 不更新 fileHash——缓存 key 必须随 updatedAt 变化
    const oldUpdatedAt = new Date('2026-08-20T00:00:00.000Z');
    const node = makeNode({ updatedAt: new Date('2026-08-25T00:00:00.000Z') });
    prisma.fileSystemNode.findUnique.mockResolvedValue(node);
    const staleCache = path.join(
      cacheDir,
      `${node.id}-${oldUpdatedAt.getTime()}-dwg-v29.dwg`
    );
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(staleCache, 'stale-content');
    stageConvertedOutput(node.path, 'test.dwg');
    conversionMock.convertServerFile.mockResolvedValue({ code: 0 });

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
    const freshCache = path.join(cacheDir, `${result.cacheKey}.dwg`);
    expect(fs.existsSync(freshCache)).toBe(true);
    expect(fs.readFileSync(freshCache, 'utf-8')).toBe('converted-content');
  });
});
