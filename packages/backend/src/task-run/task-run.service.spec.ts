import { Test, type TestingModule } from '@nestjs/testing';
import { TaskRunService } from './task-run.service';
import { DatabaseService } from '../database/database.service';
import { TaskRunStatus, TaskRunTrigger } from './enums/task-run.enum';

describe('TaskRunService', () => {
	let service: TaskRunService;

	const mockPrisma = {
		taskRun: {
			create: jest.fn(),
			findMany: jest.fn(),
			count: jest.fn(),
			deleteMany: jest.fn(),
		},
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				TaskRunService,
				{ provide: DatabaseService, useValue: mockPrisma },
			],
		}).compile();

		service = module.get<TaskRunService>(TaskRunService);
	});

	describe('run', () => {
		it('should record SUCCESS with duration and return result', async () => {
			mockPrisma.taskRun.create.mockResolvedValue({});

			const result = await service.run('test:task', async () => 42);

			expect(result).toBe(42);
			expect(mockPrisma.taskRun.create).toHaveBeenCalledTimes(1);
			const record = mockPrisma.taskRun.create.mock.calls[0][0].data;
			expect(record.taskName).toBe('test:task');
			expect(record.status).toBe(TaskRunStatus.SUCCESS);
			expect(record.trigger).toBe(TaskRunTrigger.SCHEDULED);
			expect(record.startedAt).toBeInstanceOf(Date);
			expect(record.finishedAt).toBeInstanceOf(Date);
			expect(record.durationMs).toBeGreaterThanOrEqual(0);
			expect(record.errorSummary).toBeUndefined();
		});

		it('should record FAILED with error summary and rethrow', async () => {
			mockPrisma.taskRun.create.mockResolvedValue({});
			const error = new Error('boom');

			await expect(
				service.run('test:task', async () => {
					throw error;
				})
			).rejects.toThrow('boom');

			expect(mockPrisma.taskRun.create).toHaveBeenCalledTimes(1);
			const record = mockPrisma.taskRun.create.mock.calls[0][0].data;
			expect(record.status).toBe(TaskRunStatus.FAILED);
			expect(record.errorSummary).toBe('boom');
		});

		it('should record MANUAL trigger with triggeredBy when meta provided', async () => {
			mockPrisma.taskRun.create.mockResolvedValue({});

			await service.run(
				'test:task',
				async () => 1,
				{ trigger: TaskRunTrigger.MANUAL, triggeredBy: 'user-1' }
			);

			const record = mockPrisma.taskRun.create.mock.calls[0][0].data;
			expect(record.trigger).toBe(TaskRunTrigger.MANUAL);
			expect(record.triggeredBy).toBe('user-1');
		});

		it('should truncate error summary to 500 chars', async () => {
			mockPrisma.taskRun.create.mockResolvedValue({});
			const longMessage = 'x'.repeat(600);

			await expect(
				service.run('test:task', async () => {
					throw new Error(longMessage);
				})
			).rejects.toThrow(longMessage);

			const record = mockPrisma.taskRun.create.mock.calls[0][0].data;
			expect(record.errorSummary).toHaveLength(500);
		});

		it('should not swallow task result when record write fails', async () => {
			mockPrisma.taskRun.create.mockRejectedValue(new Error('db down'));

			const result = await service.run('test:task', async () => 'ok');

			expect(result).toBe('ok');
		});

		it('should rethrow task error even when record write fails', async () => {
			mockPrisma.taskRun.create.mockRejectedValue(new Error('db down'));

			await expect(
				service.run('test:task', async () => {
					throw new Error('task failed');
				})
			).rejects.toThrow('task failed');
		});
	});

	describe('register / getRunner / listRunners', () => {
		it('should register runner and expose it', () => {
			const runner = { description: 'desc', execute: jest.fn() };

			service.register('test:task', runner);

			expect(service.getRunner('test:task')).toBe(runner);
			expect(service.listRunners()).toEqual([
				{ taskName: 'test:task', description: 'desc' },
			]);
		});

		it('should return undefined for unknown task', () => {
			expect(service.getRunner('unknown:task')).toBeUndefined();
		});
	});

	describe('findRecent', () => {
		it('should query with filters and pagination', async () => {
			const records = [{ id: '1' }];
			mockPrisma.taskRun.findMany.mockResolvedValue(records);
			mockPrisma.taskRun.count.mockResolvedValue(1);

			const result = await service.findRecent(
				{
					taskName: 'test:task',
					status: TaskRunStatus.FAILED,
					trigger: TaskRunTrigger.MANUAL,
				},
				{ page: 2, limit: 10 }
			);

			expect(mockPrisma.taskRun.findMany).toHaveBeenCalledWith({
				where: {
					taskName: 'test:task',
					status: TaskRunStatus.FAILED,
					trigger: TaskRunTrigger.MANUAL,
				},
				orderBy: { startedAt: 'desc' },
				skip: 10,
				take: 10,
			});
			expect(result.data).toEqual(records);
			expect(result.pagination).toEqual({
				page: 2,
				limit: 10,
				total: 1,
				totalPages: 1,
			});
		});

		it('should omit empty filters', async () => {
			mockPrisma.taskRun.findMany.mockResolvedValue([]);
			mockPrisma.taskRun.count.mockResolvedValue(0);

			await service.findRecent({}, { page: 1, limit: 20 });

			expect(mockPrisma.taskRun.findMany).toHaveBeenCalledWith({
				where: {},
				orderBy: { startedAt: 'desc' },
				skip: 0,
				take: 20,
			});
		});
	});

	describe('cleanupOldRuns (#271)', () => {
		it('should delete records with startedAt older than retention window', async () => {
			mockPrisma.taskRun.deleteMany.mockResolvedValue({ count: 42 });
			jest.useFakeTimers();
			jest.setSystemTime(new Date('2026-08-11T12:00:00Z'));
			try {
				const count = await service.cleanupOldRuns(30);

				expect(count).toBe(42);
				const arg = mockPrisma.taskRun.deleteMany.mock.calls[0][0];
				expect(arg.where.startedAt.lt).toBeInstanceOf(Date);
				// 30 天前：2026-07-12T12:00:00Z
				expect(arg.where.startedAt.lt.toISOString()).toBe(
					'2026-07-12T12:00:00.000Z'
				);
			} finally {
				jest.useRealTimers();
			}
		});

		it('should return 0 and not throw when deletion fails', async () => {
			mockPrisma.taskRun.deleteMany.mockRejectedValue(
				new Error('db down')
			);

			await expect(service.cleanupOldRuns(30)).resolves.toBe(0);
		});
	});
});
