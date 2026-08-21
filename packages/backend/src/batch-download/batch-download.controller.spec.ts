import { Test, type TestingModule } from '@nestjs/testing';
import { BatchDownloadController } from './batch-download.controller';
import { BatchDownloadService } from './batch-download.service';
import { CreateBatchDownloadDto } from './dto/create-batch-download.dto';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  statSync: jest.fn().mockReturnValue({ size: 1024 }),
  existsSync: jest.fn().mockReturnValue(true),
  createReadStream: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
    on: jest.fn((event: string, handler: Function) => {
      if (event === 'error') { /* noop */ }
      return { on: jest.fn() };
    }),
  }),
}));

describe('BatchDownloadController', () => {
  let controller: BatchDownloadController;
  let mockService: any;
  let mockRuntimeConfig: any;

  const mockRequest = (userId = 'user-1', accept = 'application/json') =>
    ({ user: { id: userId }, headers: { accept } } as any);

  const mockResponse = () => {
    const res: any = {};
    res.setHeader = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    res.flushHeaders = jest.fn();
    return res;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mockFs = jest.requireMock('fs') as any;
    mockFs.statSync.mockReturnValue({ size: 1024 });
    mockFs.existsSync.mockReturnValue(true);
    mockFs.createReadStream.mockReturnValue({
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
    });

    mockService = {
      createTask: jest.fn(),
      getProgress: jest.fn(),
      getProgressForSse: jest.fn(),
      cancelTask: jest.fn(),
      getDownloadPath: jest.fn(),
      getUserTasks: jest.fn(),
      getFolderFilesRecursive: jest.fn(),
    };

    mockRuntimeConfig = {
      getValue: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchDownloadController],
      providers: [
        { provide: BatchDownloadService, useValue: mockService },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfig },
      ],
    }).compile();

    controller = module.get<BatchDownloadController>(BatchDownloadController);
  });

  describe('createTask', () => {
    it('should create a batch download task when enabled', async () => {
      mockRuntimeConfig.getValue.mockResolvedValue(true);
      const dto: CreateBatchDownloadDto = {
        fileList: [{ nodeId: 'node-1', fileName: 'test.dwg', formats: ['pdf'] }],
        projectId: 'proj-1',
      };
      mockService.createTask.mockResolvedValue({ taskId: 'task-1' });

      const result = await controller.createTask(dto, mockRequest());

      expect(mockRuntimeConfig.getValue).toHaveBeenCalledWith('batchDownloadEnabled', false);
      expect(mockService.createTask).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ taskId: 'task-1' });
    });

    it('should throw ForbiddenException when switch is off', async () => {
      mockRuntimeConfig.getValue.mockResolvedValue(false);
      const dto: CreateBatchDownloadDto = {
        fileList: [{ nodeId: 'node-1', fileName: 'test.dwg', formats: ['pdf'] }],
        projectId: 'proj-1',
      };

      await expect(
        controller.createTask(dto, mockRequest()),
      ).rejects.toThrow(ForbiddenException);
      expect(mockService.createTask).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when no user id', async () => {
      mockRuntimeConfig.getValue.mockResolvedValue(true);
      const dto: CreateBatchDownloadDto = {
        fileList: [{ nodeId: 'n1', fileName: 'f.dwg', formats: ['pdf'] }],
      };

      await expect(
        controller.createTask(dto, { user: {}, headers: {} } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getProgress', () => {
    it('should delegate to SSE handler when accept is text/event-stream', async () => {
      const req = mockRequest('user-1', 'text/event-stream');
      const res = mockResponse();

      await controller.getProgress('task-1', req, res);

      expect(mockService.getProgressForSse).toHaveBeenCalledWith('task-1', res, req);
    });

    it('should return JSON progress for normal requests', async () => {
      const req = mockRequest('user-1', 'application/json');
      const res = mockResponse();
      mockService.getProgress.mockResolvedValue({ status: 'PROCESSING', totalCount: 5, errorCount: 0, completedCount: 2 });

      await controller.getProgress('task-1', req, res);

      expect(mockService.getProgress).toHaveBeenCalledWith('task-1', 'user-1');
      expect(res.json).toHaveBeenCalledWith({ status: 'PROCESSING', totalCount: 5, errorCount: 0, completedCount: 2 });
    });
  });

  describe('downloadZip', () => {
    it('should set zip headers and pipe file to response', async () => {
      mockService.getDownloadPath.mockResolvedValue('/tmp/exports/batch-1.zip');

      const res = mockResponse();
      const req = mockRequest('user-1');

      await controller.downloadZip('task-1', req, res);

      expect(mockService.getDownloadPath).toHaveBeenCalledWith('task-1', 'user-1');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '1024');
    });
  });

  describe('cancelTask', () => {
    it('should cancel a task and return success message', async () => {
      mockService.cancelTask.mockResolvedValue(undefined);

      const result = await controller.cancelTask('task-1', mockRequest());

      expect(mockService.cancelTask).toHaveBeenCalledWith('task-1', 'user-1');
      expect(result).toEqual({ message: 'Task cancelled' });
    });
  });

  describe('getUserTasks', () => {
    it('should return user task list from service', async () => {
      const tasks = [{ taskId: 'task-1', status: 'COMPLETED' }];
      mockService.getUserTasks.mockResolvedValue(tasks);

      const result = await controller.getUserTasks(mockRequest());

      expect(mockService.getUserTasks).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(tasks);
    });
  });

  describe('getFolderFiles', () => {
    it('should return recursive folder file tree', async () => {
      const tree = { nodeId: 'folder-1', fileName: 'drawings', isFolder: true, children: [] };
      mockService.getFolderFilesRecursive.mockResolvedValue(tree);

      const result = await controller.getFolderFiles('folder-1', mockRequest());

      expect(mockService.getFolderFilesRecursive).toHaveBeenCalledWith('folder-1', 'user-1');
      expect(result).toBe(tree);
    });
  });
});
