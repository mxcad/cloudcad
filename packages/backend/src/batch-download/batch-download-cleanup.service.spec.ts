import { Test, type TestingModule } from '@nestjs/testing';
import { BatchDownloadCleanupService } from './batch-download-cleanup.service';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';
import { BatchJobStatus } from '@cloudcad/db';

describe('BatchDownloadCleanupService', () => {
	let service: BatchDownloadCleanupService;

	const mockPrisma = {
		batchDownloadJob: {
			findMany: jest.fn(),
			deleteMany: jest.fn(),
		},
	};

	const mockConfigService = {
		get: jest.fn().mockReturnValue({
			exportDir: 'data/batch-download',
			zipRetentionHours: 24,
			dbRetentionDays: 7,
		}),
	};

	const mockRuntimeConfigService = {
		getValue: jest.fn(),
	};

	const mockAlertService = {
		raise: jest.fn(),
	};

	const mockTaskRunService = {
		run: jest.fn(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		),
		register: jest.fn(),
		getRunner: jest.fn(),
		listRunners: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockConfigService.get.mockReturnValue({
			exportDir: 'data/batch-download',
			zipRetentionHours: 24,
			dbRetentionDays: 7,
		});
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				BatchDownloadCleanupService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
			],
		}).compile();

		service = module.get<BatchDownloadCleanupService>(
			BatchDownloadCleanupService
		);
	});

	describe('cleanupExpiredZips', () => {
		it('should query expired completed jobs with zipPath', async () => {
			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([]);

			await service.cleanupExpiredZips();

			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'batch-download:zip-cleanup',
				expect.any(Function)
			);
			const where = mockPrisma.batchDownloadJob.findMany.mock.calls[0][0]
				.where;
			expect(where.status).toBe(BatchJobStatus.COMPLETED);
			expect(where.zipPath).toEqual({ not: null });
			expect(where.completedAt.lte).toBeInstanceOf(Date);
		});

		it('should skip when batchDownloadCleanupEnabled is false', async () => {
			mockRuntimeConfigService.getValue.mockResolvedValue(false);

			await service.cleanupExpiredZips();

			expect(mockPrisma.batchDownloadJob.findMany).not.toHaveBeenCalled();
		});

		it('should raise task_run_failed when query throws', async () => {
			mockPrisma.batchDownloadJob.findMany.mockRejectedValue(
				new Error('zip query error')
			);

			await service.cleanupExpiredZips();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:batch-download',
				messageKey: 'task_run_failed',
				level: AlertLevel.CRITICAL,
				message: expect.stringContaining('zip query error'),
				detail: {
					task: 'cleanupExpiredZips',
					error: 'zip query error',
				},
			});
		});
	});

	describe('cleanupExpiredDbRecords', () => {
		it('should delete expired db records', async () => {
			mockPrisma.batchDownloadJob.deleteMany.mockResolvedValue({
				count: 3,
			});

			await service.cleanupExpiredDbRecords();

			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'batch-download:db-cleanup',
				expect.any(Function)
			);
			const where = mockPrisma.batchDownloadJob.deleteMany.mock.calls[0][0]
				.where;
			expect(where.createdAt.lte).toBeInstanceOf(Date);
		});

		it('should raise task_run_failed when delete throws', async () => {
			mockPrisma.batchDownloadJob.deleteMany.mockRejectedValue(
				new Error('db delete error')
			);

			await service.cleanupExpiredDbRecords();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:batch-download',
				messageKey: 'task_run_failed',
				level: AlertLevel.CRITICAL,
				message: expect.stringContaining('db delete error'),
				detail: {
					task: 'cleanupExpiredDbRecords',
					error: 'db delete error',
				},
			});
		});
	});
});
