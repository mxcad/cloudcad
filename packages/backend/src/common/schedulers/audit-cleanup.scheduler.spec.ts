import { Test, type TestingModule } from '@nestjs/testing';
import { AuditCleanupScheduler } from './audit-cleanup.scheduler';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditArchiveService } from '../../audit/audit-archive.service';
import { ConfigService } from '@nestjs/config';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { TaskRunService } from '../../task-run/task-run.service';
import { TASK_NAMES } from '../../task-run/task-run.constants';
import {
	CLEANUP_PARTIAL_MESSAGE_KEY,
	CleanupMetricsService,
} from '../../metrics/cleanup-metrics.service';

describe('AuditCleanupScheduler', () => {
	let scheduler: AuditCleanupScheduler;

	const mockAuditLogService = {
		cleanupOldLogs: jest.fn(),
	};

	const mockAuditArchiveService = {
		archiveExpiredLogs: jest.fn(),
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

	const mockCleanupMetrics = {
		observe: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockConfigService.get.mockImplementation((key: string, def: unknown) => def);
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);
		mockAuditLogService.cleanupOldLogs.mockResolvedValue(0);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuditCleanupScheduler,
				{ provide: AuditLogService, useValue: mockAuditLogService },
				{ provide: AuditArchiveService, useValue: mockAuditArchiveService },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
				{ provide: CleanupMetricsService, useValue: mockCleanupMetrics },
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

		it('should use AUDIT_LOG_RETENTION_DAYS default of 183 (#322)', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(10);
			mockTaskRunService.cleanupOldRuns.mockResolvedValue(0);

			await scheduler.cleanupOldAuditLogs();

			expect(mockConfigService.get).toHaveBeenCalledWith(
				'audit.retentionDays',
				183
			);
			expect(mockAuditLogService.cleanupOldLogs).toHaveBeenCalledWith(183);
		});

		it('should cleanup TaskRun retention with TASK_RUN_RETENTION_DAYS default of 180 (#326)', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(10);
			mockTaskRunService.cleanupOldRuns.mockResolvedValue(5);

			await scheduler.cleanupOldAuditLogs();

			expect(mockConfigService.get).toHaveBeenCalledWith(
				'taskRun.retentionDays',
				180
			);
			expect(mockTaskRunService.cleanupOldRuns).toHaveBeenCalledWith(180);
		});

		it('should route to archive-then-delete when archive enabled (#322 fail-closed)', async () => {
			mockConfigService.get.mockImplementation((key: string, def: unknown) => {
				if (key === 'audit.archiveEnabled') return true;
				return def;
			});
			mockAuditArchiveService.archiveExpiredLogs.mockResolvedValue({
				files: [{ month: '2026-06', sha256: 'abc', recordCount: 7 }],
				archivedCount: 7,
				deletedCount: 7,
			});

			await scheduler.cleanupOldAuditLogs();

			expect(mockAuditArchiveService.archiveExpiredLogs).toHaveBeenCalledWith(
				183
			);
			expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
		});

		it('should raise task_run_failed when archive fails (fail-closed keeps logs)', async () => {
			mockConfigService.get.mockImplementation((key: string, def: unknown) => {
				if (key === 'audit.archiveEnabled') return true;
				return def;
			});
			mockAuditArchiveService.archiveExpiredLogs.mockRejectedValue(
				new Error('archive write failed')
			);

			await expect(scheduler.cleanupOldAuditLogs()).rejects.toThrow(
				'archive write failed'
			);

			expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
			expect(mockAlertService.raise).toHaveBeenCalledWith(
				expect.objectContaining({
					source: 'scheduler:audit-cleanup',
					messageKey: 'task_run_failed',
					level: AlertLevel.P1,
				})
			);
		});

		it('should raise task_run_failed (P1) and rethrow when direct delete fails (#325 分级)', async () => {
			mockAuditLogService.cleanupOldLogs.mockRejectedValue(
				new Error('audit cleanup error')
			);

			await expect(scheduler.cleanupOldAuditLogs()).rejects.toThrow(
				'audit cleanup error'
			);

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:audit-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.P1,
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

	// ==================== cleanup_* 指标埋点（#325） ====================
	describe('cleanup metrics instrumentation (#325)', () => {
		it('observes audit log cleanup row count and duration', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(10);
			mockTaskRunService.cleanupOldRuns.mockResolvedValue(0);

			await scheduler.cleanupOldAuditLogs();

			expect(mockCleanupMetrics.observe).toHaveBeenCalledWith({
				task: TASK_NAMES.AUDIT_CLEANUP.LOGS,
				recordsDeleted: 10,
				durationSeconds: expect.any(Number),
			});
		});

		it('observes task-run cleanup row count and duration', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(0);
			mockTaskRunService.cleanupOldRuns.mockResolvedValue(5);

			await scheduler.cleanupOldAuditLogs();

			expect(mockCleanupMetrics.observe).toHaveBeenCalledWith({
				task: TASK_NAMES.AUDIT_CLEANUP.RUNS,
				recordsDeleted: 5,
				durationSeconds: expect.any(Number),
			});
		});

		it('observes archived delete count on the archive-enabled path', async () => {
			mockConfigService.get.mockImplementation((key: string, def: unknown) => {
				if (key === 'audit.archiveEnabled') return true;
				return def;
			});
			mockAuditArchiveService.archiveExpiredLogs.mockResolvedValue({
				files: [],
				archivedCount: 7,
				deletedCount: 7,
			});

			await scheduler.cleanupOldAuditLogs();

			expect(mockCleanupMetrics.observe).toHaveBeenCalledWith({
				task: TASK_NAMES.AUDIT_CLEANUP.LOGS,
				recordsDeleted: 7,
				durationSeconds: expect.any(Number),
			});
		});
	});

	// ==================== manualCleanup ====================
	describe('manualCleanup', () => {
		it('should route to archive service when archive enabled (#322)', async () => {
			mockConfigService.get.mockImplementation((key: string, def: unknown) => {
				if (key === 'audit.archiveEnabled') return true;
				return def;
			});
			mockAuditArchiveService.archiveExpiredLogs.mockResolvedValue({
				files: [],
				archivedCount: 30,
				deletedCount: 30,
			});

			const result = await scheduler.manualCleanup(30);

			expect(result).toBe(30);
			expect(mockAuditArchiveService.archiveExpiredLogs).toHaveBeenCalledWith(
				30
			);
			expect(mockAuditLogService.cleanupOldLogs).not.toHaveBeenCalled();
		});

		it('should clean up with explicit retention days when archive disabled', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(42);

			const result = await scheduler.manualCleanup(30);

			expect(result).toBe(42);
			expect(mockAuditLogService.cleanupOldLogs).toHaveBeenCalledWith(30);
		});

		it('observes metrics on manual cleanup too (#325)', async () => {
			mockAuditLogService.cleanupOldLogs.mockResolvedValue(7);

			await scheduler.manualCleanup(30);

			expect(mockCleanupMetrics.observe).toHaveBeenCalledWith({
				task: TASK_NAMES.AUDIT_CLEANUP.LOGS,
				recordsDeleted: 7,
				durationSeconds: expect.any(Number),
			});
		});
	});

	// CLEANUP_PARTIAL_MESSAGE_KEY 为部分成功告警共享键（audit 归档路径 fail-closed 抛错走完全失败，无部分成功分支）
	it('exposes the shared partial message key', () => {
		expect(CLEANUP_PARTIAL_MESSAGE_KEY).toBe('cleanup.partial');
	});
});
