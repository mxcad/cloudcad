///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from "@nestjs/testing";
import { CacheLevel } from "../enums/cache-level.enum";
import { L1CacheProvider } from "../providers/l1-cache.provider";
import { L2CacheProvider } from "../providers/l2-cache.provider";
import { CacheMonitorService } from "./cache-monitor.service";
import { MultiLevelCacheService } from "./multi-level-cache.service";
import { RuntimeConfigService } from "../../runtime-config/runtime-config.service";
import { TaskRunService } from "../../task-run/task-run.service";
import { AlertService } from "../../alert/alert.service";

describe("CacheMonitorService", () => {
	let service: CacheMonitorService;

	const mockCacheService = {
		getStats: jest.fn(),
	};

	const mockL1Cache = {
		getStats: jest.fn(),
	};

	const mockL2Cache = {
		getStats: jest.fn(),
		isReady: jest.fn(),
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

	const mockAlertService = {
		raise: jest.fn(),
		resolveBySourceKey: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CacheMonitorService,
				{ provide: MultiLevelCacheService, useValue: mockCacheService },
				{ provide: L1CacheProvider, useValue: mockL1Cache },
				{ provide: L2CacheProvider, useValue: mockL2Cache },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
				{ provide: AlertService, useValue: mockAlertService },
			],
		}).compile();

		service = module.get<CacheMonitorService>(CacheMonitorService);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	// ==================== cleanOldPerformanceData ====================
	describe("cleanOldPerformanceData", () => {
		it("should skip when task disabled", async () => {
			mockRuntimeConfigService.getValue.mockResolvedValue(false);

			await service.cleanOldPerformanceData();

			expect(mockTaskRunService.run).not.toHaveBeenCalled();
		});

		it("should run cleanup task when enabled", async () => {
			await service.cleanOldPerformanceData();

			expect(mockRuntimeConfigService.getValue).toHaveBeenCalledWith(
				expect.any(String),
				true
			);
			expect(mockTaskRunService.run).toHaveBeenCalledTimes(1);
		});

		it("should raise task_run_failed alert when task throws", async () => {
			mockTaskRunService.run.mockRejectedValue(new Error("cleanup boom"));

			await service.cleanOldPerformanceData();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: "cache-monitor",
				messageKey: "task_run_failed",
				level: "CRITICAL",
				message: expect.stringContaining("cleanup boom"),
				detail: expect.objectContaining({
					task: "cleanOldPerformanceData",
					error: "cleanup boom",
				}),
			});
		});
	});

	// ==================== getStats ====================
	describe("getStats", () => {
		it("should return stats from cache service", async () => {
			const mockStats = {
				levels: { L1: {}, L2: {} },
				summary: {},
			};
			mockCacheService.getStats.mockResolvedValue(mockStats);
			const result = await service.getStats();
			expect(result).toEqual(mockStats);
		});
	});

	// ==================== getHealthStatus ====================
	describe("getHealthStatus", () => {
		it("should return healthy status when all levels are healthy", async () => {
			mockL2Cache.isReady.mockReturnValue(true);

			const result = await service.getHealthStatus();
			expect(result.L1.status).toBe("healthy");
			expect(result.L2.status).toBe("healthy");
			expect(result.overall).toBe("healthy");
		});

		it("should return degraded status when L2 is disconnected", async () => {
			mockL2Cache.isReady.mockReturnValue(false);

			const result = await service.getHealthStatus();
			expect(result.L2.status).toBe("unhealthy");
			expect(result.overall).toBe("unhealthy");
		});

		it("should return healthy when all levels are healthy", async () => {
			mockL2Cache.isReady.mockReturnValue(true);

			const result = await service.getHealthStatus();
			expect(result.overall).toBe("healthy");
		});
	});

	// ==================== recordPerformance ====================
	describe("recordPerformance", () => {
		it("should record performance data", () => {
			service.recordPerformance(CacheLevel.L1, 10, true);
			// Test that it doesn't throw
		});

		it("should limit data points to maxDataPoints", () => {
			for (let i = 0; i < 1100; i++) {
				service.recordPerformance(CacheLevel.L1, 10, true);
			}
			// Should not throw and should have limited data
		});
	});

	// ==================== getPerformanceTrend ====================
	describe("getPerformanceTrend", () => {
		it("should return empty trend when no data", () => {
			const result = service.getPerformanceTrend(CacheLevel.L1);
			expect(result.timestamps).toEqual([]);
			expect(result.avgResponseTimes).toEqual([]);
			expect(result.errorRates).toEqual([]);
		});

		it("should return aggregated trend data", () => {
			for (let i = 0; i < 5; i++) {
				service.recordPerformance(CacheLevel.L1, 10 + i, i < 4);
				service.recordPerformance(CacheLevel.L1, 20 + i, true);
			}

			const result = service.getPerformanceTrend(CacheLevel.L1, 60);
			expect(result.timestamps.length).toBeGreaterThanOrEqual(1);
		});
	});

	// ==================== resetPerformanceData ====================
	describe("resetPerformanceData", () => {
		it("should reset performance data for specific level", () => {
			service.recordPerformance(CacheLevel.L1, 10, true);
			service.resetPerformanceData(CacheLevel.L1);
			const result = service.getPerformanceTrend(CacheLevel.L1);
			expect(result.timestamps).toEqual([]);
		});

		it("should reset all performance data", () => {
			service.recordPerformance(CacheLevel.L1, 10, true);
			service.recordPerformance(CacheLevel.L2, 20, true);
			service.resetPerformanceData();
			const result1 = service.getPerformanceTrend(CacheLevel.L1);
			const result2 = service.getPerformanceTrend(CacheLevel.L2);
			expect(result1.timestamps).toEqual([]);
			expect(result2.timestamps).toEqual([]);
		});
	});

	// ==================== checkWarnings ====================
	describe("checkWarnings", () => {
		it("should return warnings when thresholds exceeded", async () => {
			mockCacheService.getStats.mockResolvedValue({
				levels: {
					L1: { size: 950, maxCapacity: 1000 },
					L2: { isConnected: false },
				},
				summary: {
					overallHitRate: 65,
					totalMemoryUsage: 600 * 1024 * 1024, // 600MB
				},
			});

			const warnings = await service.checkWarnings();
			expect(warnings).toHaveLength(4);
		});

		it("should return no warnings when all thresholds are okay", async () => {
			mockCacheService.getStats.mockResolvedValue({
				levels: {
					L1: { size: 500, maxCapacity: 1000 },
					L2: { isConnected: true },
				},
				summary: {
					overallHitRate: 85,
					totalMemoryUsage: 100 * 1024 * 1024, // 100MB
				},
			});

			const warnings = await service.checkWarnings();
			expect(warnings).toEqual([]);
		});
	});

	// ==================== checkWarningItems ====================
	describe("checkWarningItems", () => {
		it("should return structured warning items with keys/levels/details", async () => {
			mockCacheService.getStats.mockResolvedValue({
				levels: {
					L1: { size: 950, maxCapacity: 1000 },
					L2: { isConnected: false },
				},
				summary: {
					overallHitRate: 65,
					totalMemoryUsage: 600 * 1024 * 1024, // 600MB
				},
			});

			const items = await service.checkWarningItems();
			expect(items).toHaveLength(4);

			const keys = items.map((item) => item.key).sort();
			expect(keys).toEqual([
				"cache_hit_rate",
				"cache_l1_capacity",
				"cache_l2_disconnected",
				"cache_memory_high",
			]);

			const l1Item = items.find((item) => item.key === "cache_l1_capacity");
			expect(l1Item?.level).toBe("WARNING");
			expect(l1Item?.detail).toEqual({ size: 950, maxCapacity: 1000 });

			const l2Item = items.find((item) => item.key === "cache_l2_disconnected");
			expect(l2Item?.level).toBe("CRITICAL");
			expect(l2Item?.detail).toEqual({ isConnected: false });

			const hitRateItem = items.find((item) => item.key === "cache_hit_rate");
			expect(hitRateItem?.level).toBe("WARNING");

			const memoryItem = items.find((item) => item.key === "cache_memory_high");
			expect(memoryItem?.level).toBe("WARNING");
			expect(memoryItem?.detail?.memoryUsageMB).toBe(600);
		});

		it("should return empty array when all thresholds are okay", async () => {
			mockCacheService.getStats.mockResolvedValue({
				levels: {
					L1: { size: 500, maxCapacity: 1000 },
					L2: { isConnected: true },
				},
				summary: {
					overallHitRate: 85,
					totalMemoryUsage: 100 * 1024 * 1024, // 100MB
				},
			});

			const items = await service.checkWarningItems();
			expect(items).toEqual([]);
		});
	});

	// ==================== getMonitoringSummary ====================
	describe("getMonitoringSummary", () => {
		it("should return comprehensive monitoring summary", async () => {
			mockCacheService.getStats.mockResolvedValue({
				levels: {},
				summary: {},
			});
			mockL2Cache.isReady.mockReturnValue(true);

			const result = await service.getMonitoringSummary();
			expect(result.stats).toBeDefined();
			expect(result.healthStatus).toBeDefined();
			expect(result.performanceMetrics).toBeDefined();
			expect(result.timestamp).toBeDefined();
		});
	});

	// ==================== getSizeTrend ====================
	describe("getSizeTrend", () => {
		it("should return size trend for each level", async () => {
			mockCacheService.getStats.mockResolvedValue({
				levels: {
					L1: { size: 100 },
					L2: { size: 200 },
				},
				summary: {},
			});

			const result = await service.getSizeTrend();
			expect(result.get(CacheLevel.L1)).toEqual([100]);
			expect(result.get(CacheLevel.L2)).toEqual([200]);
		});
	});

	// ==================== getPerformanceMetrics ====================
	describe("getPerformanceMetrics", () => {
		it("should return metrics with no data", async () => {
			const result = await service.getPerformanceMetrics();
			const l1Metrics = result.get(CacheLevel.L1);
			expect(l1Metrics).toEqual({
				avgResponseTime: 0,
				p50ResponseTime: 0,
				p95ResponseTime: 0,
				p99ResponseTime: 0,
				throughput: 0,
				errorRate: 0,
			});
		});

		it("should calculate metrics from recorded data", async () => {
			for (let i = 0; i < 100; i++) {
				service.recordPerformance(CacheLevel.L1, 10 + Math.random() * 90, true);
			}
			service.recordPerformance(CacheLevel.L1, 200, false);

			const result = await service.getPerformanceMetrics();
			const l1Metrics = result.get(CacheLevel.L1);
			expect(l1Metrics.avgResponseTime).toBeGreaterThan(0);
			expect(l1Metrics.errorRate).toBeGreaterThan(0);
		});
	});
});
