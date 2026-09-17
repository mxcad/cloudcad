import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { FileDownloadExportService } from '../file-system/file-download/file-download-export.service';
import { ConversionRunner } from './conversion-runner';
import { BatchDownloadOrchestrator } from './batch-download-orchestrator';
import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
}));

describe('BatchDownloadOrchestrator', () => {
  let orchestrator: BatchDownloadOrchestrator;
  let mockPrisma: any;
  let mockFileDownloadExportService: any;
  let mockConversionRunner: any;
  let ctx: any;

  /** 轻量 JobContext 替身：orchestrator 只消费这些字段 */
  const makeCtx = () => ({
    errors: [] as Array<{ nodeId: string; fileName: string; error: string }>,
    archiveEntries: [] as Array<{
      name: string;
      stream: unknown;
      sourcePath?: string;
      temp?: boolean;
    }>,
    convertedFiles: [] as string[],
    completedCount: 0,
    errorCount: 0,
    userId: 'user-1',
    getFormats: jest.fn((item: { formats: string[] }) => item.formats),
    sanitizeZipName: jest.fn((name: string) => name),
    recordError: jest.fn(async () => undefined),
    emitProgress: jest.fn(),
    syncCounts: jest.fn(async () => undefined),
  });

  const mxwebNode = {
    id: 'node-mxweb',
    name: 'test.mxweb',
    originalName: 'test.mxweb',
    path: 'projects/p1/test.mxweb',
    fileHash: 'hash-mxweb',
    extension: '.mxweb',
    nodeType: 'FILE',
    size: 1024,
  };

  const dwgNode = {
    id: 'node-dwg',
    name: 'test.dwg',
    originalName: 'test.dwg',
    path: 'projects/p1/test.dwg',
    fileHash: 'hash-dwg',
    extension: '.dwg',
    nodeType: 'FILE',
    size: 1024,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mockFs = jest.requireMock('fs') as jest.Mocked<typeof fs>;
    mockFs.existsSync.mockReturnValue(true);

    mockPrisma = {
      fileSystemNode: {
        findUnique: jest.fn(),
      },
    };
    mockFileDownloadExportService = {
      getFullPath: jest.fn((p: string) => `/data/files/${p}`),
    };
    mockConversionRunner = {
      convertFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchDownloadOrchestrator,
        { provide: DatabaseService, useValue: mockPrisma },
        {
          provide: FileDownloadExportService,
          useValue: mockFileDownloadExportService,
        },
        { provide: ConversionRunner, useValue: mockConversionRunner },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) =>
              key === 'mxcadUploadPath' ? '/data/uploads' : ''
            ),
          },
        },
      ],
    }).compile();

    orchestrator = module.get<BatchDownloadOrchestrator>(
      BatchDownloadOrchestrator
    );
    ctx = makeCtx();
  });

  describe('processItem 格式路由（回归：mxweb 源 + 导出格式必须走转换）', () => {
    it('mxweb 源文件请求 dwg：走 conversionRunner.convertFile，不直取源文件', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mxwebNode);
      mockConversionRunner.convertFile.mockResolvedValue({
        success: true,
        filePath: '/data/uploads/hash-mxweb-dwg.dwg',
        format: 'dwg',
      });

      await orchestrator.processItem(
        { nodeId: 'node-mxweb', fileName: 'test.mxweb', formats: ['dwg'] },
        ctx,
        () => false
      );

      expect(mockConversionRunner.convertFile).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'node-mxweb', fileHash: 'hash-mxweb' }),
        'dwg',
        undefined,
        'user-1'
      );
      // 产物名按目标格式，而不是源文件
      expect(ctx.archiveEntries[0].name).toBe('test.dwg');
      expect(ctx.archiveEntries[0].sourcePath).toBe(
        '/data/uploads/hash-mxweb-dwg.dwg'
      );
    });

    it('mxweb 源文件请求 pdf：走转换并透传 pdf 参数', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mxwebNode);
      mockConversionRunner.convertFile.mockResolvedValue({
        success: true,
        filePath: '/data/uploads/hash-mxweb-pdf.pdf',
        format: 'pdf',
      });

      await orchestrator.processItem(
        {
          nodeId: 'node-mxweb',
          fileName: 'test.mxweb',
          formats: ['pdf'],
          width: '1000',
          height: '800',
          colorPolicy: 'color',
        },
        ctx,
        () => false
      );

      expect(mockConversionRunner.convertFile).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'node-mxweb' }),
        'pdf',
        { width: '1000', height: '800', colorPolicy: 'color' },
        'user-1'
      );
    });

    it('mxweb 源文件请求 mxweb：直取源文件，且文件名不叠加双 .mxweb 后缀', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(mxwebNode);

      await orchestrator.processItem(
        { nodeId: 'node-mxweb', fileName: 'test.mxweb', formats: ['mxweb'] },
        ctx,
        () => false
      );

      expect(mockConversionRunner.convertFile).not.toHaveBeenCalled();
      expect(ctx.archiveEntries).toHaveLength(1);
      expect(ctx.archiveEntries[0].name).toBe('test.mxweb');
      expect(ctx.archiveEntries[0].sourcePath).toBe(
        '/data/files/projects/p1/test.mxweb'
      );
      expect(ctx.archiveEntries[0].temp).toBe(false);
    });

    it('dwg 源文件请求 mxweb：直取源文件并补 .mxweb 后缀（行为不变）', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(dwgNode);

      await orchestrator.processItem(
        { nodeId: 'node-dwg', fileName: 'test.dwg', formats: ['mxweb'] },
        ctx,
        () => false
      );

      expect(mockConversionRunner.convertFile).not.toHaveBeenCalled();
      expect(ctx.archiveEntries[0].name).toBe('test.dwg.mxweb');
    });

    it('dwg 源文件请求 dwg：走转换（行为不变）', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(dwgNode);
      mockConversionRunner.convertFile.mockResolvedValue({
        success: true,
        filePath: '/data/uploads/hash-dwg-dwg.dwg',
        format: 'dwg',
      });

      await orchestrator.processItem(
        { nodeId: 'node-dwg', fileName: 'test.dwg', formats: ['dwg'] },
        ctx,
        () => false
      );

      expect(mockConversionRunner.convertFile).toHaveBeenCalledTimes(1);
    });

    it('fileHash-only 项请求 dwg：恒走转换（无 DB 节点）', async () => {
      mockConversionRunner.convertFile.mockResolvedValue({
        success: true,
        filePath: '/data/uploads/hash123-dwg.dwg',
        format: 'dwg',
      });

      await orchestrator.processItem(
        { fileHash: 'hash123', fileName: 'mem.dwg', formats: ['dwg'] },
        ctx,
        () => false
      );

      expect(mockPrisma.fileSystemNode.findUnique).not.toHaveBeenCalled();
      expect(mockConversionRunner.convertFile).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'hash123', fileHash: 'hash123' }),
        'dwg',
        undefined,
        'user-1'
      );
    });
  });

  describe('processDelegated 格式路由', () => {
    it('mxweb 源 + dwg 进 pending 批量转换；mxweb 源 + mxweb 即时直取', async () => {
      mockPrisma.fileSystemNode.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'node-mxweb' ? mxwebNode : dwgNode
        )
      );
      mockConversionRunner.convertMany = jest.fn().mockResolvedValue([
        {
          success: true,
          filePath: '/data/uploads/hash-mxweb-dwg.dwg',
          format: 'dwg',
        },
      ]);
      ctx.expandedItems = [
        {
          nodeId: 'node-mxweb',
          fileName: 'test.mxweb',
          formats: ['dwg', 'mxweb'],
        },
      ];

      await orchestrator.processDelegated(ctx, () => false);

      // 只有 dwg 请求进批量转换，mxweb 请求即时直取
      expect(mockConversionRunner.convertMany).toHaveBeenCalledTimes(1);
      const pending = mockConversionRunner.convertMany.mock.calls[0][0];
      expect(pending).toHaveLength(1);
      expect(pending[0].format).toBe('dwg');
      expect(pending[0].node.id).toBe('node-mxweb');

      // 直取条目：mxweb 源不叠加双后缀
      const direct = ctx.archiveEntries.find(
        (e: { name: string }) => e.name === 'test.mxweb'
      );
      expect(direct).toBeDefined();
      expect(direct.sourcePath).toBe('/data/files/projects/p1/test.mxweb');
      // 转换条目按目标格式命名
      const converted = ctx.archiveEntries.find(
        (e: { name: string }) => e.name === 'test.dwg'
      );
      expect(converted).toBeDefined();
    });
  });
});
