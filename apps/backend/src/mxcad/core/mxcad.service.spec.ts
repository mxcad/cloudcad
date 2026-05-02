///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { MxCadService } from './mxcad.service';
import { FileUploadManagerFacadeService } from '../facade/file-upload-manager-facade.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { ExternalReferenceUpdateService } from '../external-ref/external-reference-update.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { VersionControlService } from '../../version-control/version-control.service';
import { DatabaseService } from '../../database/database.service';

// ---------------------------------------------------------------------------
// Module-level mocks — must use plain functions (not jest.fn()) because the
// global jest config has resetMocks: true which clears all jest.fn()
// implementations between tests.
// ---------------------------------------------------------------------------

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: () => true,
    unlinkSync: () => undefined,
    copyFileSync: () => undefined,
    statSync: () => ({ size: 1024 }),
    readFileSync: () => Buffer.from(''),
  };
});

jest.mock('fs/promises', () => ({
  mkdir: () => Promise.resolve(),
  copyFile: () => Promise.resolve(),
  unlink: () => Promise.resolve(),
  readFile: () => Promise.resolve(Buffer.from('')),
  access: () => Promise.resolve(),
  stat: () => Promise.resolve({ size: 1024 }),
}));

jest.mock('../infra/thumbnail-utils', () => ({
  findThumbnail: () => Promise.resolve(null),
  findThumbnailSync: () => null,
  getThumbnailFileName: (fmt: string) => `thumbnail.${fmt}`,
  getMimeType: () => 'image/webp',
  THUMBNAIL_FORMATS: ['webp', 'jpg', 'png'],
  THUMBNAIL_BASE_NAME: 'thumbnail',
}));

