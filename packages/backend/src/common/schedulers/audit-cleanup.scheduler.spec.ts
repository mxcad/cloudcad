import { Test, type TestingModule } from '@nestjs/testing';
import { AuditCleanupScheduler } from './audit-cleanup.scheduler';
import { AuditLogService } from '../../audit/audit-log.service';
import { ConfigService } from '@nestjs/config';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { TaskRunService } from '../../task-run/task-run.service';

describe('AuditCleanupScheduler', () => {
	let scheduler: AuditCleanupScheduler;

	const mockAuditLogService = {
		cleanupOldLogs: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn(),
	};

	const mockAlertService = {
		raise: jest.fn(),
		resolveBySourceKey: jest.fn(),
	};

	const mockRuntimeConfigService = {
		getValue: jest.fn(),
	};

	const mockTaskRunService = {
		run: jest.fn(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		),
		register: jest.fn(),
		getRunner: jest.fn(),
		listRunners: jest.fn(),
		cleanupOldRuns: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockConfigService.get.mockImplementation((key: string, def: unknown) => def);
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuditCleanupScheduler,
				{ provide: AuditLogService, useValue: mockAuditLogService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
			],
		}).compile();

		scheduler = module.get<AuditCleanupScheduler>(AuditCleanupScheduler);
	});

	// ==================== cleanupOldAuditLogs ====================
	describe('cleanupOldAuditLogs', () => {
		it('should not raise alert on success', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(10);
			mockTaskRunService.cleanupOldRuns.mockResolvedValue(0);

			await scheduler.cleanupOldAuditLogs();

			expect(mockAlertService.raise).not.toHaveBeenCalled();
		});

		it('should use AUDIT_LOG_RETENTION_DAYS default of 180 (#207)', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(10);
			mockTaskRunService.cleanupOldRuns.mockResolvedValue(0);

			await scheduler.cleanupOldAuditLogs();

			expect(mockConfigService.get).toHaveBeenCalledWith(
				'audit.retentionDays',
				180
			);
			expect(mockAuditLogService.cleanupOldLogs).toHaveBeenCalledWith(180);
		});

		it('should cleanup TaskRun retention with TASK_RUN_RETENTION_DAYS default of 30 (#271)', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(10);
			mockTaskRunService.cleanupOldRuns.mockResolvedValue(5);

			await scheduler.cleanupOldAuditLogs();

			expect(mockConfigService.get).toHaveBeenCalledWith(
				'taskRun.retentionDays',
				30
			);
			expect(mockTaskRunService.cleanupOldRuns).toHaveBeenCalledWith(30);
		});

		it('should skip deletion when archive is enabled (fail-closed #223)', async () => {
			mockConfigService.get.mockImplementation((key: string, def: unknown) => {
				if (key === 'AUDIT_ARCHIVE_ENABLED') return true;
				return def;
			});
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(10);

			await scheduler.cleanupOldAuditLogs();

			expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
			expect(mockAlertService.raise).not.toHaveBeenCalled();
		});

		it('should raise task_run_failed and rethrow when cleanup fails', async () => {
			mockAuditLogService.cleanupOldLogs.mockRejectedValue(
				new Error('audit cleanup error')
			);

			await expect(scheduler.cleanupOldAuditLogs()).rejects.toThrow(
				'audit cleanup error'
			);

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:audit-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.P2,
				message: expect.stringContaining('audit cleanup error'),
				detail: {
					task: 'cleanupOldAuditLogs',
					error: 'audit cleanup error',
				},
			});
		});

		it('should still rethrow original error when alert raise fails', async () => {
			mockAuditLogService.cleanupOldLogs.mockRejectedValue(
				new Error('original error')
			);
			mockAlertService.raise.mockRejectedValue(new Error('db down'));

			await expect(scheduler.cleanupOldAuditLogs()).rejects.toThrow(
				'original error'
			);
		});
	});

	// ==================== manualCleanup ====================
	describe('manualCleanup', () => {
		it('should skip deletion when archive is enabled (fail-closed #223)', async () => {
			mockConfigService.get.mockImplementation((key: string, def: unknown) => {
				if (key === 'AUDIT_ARCHIVE_ENABLED') return true;
				return def;
			});

			const result = await scheduler.manualCleanup(30);

			expect(result).toBe(0);
			expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
		});

		it('should clean up with explicit retention days', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(42);

			const result = await scheduler.manualCleanup(30);

			expect(result).toBe(42);
			expect(mockAuditLogService.cleanupOldLogs).toHaveBeenCalledWith(30);
		});
	});
});
