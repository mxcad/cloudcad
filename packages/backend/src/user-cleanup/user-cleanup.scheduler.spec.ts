import { Test, type TestingModule } from '@nestjs/testing';
import { UserCleanupScheduler } from './user-cleanup.scheduler';
import { UserCleanupService } from './user-cleanup.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';

describe('UserCleanupScheduler', () => {
	let scheduler: UserCleanupScheduler;

	const mockUserCleanupService = {
		cleanupExpiredUsers: jest.fn(),
	};

	const mockRuntimeConfigService = {
		getValue: jest.fn(),
	};

	const mockAlertService = {
		raise: jest.fn(),
		resolveBySourceKey: jest.fn(),
	};

	const mockTaskRunService = {
		run: jest.fn(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		),
		register: jest.fn(),
		getRunner: jest.fn(),
		listRunners: jest.fn(),
	};

	const successResult = {
		success: true,
		processedUsers: 3,
		deletedMembers: 2,
		deletedProjects: 1,
		deletedAuditLogs: 5,
		markedForStorageCleanup: 1,
		errors: [],
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				UserCleanupScheduler,
				{ provide: UserCleanupService, useValue: mockUserCleanupService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
			],
		}).compile();

		scheduler = module.get<UserCleanupScheduler>(UserCleanupScheduler);
	});

	describe('handleCleanup', () => {
		it('should run task through TaskRunService and record result', async () => {
			mockUserCleanupService.cleanupExpiredUsers.mockResolvedValue(
				successResult
			);

			await scheduler.handleCleanup();

			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'user-cleanup:users',
				expect.any(Function)
			);
			expect(mockAlertService.raise).not.toHaveBeenCalled();
		});

		it('should skip when userCleanupEnabled is false', async () => {
			mockRuntimeConfigService.getValue.mockResolvedValue(false);

			await scheduler.handleCleanup();

			expect(mockUserCleanupService.cleanupExpiredUsers).not.toHaveBeenCalled();
			expect(mockTaskRunService.run).not.toHaveBeenCalled();
		});

		it('should raise task_run_failed when cleanup throws', async () => {
			mockUserCleanupService.cleanupExpiredUsers.mockRejectedValue(
				new Error('user cleanup error')
			);

			await scheduler.handleCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:user-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.CRITICAL,
				message: expect.stringContaining('user cleanup error'),
				detail: {
					task: 'handleCleanup',
					error: 'user cleanup error',
				},
			});
		});

		it('should not throw when alert raise fails', async () => {
			mockUserCleanupService.cleanupExpiredUsers.mockRejectedValue(
				new Error('user cleanup error')
			);
			mockAlertService.raise.mockRejectedValue(new Error('db down'));

			await expect(scheduler.handleCleanup()).resolves.toBeUndefined();
		});
	});
});
