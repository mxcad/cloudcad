///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { InternalServerErrorException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CacheLevel } from "../enums/cache-level.enum";
import { L1CacheProvider } from "../providers/l1-cache.provider";
import { L2CacheProvider } from "../providers/l2-cache.provider";
import { L3CacheProvider } from "../providers/l3-cache.provider";
import { CacheVersionService, CacheVersionType } from "./cache-version.service";
import { MultiLevelCacheService } from "./multi-level-cache.service";
describe("MultiLevelCacheService", () => {
    let service;
    const mockL1Cache = {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        clear: jest.fn(),
        has: jest.fn(),
        getStats: jest.fn(),
        getMany: jest.fn(),
        setMany: jest.fn(),
    };
    const mockL2Cache = {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        deleteByPattern: jest.fn(),
        clear: jest.fn(),
        has: jest.fn(),
        getStats: jest.fn(),
        getMany: jest.fn(),
        setMany: jest.fn(),
    };
    const mockL3Cache = {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        deleteByPattern: jest.fn(),
        clear: jest.fn(),
        has: jest.fn(),
        getStats: jest.fn(),
        getMany: jest.fn(),
        setMany: jest.fn(),
    };
    const mockCacheVersionService = {
        getVersionedKey: jest.fn(),
        updateVersion: jest.fn(),
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                MultiLevelCacheService,
                { provide: L1CacheProvider, useValue: mockL1Cache },
                { provide: L2CacheProvider, useValue: mockL2Cache },
                { provide: L3CacheProvider, useValue: mockL3Cache },
                { provide: CacheVersionService, useValue: mockCacheVersionService },
            ],
        }).compile();
        service = module.get(MultiLevelCacheService);
    });
    // ==================== enableVersionControl / disableVersionControl ====================
    describe("version control", () => {
        it("should enable version control", () => {
            service.enableVersionControl(CacheVersionType.SYSTEM_CONFIG, "test-key");
            // Test that it doesn't throw and version config is set
        });
        it("should disable version control", () => {
            service.enableVersionControl(CacheVersionType.SYSTEM_CONFIG, "test-key");
            service.disableVersionControl();
            // Test that it doesn't throw
        });
        it("should return null when version control is disabled", async () => {
            const result = await service.updateVersion("test");
            expect(result).toBeNull();
        });
    });
    // ==================== get ====================
    describe("get", () => {
        it("should return value from L1 cache", async () => {
            mockL1Cache.get.mockResolvedValue("l1-value");
            const result = await service.get("test-key");
            expect(result).toBe("l1-value");
            expect(mockL1Cache.get).toHaveBeenCalled();
        });
        it("should return value from L2 cache and populate L1", async () => {
            mockL1Cache.get.mockResolvedValue(null);
            mockL2Cache.get.mockResolvedValue("l2-value");
            const result = await service.get("test-key");
            expect(result).toBe("l2-value");
            expect(mockL1Cache.set).toHaveBeenCalled();
        });
        it("should return value from L3 cache and populate L1 and L2", async () => {
            mockL1Cache.get.mockResolvedValue(null);
            mockL2Cache.get.mockResolvedValue(null);
            mockL3Cache.get.mockResolvedValue("l3-value");
            const result = await service.get("test-key");
            expect(result).toBe("l3-value");
            expect(mockL2Cache.set).toHaveBeenCalled();
            expect(mockL1Cache.set).toHaveBeenCalled();
        });
        it("should return null when not found in any cache", async () => {
            mockL1Cache.get.mockResolvedValue(null);
            mockL2Cache.get.mockResolvedValue(null);
            mockL3Cache.get.mockResolvedValue(null);
            const result = await service.get("test-key");
            expect(result).toBeNull();
        });
    });
    // ==================== getOrLoad ====================
    describe("getOrLoad", () => {
        it("should return cached value when available", async () => {
            mockL1Cache.get.mockResolvedValue("cached");
            const loader = jest.fn();
            const result = await service.getOrLoad("key", loader);
            expect(result).toBe("cached");
            expect(loader).not.toHaveBeenCalled();
        });
        it("should load and cache value when not cached", async () => {
            mockL1Cache.get.mockResolvedValue(null);
            mockL2Cache.get.mockResolvedValue(null);
            mockL3Cache.get.mockResolvedValue(null);
            const loader = jest.fn().mockResolvedValue("loaded");
            const result = await service.getOrLoad("key", loader);
            expect(result).toBe("loaded");
            expect(loader).toHaveBeenCalled();
            expect(mockL1Cache.set).toHaveBeenCalled();
            expect(mockL2Cache.set).toHaveBeenCalled();
            expect(mockL3Cache.set).toHaveBeenCalled();
        });
    });
    // ==================== getMany ====================
    describe("getMany", () => {
        it("should return values from L1 cache", async () => {
            mockL1Cache.get.mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
            const result = await service.getMany(["k1", "k2"]);
            expect(result.get("k1")).toBe("v1");
            expect(result.get("k2")).toBe("v2");
        });
        it("should fallback to L2 and L3", async () => {
            mockL1Cache.get.mockResolvedValueOnce(null).mockResolvedValueOnce("v2");
            const l2Map = new Map([["k1", "l2-v1"]]);
            mockL2Cache.getMany.mockResolvedValue(l2Map);
            mockL3Cache.get.mockResolvedValue(null);
            const result = await service.getMany(["k1", "k2"]);
            expect(result.get("k1")).toBe("l2-v1");
            expect(result.get("k2")).toBe("v2");
        });
    });
    // ==================== set ====================
    describe("set", () => {
        it("should set value to all cache levels", async () => {
            await service.set("key", "value", 300);
            expect(mockL1Cache.set).toHaveBeenCalled();
            expect(mockL2Cache.set).toHaveBeenCalled();
            expect(mockL3Cache.set).toHaveBeenCalled();
        });
        it("should apply avalanche protection (random TTL)", async () => {
            await service.set("key", "value", 300);
            const l1Call = mockL1Cache.set.mock.calls[0];
            const ttl = l1Call[2];
            expect(ttl).toBeGreaterThanOrEqual(300);
            expect(ttl).toBeLessThanOrEqual(600); // 300 + randomizationRange(300)
        });
    });
    // ==================== delete ====================
    describe("delete", () => {
        it("should delete from all cache levels", async () => {
            await service.delete("key");
            expect(mockL1Cache.delete).toHaveBeenCalled();
            expect(mockL2Cache.delete).toHaveBeenCalled();
            expect(mockL3Cache.delete).toHaveBeenCalled();
        });
    });
    // ==================== deleteMany ====================
    describe("deleteMany", () => {
        it("should delete multiple keys from all levels", async () => {
            await service.deleteMany(["k1", "k2"]);
            expect(mockL1Cache.deleteMany).toHaveBeenCalled();
            expect(mockL2Cache.deleteMany).toHaveBeenCalled();
            expect(mockL3Cache.deleteMany).toHaveBeenCalled();
        });
    });
    // ==================== deleteByPattern ====================
    describe("deleteByPattern", () => {
        it("should delete by pattern from L2 and L3", async () => {
            mockL2Cache.deleteByPattern.mockResolvedValue(5);
            mockL3Cache.deleteByPattern.mockResolvedValue(3);
            const result = await service.deleteByPattern("prefix:*");
            expect(result).toBe(8);
        });
    });
    // ==================== clear ====================
    describe("clear", () => {
        it("should clear all cache levels", async () => {
            await service.clear();
            expect(mockL1Cache.clear).toHaveBeenCalled();
            expect(mockL2Cache.clear).toHaveBeenCalled();
            expect(mockL3Cache.clear).toHaveBeenCalled();
        });
    });
    // ==================== has ====================
    describe("has", () => {
        it("should return true if exists in any level", async () => {
            mockL1Cache.has.mockResolvedValue(false);
            mockL2Cache.has.mockResolvedValue(true);
            mockL3Cache.has.mockResolvedValue(false);
            const result = await service.has("key");
            expect(result).toBe(true);
        });
        it("should return false if not exists in any level", async () => {
            mockL1Cache.has.mockResolvedValue(false);
            mockL2Cache.has.mockResolvedValue(false);
            mockL3Cache.has.mockResolvedValue(false);
            const result = await service.has("key");
            expect(result).toBe(false);
        });
    });
    // ==================== getStats ====================
    describe("getStats", () => {
        it("should return aggregated stats", async () => {
            mockL1Cache.getStats.mockReturnValue({
                hits: 100,
                misses: 20,
                memoryUsage: 1000,
            });
            mockL2Cache.getStats.mockReturnValue({
                hits: 50,
                misses: 10,
                memoryUsage: 2000,
            });
            mockL3Cache.getStats.mockReturnValue({
                hits: 30,
                misses: 5,
                memoryUsage: 3000,
            });
            const result = await service.getStats();
            expect(result.summary.totalHits).toBe(180);
            expect(result.summary.totalMisses).toBe(35);
            expect(result.summary.totalMemoryUsage).toBe(6000);
        });
    });
    // ==================== getFromLevel / setToLevel ====================
    describe("level-specific operations", () => {
        it("should get from specific level", async () => {
            mockL1Cache.get.mockResolvedValue("l1-value");
            const result = await service.getFromLevel("key", CacheLevel.L1);
            expect(result).toBe("l1-value");
        });
        it("should set to specific level", async () => {
            await service.setToLevel("key", "value", CacheLevel.L2, 300);
            expect(mockL2Cache.set).toHaveBeenCalledWith("key", "value", 300);
        });
        it("should throw for invalid level", async () => {
            await expect(service.getFromLevel("key", "invalid")).rejects.toThrow(InternalServerErrorException);
        });
    });
    // ==================== refresh ====================
    describe("refresh", () => {
        it("should delete and reload cache", async () => {
            mockL1Cache.get.mockResolvedValue(null);
            mockL2Cache.get.mockResolvedValue(null);
            mockL3Cache.get.mockResolvedValue(null);
            const loader = jest.fn().mockResolvedValue("refreshed");
            const result = await service.refresh("key", loader);
            expect(result).toBe("refreshed");
            expect(mockL1Cache.delete).toHaveBeenCalled();
            expect(loader).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=multi-level-cache.service.spec.js.map