describe('MxCadService', () => {
  let service: MxCadService;

  const mockFacade = {
    checkChunkExist: jest.fn(),
    checkFileExist: jest.fn(),
    uploadChunk: jest.fn(),
    uploadAndConvertFile: jest.fn(),
    mergeChunksWithPermission: jest.fn(),
    uploadAndConvertFileWithPermission: jest.fn(),
    handleExternalReferenceImage: jest.fn(),
    handleExternalReferenceFile: jest.fn(),
  };

  const mockNodeService = {
    findById: jest.fn(),
    findByPath: jest.fn(),
    inferContextForMxCadApp: jest.fn(),
    getMimeType: jest.fn(),
  };

  const mockConversionService = {
    convertFile: jest.fn(),
    convertFileAsync: jest.fn(),
    needsConversion: jest.fn(),
    getConvertedExtension: jest.fn(),
    convertBinToMxweb: jest.fn(),
  };

  const mockExtRefUpdateService = {
    getPreloadingData: jest.fn(),
    checkExists: jest.fn(),
    getStats: jest.fn(),
    updateInfo: jest.fn(),
    updateAfterUpload: jest.fn(),
  };

  const mockStorageManager = {
    getFullPath: jest.fn().mockReturnValue('/abs/path/file.mxweb'),
  };

  const mockVersionControl = {
    commitNodeDirectory: jest.fn(),
  };

  const mockPrisma = {
    fileSystemNode: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, opts?: any) => {
      if (key === 'mxcadUploadPath') return '/fake/upload';
      if (key === 'nodeEnv') return 'test';
      if (opts?.infer) {
        if (key === 'mxcadUploadPath') return '/fake/upload';
        if (key === 'nodeEnv') return 'test';
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxCadService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileUploadManagerFacadeService, useValue: mockFacade },
        { provide: FileSystemNodeService, useValue: mockNodeService },
        { provide: FileConversionService, useValue: mockConversionService },
        { provide: ExternalReferenceUpdateService, useValue: mockExtRefUpdateService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: VersionControlService, useValue: mockVersionControl },
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    })
      .setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() })
      .compile();

    service = module.get<MxCadService>(MxCadService);
  });

  // ==================== checkChunkExist ====================
  describe('checkChunkExist', () => {
    it('delegates to facade with validated context', async () => {
      mockFacade.checkChunkExist.mockResolvedValue({ ret: 'chunkAlreadyExist' });
      const r = await service.checkChunkExist(0, 'abc', 100, 2, 'f.dwg', {
        userId: 'u1', nodeId: 'n1', userRole: 'USER',
      } as any);
      expect(r.ret).toBe('chunkAlreadyExist');
      expect(mockFacade.checkChunkExist).toHaveBeenCalledWith(
        expect.objectContaining({ chunk: 0, hash: 'abc', name: 'f.dwg' }),
      );
    });

    it('creates mock context in test environment when context is null', async () => {
      mockFacade.checkChunkExist.mockResolvedValue({ ret: 'chunkNoExist' });
      const r = await service.checkChunkExist(0, 'abc', 100, 2, 'f.dwg');
      expect(r.ret).toBe('chunkNoExist');
    });
  });

  // ==================== checkFileExist ====================
  describe('checkFileExist', () => {
    it('delegates to facade', async () => {
      mockFacade.checkFileExist.mockResolvedValue({ ret: 'fileAlreadyExist' });
      const r = await service.checkFileExist('f.dwg', 'abc', { userId: 'u1', nodeId: 'n1' } as any);
      expect(r.ret).toBe('fileAlreadyExist');
    });
  });

  // ==================== checkDuplicateFile ====================
  describe('checkDuplicateFile', () => {
    it('returns isDuplicate=true when existing file found', async () => {
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'existing-1', name: 'f.dwg' });
      const r = await service.checkDuplicateFile('f.dwg', 'abc', 'folder-1');
      expect(r.isDuplicate).toBe(true);
      expect(r.existingNodeId).toBe('existing-1');
    });

    it('returns isDuplicate=false when no duplicate', async () => {
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue(null);
      const r = await service.checkDuplicateFile('f.dwg', 'abc', 'folder-1');
      expect(r.isDuplicate).toBe(false);
    });

    it('excludes currentFileId when provided', async () => {
      mockPrisma.fileSystemNode.findFirst.mockResolvedValue(null);
      await service.checkDuplicateFile('f.dwg', 'abc', 'folder-1', 'current-1');
      expect(mockPrisma.fileSystemNode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'current-1' },
          }),
        }),
      );
    });

    it('re-throws prisma errors', async () => {
      mockPrisma.fileSystemNode.findFirst.mockRejectedValue(new Error('DB error'));
      await expect(service.checkDuplicateFile('f.dwg', 'abc', 'f-1')).rejects.toThrow('DB error');
    });
  });

  // ==================== uploadChunk / uploadChunkWithPermission ====================
  describe('uploadChunk', () => {
    it('delegates uploadChunk to facade', async () => {
      mockFacade.uploadChunk.mockResolvedValue({ ret: 'ok' });
      const r = await service.uploadChunk('abc', 'f.dwg', 100, 0, 2, { userId: 'u1', nodeId: 'n1' } as any);
      expect(r.ret).toBe('ok');
    });

    it('delegates uploadChunkWithPermission', async () => {
      mockFacade.uploadChunk.mockResolvedValue({ ret: 'ok', nodeId: 'n1' });
      const r = await service.uploadChunkWithPermission('abc', 'f.dwg', 100, 0, 2, { userId: 'u1', nodeId: 'n1' } as any);
      expect(r.ret).toBe('ok');
    });
  });

  // ==================== uploadAndConvertFile ====================
  describe('uploadAndConvertFile', () => {
    it('creates default context and delegates', async () => {
      mockFacade.uploadAndConvertFile.mockResolvedValue({ ret: 'ok' });
      const r = await service.uploadAndConvertFile('/tmp/f.dwg', 'abc', 'f.dwg', 100);
      expect(r.ret).toBe('ok');
    });
  });

  // ==================== uploadAndConvertFileWithPermission ====================
  describe('uploadAndConvertFileWithPermission', () => {
    it('delegates to facade', async () => {
      mockFacade.uploadAndConvertFileWithPermission.mockResolvedValue({ ret: 'ok', nodeId: 'n1' });
      const r = await service.uploadAndConvertFileWithPermission('/tmp/f.dwg', 'abc', 'f.dwg', 100, { userId: 'u1', nodeId: 'n1' } as any);
      expect(r.ret).toBe('ok');
    });
  });

  // ==================== mergeChunksWithPermission ====================
  describe('mergeChunksWithPermission', () => {
    it('delegates to facade with srcDwgNodeId', async () => {
      mockFacade.mergeChunksWithPermission.mockResolvedValue({ ret: 'ok', nodeId: 'n1' });
      const r = await service.mergeChunksWithPermission('abc', 'f.dwg', 100, 2, { userId: 'u1', nodeId: 'n1' } as any, 'src-1');
      expect(r.ret).toBe('ok');
      expect(mockFacade.mergeChunksWithPermission).toHaveBeenCalledWith(
        expect.objectContaining({ srcDwgNodeId: 'src-1' }),
      );
    });
  });

  // ==================== convertServerFile ====================
  describe('convertServerFile', () => {
    it('returns error for null param', async () => {
      const r = await service.convertServerFile(null as any);
      expect(r).toEqual({ code: 12, message: 'param error' });
    });

    it('performs sync conversion successfully', async () => {
      mockConversionService.convertFile.mockResolvedValue({ isOk: true, ret: { code: 0 } });
      const r = await service.convertServerFile({ srcPath: '/f.dwg', fileHash: 'abc' });
      expect(r).toEqual({ code: 0 });
    });

    it('returns error on sync conversion failure', async () => {
      mockConversionService.convertFile.mockResolvedValue({ isOk: false, ret: { code: 1 }, error: 'failed' });
      const r = await service.convertServerFile({ srcPath: '/f.dwg', fileHash: 'abc' });
      expect(r).toEqual({ code: 12, message: 'param error' });
    });

    it('handles async conversion', async () => {
      mockConversionService.convertFileAsync.mockResolvedValue('task-1');
      const r = await service.convertServerFile({
        srcPath: '/f.dwg', fileHash: 'abc', async: 'true', resultposturl: 'http://cb',
      });
      expect(r).toEqual({ code: 0, message: 'async calling' });
    });

    it('falls back param field names (_srcpath vs auto)', async () => {
      mockConversionService.convertFile.mockResolvedValue({ isOk: true, ret: { code: 0 } });
      const r = await service.convertServerFile({ srcpath: '/f.dwg', src_file_md5: 'abc' } as any);
      expect(r).toEqual({ code: 0 });
    });

    it('catches exceptions and returns error object', async () => {
      mockConversionService.convertFile.mockRejectedValue(new Error('Unexpected error'));
      const r = await service.convertServerFile({ srcPath: '/f.dwg', fileHash: 'abc' });
      expect(r).toEqual({ code: 12, message: 'param error' });
    });
  });

  // ==================== checkTzStatus ====================
  describe('checkTzStatus', () => {
    it('always returns code 0', async () => {
      expect(await service.checkTzStatus('any-hash')).toEqual({ code: 0 });
    });
  });

  // ==================== getPreloadingData / checkExternalReferenceExists ====================
  describe('external reference queries', () => {
    it('getPreloadingData delegates', async () => {
      mockExtRefUpdateService.getPreloadingData.mockResolvedValue({ externalReference: [], images: [] });
      expect(await service.getPreloadingData('n1')).toEqual({ externalReference: [], images: [] });
    });

    it('checkExternalReferenceExists delegates', async () => {
      mockExtRefUpdateService.checkExists.mockResolvedValue(true);
      expect(await service.checkExternalReferenceExists('n1', 'ref.dwg')).toBe(true);
    });
  });

  // ==================== inferContextForMxCadApp ====================
  describe('inferContextForMxCadApp', () => {
    it('delegates to nodeService', async () => {
      mockNodeService.inferContextForMxCadApp.mockResolvedValue({ nodeId: 'n1', userId: 'u1', userRole: 'USER' });
      const r = await service.inferContextForMxCadApp('abc', {} as any);
      expect(r).toEqual({ nodeId: 'n1', userId: 'u1', userRole: 'USER' });
    });
  });

  // ==================== getFileSystemNodeByPath / getFileSystemNodeByNodeId ====================
  describe('node queries', () => {
    it('getFileSystemNodeByPath delegates', async () => {
      mockNodeService.findByPath.mockResolvedValue({ id: 'n1' });
      expect(await service.getFileSystemNodeByPath('path')).toEqual({ id: 'n1' });
    });

    it('getFileSystemNodeByNodeId delegates', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1' });
      expect(await service.getFileSystemNodeByNodeId('n1')).toEqual({ id: 'n1' });
    });
  });

  // ==================== external reference management ====================
  describe('external reference management', () => {
    it('getExternalReferenceStats delegates', async () => {
      mockExtRefUpdateService.getStats.mockResolvedValue({ hasMissing: false, missingCount: 0, totalCount: 0, references: [] });
      const r = await service.getExternalReferenceStats('n1');
      expect(r.totalCount).toBe(0);
    });

    it('updateExternalReferenceInfo delegates', async () => {
      const stats = { hasMissing: false, missingCount: 0, totalCount: 0, references: [] };
      await service.updateExternalReferenceInfo('n1', stats as any);
      expect(mockExtRefUpdateService.updateInfo).toHaveBeenCalledWith('n1', stats);
    });

    it('updateExternalReferenceAfterUpload delegates', async () => {
      await service.updateExternalReferenceAfterUpload('n1');
      expect(mockExtRefUpdateService.updateAfterUpload).toHaveBeenCalledWith('n1');
    });
  });

  // ==================== external reference file operations ====================
  describe('external reference file ops', () => {
    it('handleExternalReferenceImage delegates', async () => {
      await service.handleExternalReferenceImage('hash', 'src', 'ref.png', '/tmp/f.png', {} as any);
      expect(mockFacade.handleExternalReferenceImage).toHaveBeenCalled();
    });

    it('handleExternalReferenceFile delegates', async () => {
      await service.handleExternalReferenceFile('hash', 'src', 'ref.dwg', '/tmp/f.dwg');
      expect(mockFacade.handleExternalReferenceFile).toHaveBeenCalled();
    });
  });

  // ==================== checkThumbnailExists ====================
  describe('checkThumbnailExists', () => {
    it('returns exists=false when node not found', async () => {
      mockNodeService.findById.mockResolvedValue(null);
      const r = await service.checkThumbnailExists('n1');
      expect(r.exists).toBe(false);
      expect(r.location).toBe('none');
    });

    it('returns exists=false when node has no path', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: null, fileHash: 'abc' });
      const r = await service.checkThumbnailExists('n1');
      expect(r.exists).toBe(false);
    });

    it('returns exists=false when node has no fileHash', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '/p/f.mxweb', fileHash: null });
      const r = await service.checkThumbnailExists('n1');
      expect(r.exists).toBe(false);
    });

    it('returns exists=false when thumbnail not found (findThumbnail returns null)', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', fileHash: 'abc' });
      const r = await service.checkThumbnailExists('n1');
      expect(r.exists).toBe(false);
      expect(r.location).toBe('none');
    });

    it('handles exceptions gracefully', async () => {
      mockNodeService.findById.mockRejectedValue(new Error('error'));
      const r = await service.checkThumbnailExists('n1');
      expect(r.exists).toBe(false);
    });
  });

  // ==================== uploadThumbnail ====================
  describe('uploadThumbnail', () => {
    it('returns failure when node not found', async () => {
      mockNodeService.findById.mockResolvedValue(null);
      const r = await service.uploadThumbnail('n1', '/tmp/f.png');
      expect(r.success).toBe(false);
      expect(r.message).toContain('节点不存在');
    });

    it('returns failure when node has no path', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: null });
      const r = await service.uploadThumbnail('n1', '/tmp/f.png');
      expect(r.success).toBe(false);
    });

    it('returns failure for unsupported format', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', fileHash: 'abc' });
      const r = await service.uploadThumbnail('n1', '/tmp/f.gif');
      expect(r.success).toBe(false);
      expect(r.message).toContain('不支持');
    });

    it('succeeds for valid png thumbnail', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', fileHash: 'abc' });
      const r = await service.uploadThumbnail('n1', '/tmp/f.png');
      expect(r.success).toBe(true);
      expect(r.fileName).toBe('thumbnail.png');
    });

    it('succeeds for jpg thumbnail', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', fileHash: 'abc' });
      const r = await service.uploadThumbnail('n1', '/tmp/f.jpg');
      expect(r.success).toBe(true);
      expect(r.fileName).toBe('thumbnail.jpg');
    });

    it('succeeds for webp thumbnail', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', fileHash: 'abc' });
      const r = await service.uploadThumbnail('n1', '/tmp/f.webp');
      expect(r.success).toBe(true);
      expect(r.fileName).toBe('thumbnail.webp');
    });

    it('handles fs copy errors with failure message', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', fileHash: 'abc' });
      // Override the fs mock to throw on copyFileSync for this test
      const fs = require('fs');
      const origCopy = fs.copyFileSync;
      fs.copyFileSync = () => { throw new Error('Disk full'); };
      const r = await service.uploadThumbnail('n1', '/tmp/f.png');
      expect(r.success).toBe(false);
      expect(r.message).toContain('Disk full');
      fs.copyFileSync = origCopy;
    });
  });

  // ==================== saveMxwebFile ====================
  describe('saveMxwebFile', () => {
    const mockFile = { path: '/tmp/f.mxweb', originalname: 'f.mxweb' } as Express.Multer.File;

    it('fails when file is missing', async () => {
      const r = await service.saveMxwebFile('n1', null as any);
      expect(r.success).toBe(false);
      expect(r.message).toContain('缺少文件');
    });

    it('fails when file has no path', async () => {
      const r = await service.saveMxwebFile('n1', { path: null } as any);
      expect(r.success).toBe(false);
    });

    it('fails when node not found', async () => {
      mockNodeService.findById.mockResolvedValue(null);
      const r = await service.saveMxwebFile('n1', mockFile);
      expect(r.success).toBe(false);
      expect(r.message).toContain('节点不存在');
    });

    it('fails for non-mxweb extension', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: 'p/f.mxweb' });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({ libraryKey: null, name: 'f.txt', path: 'p/f.txt' });
      const r = await service.saveMxwebFile('n1', { path: '/tmp/f.txt', originalname: 'f.txt' } as any);
      expect(r.success).toBe(false);
      expect(r.message).toContain('仅支持 .mxweb');
    });

    it('succeeds for project file with SVN commit', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', name: 'f.mxweb' });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({ libraryKey: null, name: 'f.mxweb', path: '2026/n1/f.mxweb' });
      mockConversionService.convertFile.mockResolvedValue({ isOk: true, ret: { code: 0 } });
      mockVersionControl.commitNodeDirectory.mockResolvedValue({ success: true, message: 'ok' });
      const r = await service.saveMxwebFile('n1', mockFile, 'u1', 'User', 'commit msg');
      expect(r.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).toHaveBeenCalled();
    });

    it('skips SVN commit for library files', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', name: 'f.mxweb' });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({ libraryKey: 'drawing', name: 'f.mxweb', path: '2026/n1/f.mxweb' });
      mockConversionService.convertFile.mockResolvedValue({ isOk: true, ret: { code: 0 } });
      const r = await service.saveMxwebFile('n1', mockFile, 'u1', 'User', 'msg');
      expect(r.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
    });

    it('skips bin generation when skipBinGeneration=true', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', name: 'f.mxweb' });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({ libraryKey: null, name: 'f.mxweb', path: '2026/n1/f.mxweb' });
      const r = await service.saveMxwebFile('n1', mockFile, 'u1', 'User', 'msg', true);
      expect(r.success).toBe(true);
      expect(mockConversionService.convertFile).not.toHaveBeenCalled();
    });

    it('handles SVN commit failure gracefully', async () => {
      mockNodeService.findById.mockResolvedValue({ id: 'n1', path: '2026/n1/f.mxweb', name: 'f.mxweb' });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({ libraryKey: null, name: 'f.mxweb', path: '2026/n1/f.mxweb' });
      mockConversionService.convertFile.mockResolvedValue({ isOk: true, ret: { code: 0 } });
      mockVersionControl.commitNodeDirectory.mockResolvedValue({ success: false, message: 'SVN error' });
      const r = await service.saveMxwebFile('n1', mockFile, 'u1', 'User');
      expect(r.success).toBe(true); // SVN failure should not fail the save
    });
  });

  // ==================== generateBinFiles ====================
  describe('generateBinFiles', () => {
    it('logs success when bin conversion succeeds', async () => {
      mockConversionService.convertFile.mockResolvedValue({ isOk: true, ret: { code: 0 } });
      await service.generateBinFiles('/abs/path/f.mxweb', 'test.dwg');
      expect(mockConversionService.convertFile).toHaveBeenCalledWith(
        expect.objectContaining({ outname: 'f.mxweb.bin' }),
      );
    });

    it('logs error when bin conversion fails', async () => {
      mockConversionService.convertFile.mockResolvedValue({ isOk: false, ret: {}, error: 'convert error' });
      await service.generateBinFiles('/abs/path/f.mxweb', 'test.dwg');
      // Should not throw
    });

    it('handles exceptions without throwing', async () => {
      mockConversionService.convertFile.mockRejectedValue(new Error('Unexpected'));
      await service.generateBinFiles('/abs/path/f.mxweb', 'test.dwg');
      // Should not throw — bin failure doesn't break save flow
    });
  });

  // ==================== log methods ====================
  describe('log methods', () => {
    it('logError/logInfo/logWarn do not throw', () => {
      expect(() => {
        service.logError('err msg', new Error('test'));
        service.logInfo('info');
        service.logWarn('warn');
      }).not.toThrow();
    });
  });

  // ==================== validateContext (private, tested indirectly) ====================
  describe('context validation (via uploadChunk)', () => {
    it('throws when context userId is missing', async () => {
      await expect(
        service.uploadChunk('abc', 'f.dwg', 100, 0, 2, { nodeId: 'n1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when context nodeId is missing', async () => {
      await expect(
        service.uploadChunk('abc', 'f.dwg', 100, 0, 2, { userId: 'u1' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('fills userRole from role when missing', async () => {
      mockFacade.uploadChunk.mockResolvedValue({ ret: 'ok' });
      const r = await service.uploadChunk('abc', 'f.dwg', 100, 0, 2, {
        userId: 'u1', nodeId: 'n1',
      } as any);
      expect(r.ret).toBe('ok');
      expect(mockFacade.uploadChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ userRole: 'USER' }),
        }),
      );
    });
  });
});
