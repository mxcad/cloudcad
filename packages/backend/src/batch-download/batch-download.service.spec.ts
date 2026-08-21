import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BatchDownloadService } from './batch-download.service';
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

function createService(mocks: {
  prisma?: any;
  config?: any;
  audit?: any;
  diskMonitor?: any;
  systemPermission?: any;
  sseManager?: any;
  batchDownloadJob?: any;
  folderExpander?: any;
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

  return new BatchDownloadService(
    mocks.prisma as any,
    mocks.config || (defaultConfig as any),
    mocks.audit as any,
    mocks.diskMonitor as any,
    (mocks.systemPermission || defaultSystemPermission) as any,
    (mocks.sseManager || defaultSseManager) as any,
    (mocks.batchDownloadJob || createMockBatchDownloadJob()) as any,
    (mocks.folderExpander || createMockFolderExpander()) as any
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
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('COMPLETED');
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
});
