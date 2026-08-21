import { Test, type TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IStorageService } from '../storage/interfaces/storage-service.interface';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { ConversionRunner } from './conversion-runner';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  promises: {
    ...jest.requireActual('fs').promises,
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ConversionRunner', () => {
  let service: ConversionRunner;
  let mockModuleRef: any;
  let mockStorageService: any;
  let mockStorageManager: any;
  let mockConversionService: any;
  let mockRestrictionEngine: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReturnValue(true);

    mockConversionService = {
      convertServerFile: jest.fn(),
    };

    mockModuleRef = {
      get: jest.fn().mockReturnValue(mockConversionService),
    };

    mockStorageService = {};

    mockStorageManager = {
      getFullPath: jest.fn().mockImplementation((p: string) => `/data/files/${p}`),
    };

    mockRestrictionEngine = {
      reserveConversionCountOrThrow: jest.fn().mockResolvedValue(undefined),
      releaseConversionCount: jest.fn().mockResolvedValue(undefined),
      assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'batchDownload') return { maxConcurrency: 3 };
        return {};
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversionRunner,
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: IStorageService, useValue: mockStorageService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RestrictionEngine, useValue: mockRestrictionEngine },
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

  describe('convertFile', () => {
    it('should convert to dwg successfully', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(true);
      expect(result.format).toBe('dwg');
      expect(result.filePath).toContain('drawing.dwg');
      expect(mockConversionService.convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-1',
          fileHash: 'hash123',
          outname: 'drawing.dwg',
          createPreloadingData: false,
        }),
      );
    });

    it('should convert to pdf with defaults', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'pdf');

      expect(result.success).toBe(true);
      expect(result.format).toBe('pdf');
      expect(mockConversionService.convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({
          outname: 'drawing.pdf',
          width: '2000',
          height: '2000',
          colorPolicy: 'mono',
        }),
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
        }),
      );
    });

    it('should convert to dxf successfully', async () => {
      mockConversionService.convertServerFile.mockResolvedValue({ code: 0 });

      const result = await service.convertFile(mockNode, 'dxf');

      expect(result.success).toBe(true);
      expect(result.format).toBe('dxf');
      expect(mockConversionService.convertServerFile).toHaveBeenCalledWith(
        expect.objectContaining({ outname: 'drawing.dxf' }),
      );
    });

    it('should return error when file path is missing', async () => {
      const result = await service.convertFile(
        { id: 'node-2', name: 'test.dwg' },
        'dwg',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('File path is missing');
      expect(mockConversionService.convertServerFile).not.toHaveBeenCalled();
    });

    it('should return error when mxweb source file not found', async () => {
      const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
      mockFs.existsSync.mockReturnValue(false);

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('MXWEB file not found');
      expect(mockConversionService.convertServerFile).not.toHaveBeenCalled();
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
        new Error('engine crashed'),
      );

      const result = await service.convertFile(mockNode, 'dwg');

      expect(result.success).toBe(false);
      expect(result.error).toBe('engine crashed');
    });

    it('should return error when converted file not found on disk', async () => {
      const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
      mockFs.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

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
        Array.from({ length: 6 }, () => service.convertFile(mockNode, 'dwg')),
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
  });
});
