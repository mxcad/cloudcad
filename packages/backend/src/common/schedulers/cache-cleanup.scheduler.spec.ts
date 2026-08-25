import { Test, type TestingModule } from '@nestjs/testing';
import { CacheCleanupScheduler } from './cache-cleanup.scheduler';
import { PermissionCacheService } from '../../permission/services/permission-cache.service';
import { CacheMonitorService } from '../../cache-architecture/services/cache-monitor.service';
import { CACHE_ALERT_KEYS } from '../../cache-architecture/services/cache-monitor.service';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { TaskRunService } from '../../task-run/task-run.service';

describe('CacheCleanupScheduler', () => {
	let scheduler: CacheCleanupScheduler;

	const mockCacheService = {
		getStats: jest.fn(),
	};

	const mockCacheMonitorService = {
		checkWarningItems: jest.fn(),
		getHealthStatus: jest.fn(),
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
	};

	const warningItem = {
		key: CACHE_ALERT_KEYS.L1_CAPACITY,
		level: AlertLevel.P1,
		message: 'L1 缓存容量使用率超过 90% (950/1000)',
		detail: { size: 950, maxCapacity: 1000 },
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CacheCleanupScheduler,
				{ provide: PermissionCacheService, useValue: mockCacheService },
				{ provide: CacheMonitorService, useValue: mockCacheMonitorService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
			],
		}).compile();

		scheduler = module.get<CacheCleanupScheduler>(CacheCleanupScheduler);
	});

	// ==================== handleCacheCleanup 缓存告警接线 ====================
	describe('handleCacheCleanup', () => {
		it('should raise alert for each warning item and resolve inactive keys', async () => {
			mockCacheMonitorService.checkWarningItems.mockResolvedValue([
				warningItem,
			]);

			await scheduler.handleCacheCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledTimes(1);
			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'cache-monitor',
				messageKey: CACHE_ALERT_KEYS.L1_CAPACITY,
				level: AlertLevel.P1,
				message: 'L1 缓存容量使用率超过 90% (950/1000)',
				detail: { size: 950, maxCapacity: 1000 },
			});

			// 未触发的 3 个 key 自动恢复
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledTimes(3);
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
				'cache-monitor',
				CACHE_ALERT_KEYS.HIT_RATE
			);
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
				'cache-monitor',
				CACHE_ALERT_KEYS.L2_DISCONNECTED
			);
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledWith(
				'cache-monitor',
				CACHE_ALERT_KEYS.MEMORY_HIGH
			);
		});

		it('should raise P0 for L2 disconnected item', async () => {
			mockCacheMonitorService.checkWarningItems.mockResolvedValue([
				{
					key: CACHE_ALERT_KEYS.L2_DISCONNECTED,
					level: AlertLevel.P0,
					message: 'L2 缓存（Redis）连接断开',
					detail: { isConnected: false },
				},
			]);

			await scheduler.handleCacheCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'cache-monitor',
				messageKey: CACHE_ALERT_KEYS.L2_DISCONNECTED,
				level: AlertLevel.P0,
				message: 'L2 缓存（Redis）连接断开',
				detail: { isConnected: false },
			});
		});

		it('should resolve all keys when no warnings', async () => {
			mockCacheMonitorService.checkWarningItems.mockResolvedValue([]);

			await scheduler.handleCacheCleanup();

			expect(mockAlertService.raise).not.toHaveBeenCalled();
			expect(mockAlertService.resolveBySourceKey).toHaveBeenCalledTimes(4);
		});

		it('should not throw when alert raise fails', async () => {
			mockCacheMonitorService.checkWarningItems.mockResolvedValue([
				warningItem,
			]);
			mockAlertService.raise.mockRejectedValue(new Error('db down'));

			await expect(scheduler.handleCacheCleanup()).resolves.toBeUndefined();
		});
	});

	// ==================== 定时任务失败钩子 ====================
	describe('task failure hooks', () => {
		it('should raise task_run_failed when checkWarnings throws', async () => {
			mockCacheMonitorService.checkWarningItems.mockRejectedValue(
				new Error('stats unavailable')
			);

			await scheduler.handleCacheCleanup();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:cache-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.P1,
				message: expect.stringContaining('stats unavailable'),
				detail: {
					task: 'handleCacheCleanup',
					error: 'stats unavailable',
				},
			});
		});

		it('should raise task_run_failed when logCacheStats fails', async () => {
			mockCacheService.getStats.mockRejectedValue(new Error('cache error'));

			await scheduler.logCacheStats();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:cache-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.P1,
				message: expect.stringContaining('cache error'),
				detail: {
					task: 'logCacheStats',
					error: 'cache error',
				},
			});
		});

		it('should raise task_run_failed when logHealthStatus fails', async () => {
			mockCacheMonitorService.getHealthStatus.mockRejectedValue(
				new Error('health error')
			);

			await scheduler.logHealthStatus();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:cache-cleanup',
				messageKey: 'task_run_failed',
				level: AlertLevel.P1,
				message: expect.stringContaining('health error'),
				detail: {
					task: 'logHealthStatus',
					error: 'health error',
				},
			});
		});
	});
});
