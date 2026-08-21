import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProgressTrackerService } from './progress-tracker.service';

describe('ProgressTrackerService', () => {
  let tracker: ProgressTrackerService;
  let mockPrisma: any;
  let mockEventEmitter: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = {
      batchDownloadJob: {
        update: jest.fn(),
      },
    };
    mockEventEmitter = { emit: jest.fn() };
    mockLogger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    tracker = new ProgressTrackerService(
      mockPrisma,
      mockEventEmitter as unknown as EventEmitter2
    );
    (tracker as any).logger = mockLogger;
  });

  describe('syncCounts', () => {
    it('should update job counts in database', async () => {
      mockPrisma.batchDownloadJob.update.mockResolvedValue({});

      await tracker.syncCounts('job-1', 5, 2);

      expect(mockPrisma.batchDownloadJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { completedCount: 5, errorCount: 2 },
      });
    });

    it('should log warning on update failure', async () => {
      mockPrisma.batchDownloadJob.update.mockRejectedValue(
        new Error('DB error')
      );

      await tracker.syncCounts('job-1', 5, 2);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync counts for job job-1')
      );
    });
  });

  describe('emitProgress', () => {
    it('should emit progress event', () => {
      tracker.emitProgress('task-1', 'PROCESSING', 3, 10, 1, 'file.dwg');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'batch-download.progress.task-1',
        expect.objectContaining({
          taskId: 'task-1',
          status: 'PROCESSING',
          completedCount: 3,
          totalCount: 10,
          errorCount: 1,
          currentFile: 'file.dwg',
        })
      );
    });

    it('should emit progress with errors', () => {
      const errors = [{ nodeId: 'n1', fileName: 'f.dwg', error: 'not found' }];
      tracker.emitProgress('task-1', 'FAILED', 0, 1, 1, undefined, errors);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'batch-download.progress.task-1',
        expect.objectContaining({
          status: 'FAILED',
          errors,
        })
      );
    });
  });
});
