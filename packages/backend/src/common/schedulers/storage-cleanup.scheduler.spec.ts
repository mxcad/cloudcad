import { Test, type TestingModule } from '@nestjs/testing';
import { StorageCleanupScheduler } from './storage-cleanup.scheduler';
import { StorageCleanupService } from '../../storage-management/services/storage-cleanup.service';
import { DiskMonitorService } from '../../storage-management/services/disk-monitor.service';
import { FileLockService } from '../../storage-management/services/file-lock.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { TaskRunService } from '../../task-run/task-run.service';

describe('StorageCleanupScheduler', () => {
	let scheduler: StorageCleanupScheduler;

	const mockStorageCleanupService = {
		cleanupExpiredStorage: jest.fn(),
		cleanupExpiredTrash: jest.fn(),
		cleanupOrphans: jest.fn(),
	};

	const mockDiskMonitorService = {
		getHealthReport: jest.fn(),
	};

	const mockFileLockService = {
		cleanupExpiredLocks: jest.fn(),
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

	const baseStats = {
		path: 'D:',
		total: 100 * 1024 * 1024 * 1024,
		free: 15 * 1024 * 1024 * 1024,
		used: 85 * 1024 * 1024 * 1024,
		usagePercentage: 85,
	};

	const buildHealthReport = (
		warning: boolean,
		critical: boolean,
		message: string
	) => ({
		healthy: !critical,
		status: {
			stats: baseStats,
			warning,
			critical,
			message,
		},
		recommendation: 'rec',
	});

	beforeEach(async () => {
		jest.clearAllMocks();
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageCleanupScheduler,
				{ provide: StorageCleanupService, useValue: mockStorageCleanupService },
				{ provide: DiskMonitorService, useValue: mockDiskMonitorService },
				{ provide: FileLockService, useValue: mockFileLockService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
			],
		}).compile();

		scheduler = module.get<StorageCleanupScheduler>(StorageCleanupScheduler);
	});

	// ==================== handleDiskMonitor 磁盘告警接线 ====================
	describe('handleDiskMonitor', () => {
		it('should raise disk_space_critical and resolve low key when critical', async () => {
			mockDiskMonitorService.getHealthReport.mockReturnValue(
				buildHealthReport(true, true, 'Disk space critically low!')
			);

			await scheduler.handleDiskMonitor();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'disk-monitor',
				messageKey: 'disk_space_critical',
				level: AlertLevel.CRITICAL,
				message: 'Disk space critically low!',
				detail: {
					free: baseStats.free,
					total: baseStats.total,
					used: baseStats.used,
					usagePercentage: 85,
					path: 'D:',
				},
			});
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
				'disk-monitor',
				'disk_space_low'
			);
			expect(mockAlertService.raise).not.toHaveBeenCalledWith(
				expect.objectContaining({ messageKey: 'disk_space_low' })
			);
		});

		it('should raise disk_space_low and resolve critical key when warning', async () => {
			mockDiskMonitorService.getHealthReport.mockReturnValue(
				buildHealthReport(true, false, 'Disk space low!')
			);

			await scheduler.handleDiskMonitor();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'disk-monitor',
				messageKey: 'disk_space_low',
				level: AlertLevel.WARNING,
				message: 'Disk space low!',
				detail: {
					free: baseStats.free,
					total: baseStats.total,
					used: baseStats.used,
					usagePercentage: 85,
					path: 'D:',
				},
			});
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
				'disk-monitor',
				'disk_space_critical'
			);
		});

		it('should resolve both keys when disk is normal', async () => {
			mockDiskMonitorService.getHealthReport.mockReturnValue(
				buildHealthReport(false, false, 'Disk status normal')
			);

			await scheduler.handleDiskMonitor();

			expect(mockAlertService.raise).not.toHaveBeenCalled();
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
				'disk-monitor',
				'disk_space_low'
			);
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
				'disk-monitor',
				'disk_space_critical'
			);
		});

		it('should not throw when alert raise fails', async () => {
			mockDiskMonitorService.getHealthReport.mockReturnValue(
				buildHealthReport(true, false, 'Disk space low!')
			);
			mockAlertService.raise.mockRejectedValue(new Error('db down'));

			await expect(scheduler.handleDiskMonitor()).resolves.toBeUndefined();
		});
	});

	// ==================== 定时任务失败钩子 ====================
	describe('task failure hooks', () => {
		it('should raise task_run_failed when cleanupExpiredStorage throws', async () => {
			mockStorageCleanupService.cleanupExpiredStorage.mockRejectedValue(
				new Error('cleanup error')
			);

			await scheduler.handleCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:storage-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.CRITICAL,
				message: expect.stringContaining('cleanup error'),
				detail: {
					task: 'handleCleanup',
					error: 'cleanup error',
				},
			});
		});

		it('should raise task_run_failed when cleanupExpiredTrash throws', async () => {
			mockStorageCleanupService.cleanupExpiredTrash.mockRejectedValue(
				new Error('trash error')
			);

			await scheduler.handleTrashCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:storage-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.CRITICAL,
				message: expect.stringContaining('trash error'),
				detail: {
					task: 'handleTrashCleanup',
					error: 'trash error',
				},
			});
		});

		it('should raise task_run_failed when cleanupExpiredLocks throws', async () => {
			mockFileLockService.cleanupExpiredLocks.mockRejectedValue(
				new Error('lock error')
			);

			await scheduler.handleLockCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:storage-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.CRITICAL,
				message: expect.stringContaining('lock error'),
				detail: {
					task: 'handleLockCleanup',
					error: 'lock error',
				},
			});
		});

		it('should raise task_run_failed when cleanupOrphans throws', async () => {
			mockStorageCleanupService.cleanupOrphans.mockRejectedValue(
				new Error('orphan error')
			);

			await scheduler.handleOrphanCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:storage-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.CRITICAL,
				message: expect.stringContaining('orphan error'),
				detail: {
					task: 'handleOrphanCleanup',
					error: 'orphan error',
				},
			});
		});

		it('should raise task_run_failed when disk check throws', async () => {
			mockDiskMonitorService.getHealthReport.mockImplementation(() => {
				throw new Error('disk query error');
			});

			await scheduler.handleDiskMonitor();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:storage-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.CRITICAL,
				message: expect.stringContaining('disk query error'),
				detail: {
					task: 'handleDiskMonitor',
					error: 'disk query error',
				},
			});
		});

		it('should not throw when alert raise fails inside failure hook', async () => {
			mockStorageCleanupService.cleanupExpiredStorage.mockRejectedValue(
				new Error('cleanup error')
			);
			mockAlertService.raise.mockRejectedValue(new Error('db down'));

			await expect(scheduler.handleCleanup()).resolves.toBeUndefined();
		});
	});
});
