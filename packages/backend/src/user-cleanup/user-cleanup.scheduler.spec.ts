import { Test, type TestingModule } from '@nestjs/testing';
import { UserCleanupScheduler } from './user-cleanup.scheduler';
import { UserCleanupService } from './user-cleanup.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';
import { TASK_NAMES } from '../task-run/task-run.constants';
import {
	CLEANUP_PARTIAL_MESSAGE_KEY,
	CleanupMetricsService,
} from '../metrics/cleanup-metrics.service';

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

	const mockCleanupMetrics = {
		observe: jest.fn(),
	};

	const successResult = {
		success: true,
		processedUsers: 3,
		deletedMembers: 2,
		deletedProjects: 1,
		deletedAuditLogs: 5,
		deletedRefreshTokens: 3,
		deletedUploadSessions: 1,
		deletedConfigLogs: 2,
		deletedPaymentOrders: 0,
		deletedMemberships: 2,
		deletedFileShares: 1,
		deletedBatchJobs: 4,
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
				{ provide: CleanupMetricsService, useValue: mockCleanupMetrics },
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

		it('should raise task_run_failed (P1) when cleanup throws (#325 分级)', async () => {
			mockUserCleanupService.cleanupExpiredUsers.mockRejectedValue(
				new Error('user cleanup error')
			);

			await scheduler.handleCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:user-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.P1,
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

	// ==================== cleanup_* 指标埋点（#325） ====================
	describe('cleanup metrics instrumentation (#325)', () => {
		it('observes total deleted records and duration on success', async () => {
			mockUserCleanupService.cleanupExpiredUsers.mockResolvedValue(
				successResult
			);

			await scheduler.handleCleanup();

			expect(mockCleanupMetrics.observe).toHaveBeenCalledWith({
				task: TASK_NAMES.USER_CLEANUP.USERS,
				recordsDeleted: 21, // 全部 deleted* 求和
				durationSeconds: expect.any(Number),
			});
			expect(mockAlertService.raise).not.toHaveBeenCalledWith(
				expect.objectContaining({ messageKey: CLEANUP_PARTIAL_MESSAGE_KEY })
			);
		});

		it('raises cleanup.partial (P2) with errorSummary when run completes with errors', async () => {
			mockUserCleanupService.cleanupExpiredUsers.mockResolvedValue({
				...successResult,
				success: false,
				errors: [{ userId: 'u1', message: 'boom' }],
			});

			await scheduler.handleCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:user-cleanup',
				messageKey: CLEANUP_PARTIAL_MESSAGE_KEY,
				level: AlertLevel.P2,
				message: expect.stringContaining('部分成功'),
				detail: {
					task: TASK_NAMES.USER_CLEANUP.USERS,
					errorCount: 1,
					errorSummary: ['[u1] boom'],
				},
			});
			// 部分成功仍计入已删记录
			expect(mockCleanupMetrics.observe).toHaveBeenCalled();
		});

		it('does not raise cleanup.partial when success with empty errors', async () => {
			mockUserCleanupService.cleanupExpiredUsers.mockResolvedValue({
				...successResult,
				success: false,
				errors: [],
			});

			await scheduler.handleCleanup();

			expect(mockAlertService.raise).not.toHaveBeenCalled();
		});
	});
});
