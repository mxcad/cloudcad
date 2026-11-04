///////////////////////////////////////////////////////////////////////////////
// FileDownloadExportConversionService 预转换/缓存测试
// 覆盖：precomputeExport 缓存未命中走真实转换 / 命中免转换 / mxweb 直下免转 /
// 非 CAD 免转 / 目录节点免转
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
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { CadDownloadFormat } from '../dto/download-node.dto';
import { FileDownloadExportConversionService } from './file-download-export-conversion.service';

describe('FileDownloadExportConversionService - precomputeExport', () => {
  let service: FileDownloadExportConversionService;
  let prisma: {
    fileSystemNode: { findUnique: jest.Mock };
  };
  let conversionMock: Record<string, jest.Mock>;
  let restrictionEngine: Record<string, jest.Mock>;
  let tmpRoot: string;
  let uploadsDir: string;

  const fileContent = 'precompute-mxweb-content';
  const fileHash = crypto.createHash('md5').update(fileContent).digest('hex');

  const makeNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'node-1',
    name: 'test.dwg',
    originalName: 'test.dwg',
    path: 'files/n1.mxweb',
    fileHash: 'abcdef0123456789abcdef0123456789',
    nodeType: NodeType.FILE,
    ...overrides,
  });

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'precompute-'));
    uploadsDir = path.join(tmpRoot, 'uploads');
    fs.mkdirSync(path.join(tmpRoot, 'files'), { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'files/n1.mxweb'), fileContent);

    prisma = {
      fileSystemNode: { findUnique: jest.fn() },
    };
    conversionMock = { convertServerFile: jest.fn() };
    restrictionEngine = {
      withConversionQuota: jest.fn(
        async (_principal: unknown, fn: () => Promise<unknown>) => fn()
      ),
    };

    const configGet = jest.fn((key: string) => {
      if (key === 'fileLimits') {
        return { maxFilenameLength: 200 };
      }
      if (key === 'batchDownload') {
        return { conversionCacheDir: '', conversionCacheTtlHours: 1 };
      }
      if (key === 'mxcadUploadPath') return uploadsDir;
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileDownloadExportConversionService,
        { provide: DatabaseService, useValue: prisma },
        {
          provide: IStorageService,
          useValue: { fileExists: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: StorageManager,
          useValue: {
            getFullPath: (rel: string) => path.join(tmpRoot, rel),
          },
        },
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: ModuleRef,
          useValue: { get: jest.fn().mockReturnValue(conversionMock) },
        },
        { provide: RestrictionEngine, useValue: restrictionEngine },
      ],
    }).compile();

    service = module.get(FileDownloadExportConversionService);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('缓存未命中：走真实转换，产物即缓存，返回 {alreadyCached:false, cacheKey}', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(makeNode());
    conversionMock.convertServerFile.mockImplementation(() => {
      const outPath = path.join(uploadsDir, `${fileHash}-dwg-v29.dwg`);
      fs.writeFileSync(outPath, 'converted');
      return Promise.resolve({ code: 0 });
    });

    const result = await service.precomputeExport(
      'node-1',
      'user-1',
      CadDownloadFormat.DWG,
      { dwgVersion: 29 }
    );

    expect(result).toEqual({
      alreadyCached: false,
      cacheKey: `${fileHash}-dwg-v29`,
    });
    expect(conversionMock.convertServerFile).toHaveBeenCalledTimes(1);
    const cacheFile = path.join(uploadsDir, `${fileHash}-dwg-v29.dwg`);
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  it('缓存命中：不调用转换，直接返回 {alreadyCached:true, cacheKey}', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(makeNode());
    const cachePath = path.join(uploadsDir, `${fileHash}-dwg-v29.dwg`);
    fs.writeFileSync(cachePath, 'cached');

    const result = await service.precomputeExport(
      'node-1',
      'user-1',
      CadDownloadFormat.DWG,
      { dwgVersion: 29 }
    );

    expect(result).toEqual({
      alreadyCached: true,
      cacheKey: `${fileHash}-dwg-v29`,
    });
    expect(conversionMock.convertServerFile).not.toHaveBeenCalled();
  });

  it('mxweb 直下：无需转换，返回 {alreadyCached:true, cacheKey:null}', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(makeNode());

    const result = await service.precomputeExport(
      'node-1',
      'user-1',
      CadDownloadFormat.MXWEB
    );

    expect(result).toEqual({ alreadyCached: true, cacheKey: null });
    expect(conversionMock.convertServerFile).not.toHaveBeenCalled();
  });

  it('非 CAD 文件：无格式转换，返回 {alreadyCached:false, cacheKey:null}', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(
      makeNode({ name: 'readme.txt', originalName: 'readme.txt' })
    );

    const result = await service.precomputeExport(
      'node-1',
      'user-1',
      CadDownloadFormat.PDF
    );

    expect(result).toEqual({ alreadyCached: false, cacheKey: null });
    expect(conversionMock.convertServerFile).not.toHaveBeenCalled();
  });

  it('目录节点：无格式转换可预计算，返回 {alreadyCached:false, cacheKey:null}', async () => {
    prisma.fileSystemNode.findUnique.mockResolvedValue(
      makeNode({ nodeType: NodeType.FOLDER, name: 'folder', originalName: 'folder' })
    );

    const result = await service.precomputeExport(
      'node-1',
      'user-1',
      CadDownloadFormat.PDF
    );

    expect(result).toEqual({ alreadyCached: false, cacheKey: null });
    expect(conversionMock.convertServerFile).not.toHaveBeenCalled();
  });
});
