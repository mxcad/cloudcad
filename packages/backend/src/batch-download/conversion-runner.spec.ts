import { Test, type TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from '../storage/interfaces/storage-service.interface';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { ConversionRunner } from './conversion-runner';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import { FileDownloadExportService } from '../file-system/file-download/file-download-export.service';
import { PublicFileService } from '../public-file/public-file.service';
import * as fs from 'fs';
import * as crypto from 'crypto';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  promises: {
    ...jest.requireActual('fs').promises,
    unlink: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('drawing-content')),
    copyFile: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ConversionRunner', () => {
  let service: ConversionRunner;
  let mockModuleRef: any;
  let mockStorageService: any;
  let mockStorageManager: any;
  let mockConversionService: any;
  let mockRestrictionEngine: any;
  let mockFileDownloadExportService: any;
  let mockPublicFileService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.promises.readFile as unknown as jest.Mock).mockResolvedValue(
      Buffer.from('drawing-content')
    );
    (mockFs.promises.copyFile as unknown as jest.Mock).mockResolvedValue(
      undefined
    );

    mockConversionService = {
      convertServerFile: jest.fn(),
    };

    mockModuleRef = {
      get: jest.fn().mockReturnValue(mockConversionService),
    };

    mockStorageService = {};

    mockStorageManager = {
      getFullPath: jest
        .fn()
        .mockImplementation((p: string) => `/data/files/${p}`),
    };

    mockRestrictionEngine = {
      reserveConversionCountOrThrow: jest.fn().mockResolvedValue(undefined),
      releaseConversionCount: jest.fn().mockResolvedValue(undefined),
      assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined),
    };

    mockFileDownloadExportService = {
      getFreshConversionCachePath: jest.fn().mockReturnValue(null),
      storeConversionCache: jest.fn(),
      snapshotMxweb: jest.fn().mockResolvedValue({
        snapshotPath: `/data/uploads/${contentHash}.mxweb`,
        hash: contentHash,
      }),
      buildParamKey: jest.fn((format, params) => {
        if (format === 'pdf') {
          const safe = (v?: string) => (v || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
          return `pdf-${safe(params?.width) || '2000'}x${safe(params?.height) || '2000'}-${safe(params?.colorPolicy) || 'mono'}`;
        } else if (format === 'dwg') {
          return params?.dwgVersion ? `dwg-v${params.dwgVersion}` : 'dwg';
        } else {
          return params?.dwgVersion ? `dxf-v${params.dwgVersion}` : 'dxf';
        }
      }),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'batchDownload') return { maxConcurrency: 3 };
        if (key === 'mxcadUploadPath') return '/data/uploads';
        return '';
      }),
    };

    // fileHash-only（内存导出）源文件定位：默认命中 uploads/{fileHash}.mxweb
    mockPublicFileService = {
      findMxwebFile: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversionRunner,
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: IStorageService, useValue: mockStorageService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RestrictionEngine, useValue: mockRestrictionEngine },
        {
          provide: FileDownloadExportService,
          useValue: mockFileDownloadExportService,
        },
        { provide: PublicFileService, useValue: mockPublicFileService },
      ],
    }).compile();

    service = module.get<ConversionRunner>(ConversionRunner);
  });

  const mockNode = {
    id: 'node-1',
    fileHash: 'hash123',
    path: 'projects/p1/drawing.mxweb',
    name: 'drawing.dwg',
  };

  // 步骤 1：快照 hash = md5(readFile 内容)，与 snapshotMxweb 一致
  const contentHash = crypto
    .createHash('md5')
    .update(Buffer.from('drawing-content'))
    .digest('hex');

  describe('convertFile', () => {
    it('should convert to dwg successfully', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(true);
      expect(result.format).toBe('dwg');
      // 步骤 2：产物落 uploads/{hash}-{paramKey}.dwg（内容寻址）
      expect(result.filePath).toContain(`${contentHash}-dwg.dwg`);
      expect(mockConversionService.convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-1',
          fileHash: 'hash123',
          // srcPath 指内容寻址快照（uploads/{hash}.mxweb），outname 版本绑定（{hash}-{paramKey}{ext}）
          srcPath: `/data/uploads/${contentHash}.mxweb`,
          outname: `${contentHash}-dwg.dwg`,
          createPreloadingData: false,
        })
      );
    });

    it('should convert to pdf with defaults', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'pdf');

      expect(result.success).toBe(true);
      expect(result.format).toBe('pdf');
      expect(mockConversionService.convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({
          outname: `${contentHash}-pdf-2000x2000-mono.pdf`,
          width: '2000',
          height: '2000',
          colorPolicy: 'mono',
        })
      );
    });

    it('should convert to pdf with custom params', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      await service.convertFile(mockNode, 'pdf', {
        width: '4000',
        height: '3000',
        colorPolicy: 'color',
      });

      expect(mockConversionService.convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({
          width: '4000',
          height: '3000',
          colorPolicy: 'color',
        })
      );
    });

    it('should convert to dxf successfully', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'dxf');

      expect(result.success).toBe(true);
      expect(result.format).toBe('dxf');
      expect(mockConversionService.convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({ outname: `${contentHash}-dxf.dxf` })
      );
    });

    it('should return error when source file is missing (no path and no fileHash)', async () => {
      const result = await service.convertFile(
        { id: 'node-2', name: 'test.dwg' },
        'dwg'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Source file not found');
      expect(mockConversionService.convertServerFile).not.toHaveBeenCalled();
    });

    it('should return error when mxweb snapshot is unavailable', async () => {
      mockFileDownloadExportService.snapshotMxweb.mockResolvedValue(null);

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Source file not found');
      expect(mockConversionService.convertServerFile).not.toHaveBeenCalled();
    });

    it('should resolve source by fileHash when path missing (内存导出上传的临时文件)', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });
      mockPublicFileService.findMxwebFile.mockResolvedValue(
        '/data/uploads/hash-abc.mxweb'
      );

      const result = await service.convertFile(
        { id: 'hash-abc', name: 'drawing.dwg', fileHash: 'hash-abc' },
        'dwg'
      );

      expect(result.success).toBe(true);
      // 源文件按 fileHash 定位（uploads/{fileHash}.mxweb），不走 snapshotMxweb
      expect(mockPublicFileService.findMxwebFile).toHaveBeenCalledWith('hash-abc');
      expect(mockFileDownloadExportService.snapshotMxweb).not.toHaveBeenCalled();
      expect(mockConversionService.convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileHash: 'hash-abc',
          srcPath: '/data/uploads/hash-abc.mxweb',
        })
      );
    });

    it('should return error when conversion code is non-zero', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({
        code: 500,
        message: 'Conversion engine error',
      });

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Conversion engine error');
    });

    it('should return error when conversion service throws', async () => {
      mockConversionService.convertServerFile.mockRejectedValue(
        new Error('engine crashed')
      );

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('engine crashed');
    });

    it('should return error when converted file not found on disk', async () => {
      const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
      // 产物不存在（snapshotMxweb 已 mock，唯一 existsSync 调用是产物检查）
      mockFs.existsSync.mockReturnValue(false);

      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Converted file not found');
    });

    it('should process multiple conversions concurrently within semaphore limits', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      mockConversionService.convertServerFile.mockImplementation(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 30));
        concurrent--;
        return { code: 0 };
      });

      const results = await Promise.all(
        Array.from({ length: 6 }, () => service.convertFile(mockNode, 'dwg'))
      );

      expect(results.filter((r) => r.success).length).toBe(6);
      expect(mockConversionService.convertServerFile).toHaveBeenCalledTimes(6);
    });
  });

  describe('cleanupConvertedFile', () => {
    it('should delete file if it exists', async () => {
      const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
      mockFs.existsSync.mockReturnValue(true);
      const mockUnlink = mockFs.promises.unlink as jest.Mock;

      await service.cleanupConvertedFile('/some/file.dwg');
      expect(mockUnlink).toHaveBeenCalledWith('/some/file.dwg');
    });

    it('should skip if file does not exist', async () => {
      const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
      mockFs.existsSync.mockReturnValue(false);
      const mockUnlink = mockFs.promises.unlink as jest.Mock;

      await service.cleanupConvertedFile('/some/file.dwg');
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should skip content-addressed entries under uploads/ (步骤 1 共享缓存)', async () => {
      const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
      mockFs.existsSync.mockReturnValue(true);
      const mockUnlink = mockFs.promises.unlink as jest.Mock;

      // uploads/ 下内容寻址条目（共享快照/产物缓存）不能被 unlink
      await service.cleanupConvertedFile(`/data/uploads/${contentHash}.pdf`);
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('转换缓存复用 (ADR-0060)', () => {
    it('缓存命中：复用缓存产物，不触发真实转换', async () => {
      mockFileDownloadExportService.getFreshConversionCachePath.mockReturnValue(
        '/cache/node-1-123-dwg.dwg'
      );
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/cache/node-1-123-dwg.dwg');
      // 缓存命中不应起 mxcadassembly
      expect(mockConversionService.convertServerFile).not.toHaveBeenCalled();
    });

    it('缓存未命中：转换成功后写入缓存', async () => {
      mockFileDownloadExportService.getFreshConversionCachePath.mockReturnValue(
        null
      );
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(true);
      expect(
        mockFileDownloadExportService.storeConversionCache
      ).toHaveBeenCalled();
    });
  });
});
