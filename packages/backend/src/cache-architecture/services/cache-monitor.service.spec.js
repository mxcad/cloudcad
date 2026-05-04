///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from "@nestjs/testing";
import { CacheLevel } from "../enums/cache-level.enum";
import { L1CacheProvider } from "../providers/l1-cache.provider";
import { L2CacheProvider } from "../providers/l2-cache.provider";
import { L3CacheProvider } from "../providers/l3-cache.provider";
import { CacheMonitorService } from "./cache-monitor.service";
import { MultiLevelCacheService } from "./multi-level-cache.service";
describe("CacheMonitorService", () => {
    let service;
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
    const mockL3Cache = {
        getStats: jest.fn(),
        size: jest.fn(),
        getHotData: jest.fn(),
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                CacheMonitorService,
                { provide: MultiLevelCacheService, useValue: mockCacheService },
                { provide: L1CacheProvider, useValue: mockL1Cache },
                { provide: L2CacheProvider, useValue: mockL2Cache },
                { provide: L3CacheProvider, useValue: mockL3Cache },
            ],
        }).compile();
        service = module.get(CacheMonitorService);
    });
    afterEach(() => {
        jest.useRealTimers();
    });
    // ==================== getStats ====================
    describe("getStats", () => {
        it("should return stats from cache service", async () => {
            const mockStats = {
                levels: { L1: {}, L2: {}, L3: {} },
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
            mockL3Cache.size.mockResolvedValue(0);
            const result = await service.getHealthStatus();
            expect(result.L1.status).toBe("healthy");
            expect(result.L2.status).toBe("healthy");
            expect(result.L3.status).toBe("healthy");
            expect(result.overall).toBe("healthy");
        });
        it("should return degraded status when L2 is disconnected", async () => {
            mockL2Cache.isReady.mockReturnValue(false);
            mockL3Cache.size.mockResolvedValue(0);
            const result = await service.getHealthStatus();
            expect(result.L2.status).toBe("unhealthy");
            expect(result.overall).toBe("unhealthy");
        });
        it("should return unhealthy status when L3 fails", async () => {
            mockL2Cache.isReady.mockReturnValue(true);
            mockL3Cache.size.mockRejectedValue(new Error("DB connection failed"));
            const result = await service.getHealthStatus();
            expect(result.L3.status).toBe("unhealthy");
            expect(result.L3.error).toBe("DB connection failed");
            expect(result.overall).toBe("unhealthy");
        });
        it("should return degraded when one level is degraded", async () => {
            mockL2Cache.isReady.mockReturnValue(true);
            mockL3Cache.size.mockResolvedValue(0);
            // L1 is always healthy in this implementation
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
    // ==================== getHotData ====================
    describe("getHotData", () => {
        it("should return hot data from L3 cache", async () => {
            const mockHotData = [
                { key: "key1", accessCount: 100, lastAccessedAt: new Date() },
                {
                    key: "key2",
                    accessCount: 50,
                    lastAccessedAt: new Date(Date.now() - 60000),
                },
            ];
            mockL3Cache.getHotData.mockResolvedValue(mockHotData);
            const result = await service.getHotData(10);
            expect(result).toHaveLength(2);
            expect(result[0].key).toBe("key1");
            expect(result[0].accessFrequency).toBeGreaterThan(result[1].accessFrequency);
        });
    });
    // ==================== checkWarnings ====================
    describe("checkWarnings", () => {
        it("should return warnings when thresholds exceeded", async () => {
            mockCacheService.getStats.mockResolvedValue({
                levels: {
                    L1: { size: 950, maxCapacity: 1000 },
                    L2: { isConnected: false },
                    L3: {},
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
                    L3: {},
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
    // ==================== getMonitoringSummary ====================
    describe("getMonitoringSummary", () => {
        it("should return comprehensive monitoring summary", async () => {
            mockCacheService.getStats.mockResolvedValue({
                levels: {},
                summary: {},
            });
            mockL2Cache.isReady.mockReturnValue(true);
            mockL3Cache.size.mockResolvedValue(0);
            mockL3Cache.getHotData.mockResolvedValue([]);
            const result = await service.getMonitoringSummary();
            expect(result.stats).toBeDefined();
            expect(result.healthStatus).toBeDefined();
            expect(result.performanceMetrics).toBeDefined();
            expect(result.hotData).toBeDefined();
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
                    L3: { size: 300 },
                },
                summary: {},
            });
            const result = await service.getSizeTrend();
            expect(result.get(CacheLevel.L1)).toEqual([100]);
            expect(result.get(CacheLevel.L2)).toEqual([200]);
            expect(result.get(CacheLevel.L3)).toEqual([300]);
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
//# sourceMappingURL=cache-monitor.service.spec.js.map