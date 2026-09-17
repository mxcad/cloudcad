import { ConfigService } from '@nestjs/config';
import { NodeType } from '@cloudcad/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { DatabaseService } from '../../database/database.service';
import { VERSION_CONTROL_TOKEN } from '../../version-control/interfaces/version-control.interface';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { MxcadSaveService } from './mxcad-save.service';
import { MXCAD_CONVERSION_SERVICE } from '../interfaces/mxcad-service-tokens';
import { IMxcadConversionService } from '../interfaces/mxcad-conversion.interface';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';
import { NodeSizeResolverService } from '../../file-system/storage-quota/node-size-resolver.service';
import * as os from 'os';
import * as path from 'path';

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

describe('MxcadSaveService', () => {
  let service: MxcadSaveService;
  let testModule: TestingModule;

  const mockNodeService = {
    findById: jest.fn(),
  };

  const mockStorageManager = {
    getFullPath: jest.fn().mockReturnValue('/abs/path/file.mxweb'),
  };

  const mockVersionControl = {
    isFirstCommit: jest.fn().mockResolvedValue(false),
    commitNodeDirectory: jest.fn(),
  };

  const mockPrisma = {
    fileSystemNode: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, opts?: Record<string, unknown>) => {
      if (key === 'mxcadUploadPath') return '/fake/upload';
      if (key === 'nodeEnv') return 'test';
      if (opts?.infer) {
        if (key === 'mxcadUploadPath') return '/fake/upload';
        if (key === 'nodeEnv') return 'test';
      }
      return undefined;
    }),
  };

  const mockMxcadConversionService = {
    convertServerFile: jest.fn(),
    checkTzStatus: jest.fn(),
    generateBinFiles: jest.fn(),
  } as unknown as IMxcadConversionService & { generateBinFiles: jest.Mock };

  const mockRestrictionEngine = {
    checkQuota: jest.fn().mockResolvedValue(undefined),
    incrementConversionCount: jest.fn().mockResolvedValue(undefined),
    reserveSaveCountOrThrow: jest.fn().mockResolvedValue(undefined),
    releaseSaveCount: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockStorageManager.getFullPath = jest
      .fn()
      .mockReturnValue('/abs/path/file.mxweb');
    mockVersionControl.isFirstCommit = jest.fn().mockResolvedValue(false);
    mockVersionControl.commitNodeDirectory = jest
      .fn()
      .mockResolvedValue({ success: true, message: 'ok' });

    testModule = await Test.createTestingModule({
      providers: [
        MxcadSaveService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FileSystemNodeService, useValue: mockNodeService },
        { provide: StorageManager, useValue: mockStorageManager },
        { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControl },
        { provide: DatabaseService, useValue: mockPrisma },
        {
          provide: MXCAD_CONVERSION_SERVICE,
          useValue: mockMxcadConversionService,
        },
        {
          provide: RestrictionEngine,
          useValue: mockRestrictionEngine,
        },
        {
          provide: NodeMutationGuard,
          useValue: {
            assertMutationAllowed: jest.fn().mockResolvedValue(undefined),
            assertProjectQuota: jest.fn().mockResolvedValue(undefined),
            assertByteQuota: jest.fn().mockResolvedValue(undefined),
            invalidateQuotaAfterMutation: jest
              .fn()
              .mockResolvedValue(undefined),
            resolveProjectContext: jest.fn(),
          },
        },
        {
          provide: NodeSizeResolverService,
          useValue: {
            resolveFileSize: jest.fn().mockResolvedValue(1024),
            resolveFileSizes: jest.fn().mockResolvedValue(1024),
          },
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    service = testModule.get<MxcadSaveService>(MxcadSaveService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveMxwebFile', () => {
    const mockFile = {
      path: path.join(os.tmpdir(), 'f.mxweb'),
      originalname: 'f.mxweb',
    } as Express.Multer.File;

    it('fails when file is missing', async () => {
      const r = await service.saveMxwebFile(
        'n1',
        null as unknown as Express.Multer.File,
        'u1',
        'User'
      );
      expect(r.success).toBe(false);
      expect(r.message).toContain('缺少文件');
    });

    it('fails when file has no path', async () => {
      const r = await service.saveMxwebFile(
        'n1',
        {
          path: null,
        } as unknown as Express.Multer.File,
        'u1',
        'User'
      );
      expect(r.success).toBe(false);
    });

    it('fails when node not found', async () => {
      mockNodeService.findById.mockResolvedValue(null);
      const r = await service.saveMxwebFile('n1', mockFile, 'u1', 'User');
      expect(r.success).toBe(false);
      expect(r.message).toContain('节点不存在');
    });

    it('fails for non-mxweb extension', async () => {
      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: 'p/f.mxweb',
        name: 'f.mxweb',
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.FILE,
        name: 'f.txt',
        path: 'p/f.txt',
      });
      const r = await service.saveMxwebFile(
        'n1',
        {
          path: path.join(os.tmpdir(), 'f.txt'),
          originalname: 'f.txt',
        } as Express.Multer.File,
        'u1',
        'User'
      );
      expect(r.success).toBe(false);
      expect(r.message).toContain('仅支持 .mxweb');
    });

    it('rejects guest save (游客不支持保存/转 bin)', async () => {
      await expect(
        service.saveMxwebFile('n1', mockFile)
      ).rejects.toBeInstanceOf(Error);
      // 游客在服务层被拒绝，不应触发保存频率占位
      expect(
        mockRestrictionEngine.reserveSaveCountOrThrow
      ).not.toHaveBeenCalled();
    });

    it('reserves save quota on successful save and releases on failure', async () => {
      mockRestrictionEngine.reserveSaveCountOrThrow.mockClear();
      mockRestrictionEngine.releaseSaveCount.mockClear();

      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: '2026/n1/f.mxweb',
        name: 'f.mxweb',
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.FILE,
        name: 'f.mxweb',
        path: '2026/n1/f.mxweb',
        updatedAt: new Date(),
      });
      mockMxcadConversionService.generateBinFiles.mockResolvedValue(undefined);
      mockVersionControl.commitNodeDirectory.mockResolvedValue({
        success: true,
        message: 'ok',
      });

      const r = await service.saveMxwebFile(
        'n1',
        mockFile,
        'u1',
        'User',
        'msg'
      );
      expect(r.success).toBe(true);
      expect(mockRestrictionEngine.reserveSaveCountOrThrow).toHaveBeenCalledWith(
        'u1'
      );
      expect(mockRestrictionEngine.releaseSaveCount).not.toHaveBeenCalled();
    });

    it('releases save quota when save fails', async () => {
      mockRestrictionEngine.reserveSaveCountOrThrow.mockClear();
      mockRestrictionEngine.releaseSaveCount.mockClear();

      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: '2026/n1/f.mxweb',
        name: 'f.mxweb',
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.FILE,
        name: 'f.mxweb',
        path: '2026/n1/f.mxweb',
        updatedAt: new Date(),
      });
      // 转 bin 抛异常触发失败路径
      mockMxcadConversionService.generateBinFiles.mockRejectedValue(
        new Error('bin 生成失败')
      );
      mockVersionControl.commitNodeDirectory.mockResolvedValue({
        success: true,
        message: 'ok',
      });

      const r = await service.saveMxwebFile(
        'n1',
        mockFile,
        'u1',
        'User',
        'msg'
      );
      expect(r.success).toBe(false);
      expect(mockRestrictionEngine.reserveSaveCountOrThrow).toHaveBeenCalledWith(
        'u1'
      );
      expect(mockRestrictionEngine.releaseSaveCount).toHaveBeenCalledWith('u1');
    });

    it('succeeds for project file with MX commit', async () => {
      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: '2026/n1/f.mxweb',
        name: 'f.mxweb',
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.FILE,
        name: 'f.mxweb',
        path: '2026/n1/f.mxweb',
        updatedAt: new Date(),
      });
      mockMxcadConversionService.generateBinFiles.mockResolvedValue(undefined);
      mockVersionControl.commitNodeDirectory.mockResolvedValue({
        success: true,
        message: 'ok',
      });
      const r = await service.saveMxwebFile(
        'n1',
        mockFile,
        'u1',
        'User',
        'commit msg'
      );
      expect(r.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).toHaveBeenCalled();
    });

    it('skips MX commit for library files', async () => {
      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: '2026/n1/f.mxweb',
        name: 'f.mxweb',
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.LIBRARY_DRAWING,
        name: 'f.mxweb',
        path: '2026/n1/f.mxweb',
      });
      mockMxcadConversionService.generateBinFiles.mockResolvedValue(undefined);
      const r = await service.saveMxwebFile(
        'n1',
        mockFile,
        'u1',
        'User',
        'msg'
      );
      expect(r.success).toBe(true);
      expect(mockVersionControl.commitNodeDirectory).not.toHaveBeenCalled();
    });

    it('skips bin generation when skipBinGeneration=true', async () => {
      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: '2026/n1/f.mxweb',
        name: 'f.mxweb',
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.FILE,
        name: 'f.mxweb',
        path: '2026/n1/f.mxweb',
      });
      const r = await service.saveMxwebFile(
        'n1',
        mockFile,
        'u1',
        'User',
        'msg',
        true
      );
      expect(r.success).toBe(true);
      expect(
        mockMxcadConversionService.generateBinFiles
      ).not.toHaveBeenCalled();
    });

    it('handles MX commit failure gracefully', async () => {
      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: '2026/n1/f.mxweb',
        name: 'f.mxweb',
      });
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.FILE,
        name: 'f.mxweb',
        path: '2026/n1/f.mxweb',
      });
      mockMxcadConversionService.generateBinFiles.mockResolvedValue(undefined);
      mockVersionControl.commitNodeDirectory.mockResolvedValue({
        success: false,
        message: 'MX error',
      });
      const r = await service.saveMxwebFile('n1', mockFile, 'u1', 'User');
      expect(r.success).toBe(true);
    });

    it('uses physical file size when DB size is null (prevents false quota exceed)', async () => {
      const mockNodeSizeResolver = testModule.get(NodeSizeResolverService);
      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: '2026/n1/f.mxweb',
        name: 'f.mxweb',
      });
      // size is null in DB - this is the bug scenario
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.FILE,
        name: 'f.mxweb',
        path: '2026/n1/f.mxweb',
        size: null,
        updatedAt: new Date(),
      });
      mockMxcadConversionService.generateBinFiles.mockResolvedValue(undefined);
      mockVersionControl.commitNodeDirectory.mockResolvedValue({
        success: true,
        message: 'ok',
      });
      // Physical file size is same as uploaded file → incrementBytes should be 0
      (mockNodeSizeResolver.resolveFileSize as jest.Mock).mockResolvedValue(
        mockFile.size ?? 1024
      );

      const r = await service.saveMxwebFile(
        'n1',
        { ...mockFile, size: mockFile.size ?? 1024 } as Express.Multer.File,
        'u1',
        'User'
      );
      expect(r.success).toBe(true);
      // NodeSizeResolverService should be called when DB size is null
      expect(mockNodeSizeResolver.resolveFileSize).toHaveBeenCalled();
      // incrementBytes should be 0 (same file size), assertByteQuota called with 0
      const nodeMutationGuard = testModule.get(NodeMutationGuard);
      expect(nodeMutationGuard.assertByteQuota).toHaveBeenCalledWith(
        { node: { id: 'n1' }, incrementBytes: 0 },
        'u1'
      );
    });

    it('calculates correct increment when file size changes', async () => {
      const mockNodeSizeResolver = testModule.get(NodeSizeResolverService);
      mockNodeService.findById.mockResolvedValue({
        id: 'n1',
        path: '2026/n1/f.mxweb',
        name: 'f.mxweb',
      });
      // Old file was 500 bytes in DB
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        nodeType: NodeType.FILE,
        name: 'f.mxweb',
        path: '2026/n1/f.mxweb',
        size: 500,
        updatedAt: new Date(),
      });
      mockMxcadConversionService.generateBinFiles.mockResolvedValue(undefined);
      mockVersionControl.commitNodeDirectory.mockResolvedValue({
        success: true,
        message: 'ok',
      });

      const newFileSize = 1024;
      const r = await service.saveMxwebFile(
        'n1',
        { ...mockFile, size: newFileSize } as Express.Multer.File,
        'u1',
        'User'
      );
      expect(r.success).toBe(true);
      // DB size exists (500), so NodeSizeResolverService should NOT be called
      expect(mockNodeSizeResolver.resolveFileSize).not.toHaveBeenCalled();
      // incrementBytes = 1024 - 500 = 524
      const nodeMutationGuard = testModule.get(NodeMutationGuard);
      expect(nodeMutationGuard.assertByteQuota).toHaveBeenCalledWith(
        { node: { id: 'n1' }, incrementBytes: 524 },
        'u1'
      );
    });
  });
});
