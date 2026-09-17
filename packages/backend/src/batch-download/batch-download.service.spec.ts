import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BatchDownloadService } from './batch-download.service';
import { VipFeatureRequiredException } from '../vip/errors/vip-feature-required.error';
import { NodeType, BatchJobStatus } from '@cloudcad/db';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const defaultExportDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'batch-dl-svc-')
);

afterAll(() => {
  fs.rmSync(defaultExportDir, { recursive: true, force: true });
});

function createMockBatchDownloadJob() {
  return {
    start: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(true),
  };
}

function createMockFolderExpander() {
  return {
    getFolderFilesRecursive: jest.fn(),
  };
}

function createMockArchiveWriter() {
  return {
    createArchive: jest.fn().mockResolvedValue('/tmp/merged.zip'),
  };
}

function createService(mocks: {
  prisma?: any;
  config?: any;
  audit?: any;
  diskMonitor?: any;
  systemPermission?: any;
  sseManager?: any;
  batchDownloadJob?: any;
  folderExpander?: any;
  archiveWriter?: any;
  restrictionEngine?: any;
}) {
  const defaultConfig = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'batchDownload')
        return {
          exportDir: defaultExportDir,
          minDiskSpace: 1024,
          zipRetentionHours: 24,
          dbRetentionDays: 7,
          maxConcurrency: 3,
        };
      if (key === 'fileLimits') return { zipCompressionLevel: 1 };
      if (key === 'jwt') return { secret: 'test-secret' };
      return {};
    }),
  };
  const defaultSystemPermission = {
    checkSystemPermission: jest.fn().mockResolvedValue(true),
  };
  const defaultSseManager = { streamProgress: jest.fn() };
  // 默认放行（模拟 VIP 用户），需要验证门控的用例显式传入 mock
  const defaultRestrictionEngine = {
    assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined),
  };

  return new BatchDownloadService(
    mocks.prisma as any,
    mocks.config || (defaultConfig as any),
    mocks.audit as any,
    mocks.diskMonitor as any,
    (mocks.systemPermission || defaultSystemPermission) as any,
    (mocks.sseManager || defaultSseManager) as any,
    (mocks.batchDownloadJob || createMockBatchDownloadJob()) as any,
    (mocks.folderExpander || createMockFolderExpander()) as any,
    (mocks.archiveWriter || createMockArchiveWriter()) as any,
    (mocks.restrictionEngine || defaultRestrictionEngine) as any
  );
}

