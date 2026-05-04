///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DatabaseService } from "../../database/database.service";
import { RuntimeConfigService } from "../../runtime-config/runtime-config.service";
import { StorageQuotaService, StorageQuotaType } from "./storage-quota.service";
describe("StorageQuotaService", () => {
    let service;
    const mockPrisma = {
        fileSystemNode: {
            update: jest.fn(),
        },
    };
    const mockRuntimeConfigService = {
        getValue: jest.fn(),
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                StorageQuotaService,
                { provide: DatabaseService, useValue: mockPrisma },
                { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
            ],
        }).compile();
        service = module.get(StorageQuotaService);
    });
    // ==================== determineQuotaType ====================
    describe("determineQuotaType", () => {
        it("should return LIBRARY when libraryKey is set", () => {
            const node = { libraryKey: "drawing" };
            expect(service.determineQuotaType(node)).toBe(StorageQuotaType.LIBRARY);
        });
        it("should return PROJECT when isRoot is true", () => {
            const node = { libraryKey: null, isRoot: true };
            expect(service.determineQuotaType(node)).toBe(StorageQuotaType.PROJECT);
        });
        it("should return PERSONAL for regular nodes", () => {
            const node = { libraryKey: null, isRoot: false };
            expect(service.determineQuotaType(node)).toBe(StorageQuotaType.PERSONAL);
        });
        it("should handle undefined properties gracefully", () => {
            const node = {};
            expect(service.determineQuotaType(node)).toBe(StorageQuotaType.PERSONAL);
        });
    });
    // ==================== getStorageQuotaLimit ====================
    describe("getStorageQuotaLimit", () => {
        it("should return node-specific quota when storageQuota is set", async () => {
            const node = { storageQuota: 20 };
            const result = await service.getStorageQuotaLimit(node);
            expect(result).toBe(20 * 1024 * 1024 * 1024);
        });
        it("should return PERSONAL default quota when node is not provided", async () => {
            mockRuntimeConfigService.getValue.mockResolvedValue(10);
            const result = await service.getStorageQuotaLimit();
            expect(result).toBe(10 * 1024 * 1024 * 1024);
        });
        it("should return PROJECT default quota for root nodes", async () => {
            const node = { isRoot: true, storageQuota: null };
            mockRuntimeConfigService.getValue.mockResolvedValue(50);
            const result = await service.getStorageQuotaLimit(node);
            expect(result).toBe(50 * 1024 * 1024 * 1024);
        });
        it("should return LIBRARY default quota for library nodes", async () => {
            const node = { libraryKey: "block" };
            mockRuntimeConfigService.getValue.mockResolvedValue(100);
            const result = await service.getStorageQuotaLimit(node);
            expect(result).toBe(100 * 1024 * 1024 * 1024);
        });
        it("should propagate error when config service fails", async () => {
            const node = { libraryKey: null, isRoot: false };
            mockRuntimeConfigService.getValue.mockRejectedValue(new Error("config error"));
            await expect(service.getStorageQuotaLimit(node)).rejects.toThrow("config error");
        });
    });
    // ==================== updateNodeStorageQuota ====================
    describe("updateNodeStorageQuota", () => {
        it("should update storage quota successfully", async () => {
            const nodeId = "node-1";
            const quotaGB = 50;
            mockPrisma.fileSystemNode.update.mockResolvedValue({
                id: nodeId,
                storageQuota: quotaGB,
            });
            const result = await service.updateNodeStorageQuota(nodeId, quotaGB);
            expect(result.id).toBe(nodeId);
            expect(result.storageQuota).toBe(quotaGB);
        });
        it("should set quota to 0 when passing 0", async () => {
            mockPrisma.fileSystemNode.update.mockResolvedValue({
                id: "node-1",
                storageQuota: 0,
            });
            const result = await service.updateNodeStorageQuota("node-1", 0);
            expect(result.storageQuota).toBe(0);
        });
        it("should throw BadRequestException when quota is negative", async () => {
            await expect(service.updateNodeStorageQuota("node-1", -1)).rejects.toThrow(BadRequestException);
        });
        it("should rethrow error from database", async () => {
            const error = new Error("Database connection failed");
            mockPrisma.fileSystemNode.update.mockRejectedValue(error);
            await expect(service.updateNodeStorageQuota("node-1", 10)).rejects.toThrow(error);
        });
    });
});
//# sourceMappingURL=storage-quota.service.spec.js.map