describe('BatchDownloadService', () => {
  let mockPrisma: any;
  let mockDiskMonitor: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      batchDownloadJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      fileSystemNode: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockDiskMonitor = {
      getDiskStats: jest.fn().mockReturnValue({ free: 999999999 }),
    };
  });

  describe('createTask', () => {
    const validDto = {
      fileList: [{ nodeId: 'node-1', fileName: 'test.dwg', formats: ['pdf'] }],
      projectId: 'proj-1',
    };

    it('should create a task successfully', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        projectId: 'proj-1',
        nodeType: NodeType.FILE,
      });
      mockPrisma.batchDownloadJob.create.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'PENDING',
        fileList: validDto.fileList,
        totalCount: 1,
        completedCount: 0,
        errorCount: 0,
      });

      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      const result = await service.createTask('user-1', validDto);

      expect(result.taskId).toBe('task-1');
      expect(mockPrisma.batchDownloadJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            projectId: 'proj-1',
            status: BatchJobStatus.PENDING,
          }),
        })
      );
    });

    it('should create a fileHash-only task without node validation or project', async () => {
      const fileHashDto = {
        fileList: [
          { fileHash: 'hash-xyz', fileName: 'test.dwg', formats: ['pdf'] },
        ],
        mode: 'individual' as const,
      };
      mockPrisma.batchDownloadJob.create.mockResolvedValue({
        id: 'task-2',
        userId: 'user-1',
        status: 'PENDING',
        fileList: fileHashDto.fileList,
        totalCount: 1,
        completedCount: 0,
        errorCount: 0,
      });

      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      const result = await service.createTask('user-1', fileHashDto);

      expect(result.taskId).toBe('task-2');
      // fileHash-only 项无 DB 节点：跳过 findUnique 校验
      expect(mockPrisma.fileSystemNode.findUnique).not.toHaveBeenCalled();
      // 纯 fileHash 任务允许无项目归属（projectId 为 null）
      expect(mockPrisma.batchDownloadJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            projectId: null,
          }),
        })
      );
    });

    it('should reject a file item with neither nodeId nor fileHash', async () => {
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(
        service.createTask('user-1', {
          fileList: [{ fileName: 'test.dwg', formats: ['pdf'] }],
          projectId: 'proj-1',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw VipFeatureRequiredException for fileHash-only export format when not VIP', async () => {
      const restrictionEngine = {
        assertExportDownloadAllowed: jest.fn().mockRejectedValue(
          new VipFeatureRequiredException(
            '导出下载为会员专属功能，开通 VIP 后即可使用',
            'export_download'
          )
        ),
      };
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        restrictionEngine,
      });
      await expect(
        service.createTask('user-1', {
          fileList: [
            { fileHash: 'hash-xyz', fileName: 'test.dwg', formats: ['pdf'] },
          ],
          mode: 'individual',
        })
      ).rejects.toThrow(VipFeatureRequiredException);
      // 门控在创建前触发，任务未落库
      expect(
        restrictionEngine.assertExportDownloadAllowed
      ).toHaveBeenCalledWith('user-1');
      expect(mockPrisma.batchDownloadJob.create).not.toHaveBeenCalled();
    });

    it('should reject empty file list', async () => {
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(
        service.createTask('user-1', { fileList: [], projectId: 'proj-1' })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject cross-project files', async () => {
      mockPrisma.fileSystemNode.findUnique
        .mockResolvedValueOnce({
          id: 'n1',
          projectId: 'p1',
          nodeType: NodeType.FILE,
        })
        .mockResolvedValueOnce({
          id: 'n2',
          projectId: 'p2',
          nodeType: NodeType.FILE,
        });

      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(
        service.createTask('user-1', {
          fileList: [
            { nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] },
            { nodeId: 'n2', fileName: 'b.dwg', formats: ['pdf'] },
          ],
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when node not found', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.createTask('user-1', validDto)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should reject when disk space insufficient', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        projectId: 'proj-1',
        nodeType: NodeType.FILE,
      });
      mockDiskMonitor.getDiskStats.mockReturnValue({ free: 500 });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.createTask('user-1', validDto)).rejects.toThrow(
        ServiceUnavailableException
      );
    });

    it('should throw VipFeatureRequiredException for export format when not VIP', async () => {
      // validDto 含导出格式 pdf：非 VIP 且开关未开放时同步 403，任务不创建
      const restrictionEngine = {
        assertExportDownloadAllowed: jest.fn().mockRejectedValue(
          new VipFeatureRequiredException(
            '导出下载为会员专属功能，开通 VIP 后即可使用',
            'export_download'
          )
        ),
      };
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        restrictionEngine,
      });
      await expect(
        service.createTask('user-1', validDto)
      ).rejects.toThrow(VipFeatureRequiredException);
      // 门控在创建前触发，任务未落库
      expect(
        restrictionEngine.assertExportDownloadAllowed
      ).toHaveBeenCalledWith('user-1');
      expect(mockPrisma.batchDownloadJob.create).not.toHaveBeenCalled();
    });

    it('should not check VIP for mxweb-only download', async () => {
      // 纯 mxweb 下载不受会员门控（orchestrator 走 tryAddOriginal 分支）
      const restrictionEngine = {
        assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined),
      };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        projectId: 'proj-1',
        nodeType: NodeType.FILE,
      });
      mockPrisma.batchDownloadJob.create.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'PENDING',
        fileList: [{ nodeId: 'node-1', fileName: 'test.mxweb', formats: ['mxweb'] }],
        totalCount: 1,
        completedCount: 0,
        errorCount: 0,
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        restrictionEngine,
      });
      const result = await service.createTask('user-1', {
        fileList: [
          { nodeId: 'node-1', fileName: 'test.mxweb', formats: ['mxweb'] },
        ],
        projectId: 'proj-1',
      });
      expect(result.taskId).toBe('task-1');
      expect(
        restrictionEngine.assertExportDownloadAllowed
      ).not.toHaveBeenCalled();
    });

    it('should check VIP and create task for export format when VIP', async () => {
      // 导出格式 + VIP 放行：门控通过，任务正常创建
      const restrictionEngine = {
        assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined),
      };
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        projectId: 'proj-1',
        nodeType: NodeType.FILE,
      });
      mockPrisma.batchDownloadJob.create.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'PENDING',
        fileList: validDto.fileList,
        totalCount: 1,
        completedCount: 0,
        errorCount: 0,
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        restrictionEngine,
      });
      const result = await service.createTask('user-1', validDto);
      expect(result.taskId).toBe('task-1');
      expect(
        restrictionEngine.assertExportDownloadAllowed
      ).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getProgress', () => {
    it('should return progress for valid task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'PROCESSING',
        fileList: [{ nodeId: 'n1', fileName: 'f.dwg', formats: ['pdf'] }],
        totalCount: 3,
        completedCount: 2,
        errorCount: 1,
        errors: null,
        zipPath: null,
        zipSize: null,
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });

      const result = await service.getProgress('task-1', 'user-1');
      expect(result.status).toBe('PROCESSING');
      expect(result.completedCount).toBe(2);
    });

    it('should throw NotFoundException for unknown task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue(null);
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.getProgress('unknown', 'user-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ForbiddenException for wrong user', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'other-user',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.getProgress('task-1', 'user-1')).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('cancelTask', () => {
    it('should cancel a pending task via BatchDownloadJob', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'PROCESSING',
      });
      const mockJob = createMockBatchDownloadJob();
      mockJob.cancel.mockResolvedValue(true);
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        batchDownloadJob: mockJob,
      });

      await service.cancelTask('task-1', 'user-1');
      expect(mockJob.cancel).toHaveBeenCalledWith('task-1');
      expect(mockPrisma.batchDownloadJob.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when BatchDownloadJob rejects cancel', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'COMPLETED',
      });
      const mockJob = createMockBatchDownloadJob();
      mockJob.cancel.mockResolvedValue(false);
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        batchDownloadJob: mockJob,
      });

      await expect(service.cancelTask('task-1', 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw ForbiddenException for non-owner', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'other-user',
        status: 'PROCESSING',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.cancelTask('task-1', 'user-1')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw for completed task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'COMPLETED',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.cancelTask('task-1', 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('retryTask', () => {
    it('should reset a FAILED task to PENDING and re-run start', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'FAILED',
      });
      const mockJob = createMockBatchDownloadJob();
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        batchDownloadJob: mockJob,
      });

      const result = await service.retryTask('task-1', 'user-1');
      expect(result).toEqual({ taskId: 'task-1' });
      // 重置状态为 PENDING + 清空计数
      expect(mockPrisma.batchDownloadJob.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          status: 'PENDING',
          completedCount: 0,
          errorCount: 0,
          errors: null,
          completedAt: null,
        },
      });
      // 重新 start 处理
      expect(mockJob.start).toHaveBeenCalledWith('task-1');
    });

    it('should throw ForbiddenException for non-owner', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'other-user',
        status: 'FAILED',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.retryTask('task-1', 'user-1')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw BadRequestException for non-FAILED task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'COMPLETED',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.retryTask('task-1', 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw NotFoundException for missing task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue(null);
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.retryTask('task-1', 'user-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw VipFeatureRequiredException for export format when not VIP', async () => {
      // 导出格式任务重试：用户仍非 VIP 时同步 403，任务不重置
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'FAILED',
        fileList: [{ nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] }],
      });
      const restrictionEngine = {
        assertExportDownloadAllowed: jest.fn().mockRejectedValue(
          new VipFeatureRequiredException(
            '导出下载为会员专属功能，开通 VIP 后即可使用',
            'export_download'
          )
        ),
      };
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        restrictionEngine,
      });
      await expect(
        service.retryTask('task-1', 'user-1')
      ).rejects.toThrow(VipFeatureRequiredException);
      // 门控在重置前触发，任务未重置
      expect(mockPrisma.batchDownloadJob.update).not.toHaveBeenCalled();
    });
  });

  describe('retryFailedItems', () => {
    it('should create a new job with only failed items and start it', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'FAILED',
        projectId: 'proj-1',
        mode: 'individual',
        fileList: [
          { nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] },
          { nodeId: 'n2', fileName: 'b.dwg', formats: ['dwf'] },
        ],
        errors: [
          { nodeId: 'n2', fileName: 'b.dwg', error: 'conversion failed' },
        ],
      });
      mockPrisma.batchDownloadJob.create.mockResolvedValue({ id: 'task-new' });
      const mockJob = createMockBatchDownloadJob();
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        batchDownloadJob: mockJob,
      });

      const result = await service.retryFailedItems('task-1', 'user-1');
      expect(result).toEqual({ newTaskId: 'task-new' });
      // 仅重跑失败项（n2），成功项（n1）不重跑
      expect(mockPrisma.batchDownloadJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          projectId: 'proj-1',
          status: 'PENDING',
          fileList: [{ nodeId: 'n2', fileName: 'b.dwg', formats: ['dwf'] }],
          mode: 'individual',
          totalCount: 1,
        }),
      });
      // 新任务重新 start
      expect(mockJob.start).toHaveBeenCalledWith('task-new');
    });

    it('should throw ForbiddenException for non-owner', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'other-user',
        status: 'FAILED',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.retryFailedItems('task-1', 'user-1')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw BadRequestException for non-FAILED task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'COMPLETED',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.retryFailedItems('task-1', 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException when no errors recorded', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'FAILED',
        errors: null,
        fileList: [{ nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] }],
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.retryFailedItems('task-1', 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException when failed items not in file list', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'FAILED',
        projectId: 'proj-1',
        mode: 'individual',
        errors: [{ nodeId: 'n9', fileName: 'x.dwg', error: 'conversion failed' }],
        fileList: [{ nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] }],
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.retryFailedItems('task-1', 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw VipFeatureRequiredException for export format when not VIP', async () => {
      // 失败项含导出格式：用户仍非 VIP 时同步 403，新任务不创建
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'FAILED',
        projectId: 'proj-1',
        mode: 'individual',
        fileList: [
          { nodeId: 'n1', fileName: 'a.dwg', formats: ['pdf'] },
          { nodeId: 'n2', fileName: 'b.dwg', formats: ['dwf'] },
        ],
        errors: [{ nodeId: 'n2', fileName: 'b.dwg', error: 'conversion failed' }],
      });
      const restrictionEngine = {
        assertExportDownloadAllowed: jest.fn().mockRejectedValue(
          new VipFeatureRequiredException(
            '导出下载为会员专属功能，开通 VIP 后即可使用',
            'export_download'
          )
        ),
      };
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        restrictionEngine,
      });
      await expect(
        service.retryFailedItems('task-1', 'user-1')
      ).rejects.toThrow(VipFeatureRequiredException);
      // 门控在新任务创建前触发，新任务未创建
      expect(mockPrisma.batchDownloadJob.create).not.toHaveBeenCalled();
    });
  });

  describe('getDownloadPath', () => {
    it('should return path for completed task', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-dl-'));
      fs.writeFileSync(path.join(tmpDir, 'batch-1.zip'), 'zip');
      try {
        mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
          id: 'task-1',
          userId: 'user-1',
          status: 'COMPLETED',
          zipPath: 'batch-1.zip',
        });
        const config = {
          get: jest.fn().mockImplementation((key: string) => {
            if (key === 'batchDownload')
              return {
                exportDir: tmpDir,
                minDiskSpace: 1024,
                zipRetentionHours: 24,
                dbRetentionDays: 7,
                maxConcurrency: 3,
              };
            if (key === 'fileLimits') return { zipCompressionLevel: 1 };
            if (key === 'jwt') return { secret: 'test-secret' };
            return {};
          }),
        };
        const service = createService({
          prisma: mockPrisma,
          diskMonitor: mockDiskMonitor,
          config,
        });

        const result = await service.getDownloadPath('task-1', 'user-1');
        expect(result).toContain('batch-1.zip');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should throw for unknown task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue(null);
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(
        service.getDownloadPath('unknown', 'user-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw for incomplete task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'PROCESSING',
        zipPath: null,
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.getDownloadPath('task-1', 'user-1')).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('getUserTasks', () => {
    it('should return recent tasks for user', async () => {
      mockPrisma.batchDownloadJob.findMany.mockResolvedValue([
        {
          id: 'task-1',
          userId: 'user-1',
          status: 'COMPLETED',
          fileList: [{ nodeId: 'n1', fileName: 'f.dwg', formats: ['pdf'] }],
          totalCount: 1,
          completedCount: 1,
          errorCount: 0,
          zipPath: 'batch-1.zip',
          zipSize: 1024,
          errors: null,
        },
      ]);
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });

      const result = await service.getUserTasks('user-1');
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].status).toBe('COMPLETED');
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getFolderFilesRecursive', () => {
    it('should delegate to FolderExpanderService', async () => {
      const mockFolderExpander = createMockFolderExpander();
      mockFolderExpander.getFolderFilesRecursive.mockResolvedValue({
        nodeId: 'file-1',
        fileName: 'test.dwg',
        isFolder: false,
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
        folderExpander: mockFolderExpander,
      });

      const result = await service.getFolderFilesRecursive('file-1', 'user-1');
      expect(mockFolderExpander.getFolderFilesRecursive).toHaveBeenCalledWith(
        'file-1',
        'user-1'
      );
      expect(result).toEqual({
        nodeId: 'file-1',
        fileName: 'test.dwg',
        isFolder: false,
      });
    });
  });

  describe('mergeZip', () => {
    it('should throw BadRequestException for empty task list', async () => {
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.mergeZip([], 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw ForbiddenException for non-owner task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'other-user',
        status: 'COMPLETED',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.mergeZip(['task-1'], 'user-1')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw ConflictException for incomplete task', async () => {
      mockPrisma.batchDownloadJob.findUnique.mockResolvedValue({
        id: 'task-1',
        userId: 'user-1',
        status: 'PROCESSING',
      });
      const service = createService({
        prisma: mockPrisma,
        diskMonitor: mockDiskMonitor,
      });
      await expect(service.mergeZip(['task-1'], 'user-1')).rejects.toThrow(
        ConflictException
      );
    });

    it('merges zip-mode (nested) + individual-mode (expanded) into one archive', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-dl-merge-'));
      // zip 模式任务的自身 zip
      const zipPath = path.join(tmpDir, 'batch-zip.zip');
      fs.writeFileSync(zipPath, 'zip-content');
      // individual 任务的产物文件
      const indFile = path.join(tmpDir, 'a.pdf');
      fs.writeFileSync(indFile, 'ind-content');

      try {
        mockPrisma.batchDownloadJob.findUnique.mockImplementation(
          ({ where }: { where: { id: string } }) =>
            Promise.resolve(
              where.id === 'task-zip'
                ? {
                    id: 'task-zip',
                    userId: 'user-1',
                    status: 'COMPLETED',
                    mode: 'zip',
                    zipPath: 'batch-zip.zip',
                  }
                : {
                    id: 'task-ind',
                    userId: 'user-1',
                    status: 'COMPLETED',
                    mode: 'individual',
                    itemsManifest: [
                      {
                        index: 0,
                        name: 'a.pdf',
                        sourcePath: indFile,
                        temp: false,
                      },
                    ],
                  }
            )
        );

        const config = {
          get: jest.fn().mockImplementation((key: string) => {
            if (key === 'batchDownload')
              return {
                exportDir: tmpDir,
                minDiskSpace: 1024,
              };
            return {};
          }),
        };
        const archiveWriter = createMockArchiveWriter();
        archiveWriter.createArchive.mockResolvedValue(
          path.join(tmpDir, 'merged.zip')
        );
        const service = createService({
          prisma: mockPrisma,
          diskMonitor: mockDiskMonitor,
          config,
          archiveWriter,
        });

        const result = await service.mergeZip(
          ['task-zip', 'task-ind'],
          'user-1'
        );
        expect(result).toContain('merged.zip');
        // 两个条目：zip 任务内嵌其 zip + individual 任务展开其文件
        expect(archiveWriter.createArchive).toHaveBeenCalledTimes(1);
        const entries = archiveWriter.createArchive.mock.calls[0][0];
        expect(entries).toHaveLength(2);
        const names = entries.map((e: any) => e.name);
        expect(names).toContain('batch-zip.zip');
        expect(names).toContain('a.pdf');
        // mock 未消费 ReadStream：挂 error 兜底并 destroy，避免 finally 删目录后
        // 触发未处理 'error' 事件导致测试进程崩溃（生产由 archiver 消费流）
        for (const e of entries) {
          e.stream.on('error', () => undefined);
          e.stream.destroy();
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
