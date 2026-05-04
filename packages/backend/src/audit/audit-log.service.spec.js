///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AuditAction, ResourceType } from "../common/enums/audit.enum";
import { DatabaseService } from "../database/database.service";
import { AuditLogService } from "./audit-log.service";
describe("AuditLogService", () => {
    let service;
    const mockPrisma = {
        auditLog: {
            create: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            deleteMany: jest.fn(),
            groupBy: jest.fn(),
        },
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const module = await Test.createTestingModule({
            providers: [
                AuditLogService,
                { provide: DatabaseService, useValue: mockPrisma },
            ],
        }).compile();
        service = module.get(AuditLogService);
    });
    // ==================== log ====================
    describe("log", () => {
        it("should create audit log successfully", async () => {
            mockPrisma.auditLog.create.mockResolvedValue({
                id: "log-1",
                action: AuditAction.USER_LOGIN,
                resourceType: ResourceType.USER,
                resourceId: "user-1",
                userId: "admin",
                success: true,
            });
            await service.log(AuditAction.USER_LOGIN, ResourceType.USER, "user-1", "admin", true);
            expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
                data: {
                    action: AuditAction.USER_LOGIN,
                    resourceType: ResourceType.USER,
                    resourceId: "user-1",
                    userId: "admin",
                    success: true,
                    details: undefined,
                    ipAddress: undefined,
                    userAgent: undefined,
                    errorMessage: undefined,
                },
            });
        });
        it("should handle error without throwing", async () => {
            mockPrisma.auditLog.create.mockRejectedValue(new Error("DB error"));
            // Should not throw, just log error internally
            await expect(service.log(AuditAction.USER_LOGIN, ResourceType.USER, "user-1", "admin", true)).resolves.toBeUndefined();
        });
        it("should log with optional parameters", async () => {
            mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });
            await service.log(AuditAction.PROJECT_CREATE, ResourceType.PROJECT, "proj-1", "user-1", false, "Error message", JSON.stringify({ details: "test" }), "192.168.1.1", "Mozilla");
            expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
                data: {
                    action: AuditAction.PROJECT_CREATE,
                    resourceType: ResourceType.PROJECT,
                    resourceId: "proj-1",
                    userId: "user-1",
                    success: false,
                    errorMessage: "Error message",
                    details: JSON.stringify({ details: "test" }),
                    ipAddress: "192.168.1.1",
                    userAgent: "Mozilla",
                },
            });
        });
        it("should handle undefined resourceId", async () => {
            mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });
            await service.log(AuditAction.USER_LOGOUT, ResourceType.USER, undefined, "user-1", true);
            expect(mockPrisma.auditLog.create).toHaveBeenCalled();
        });
    });
    // ==================== findAll ====================
    describe("findAll", () => {
        it("should return paginated audit logs", async () => {
            const mockLogs = [
                {
                    id: "log-1",
                    action: AuditAction.USER_LOGIN,
                    userId: "user-1",
                    user: {},
                },
            ];
            mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);
            mockPrisma.auditLog.count.mockResolvedValue(1);
            const result = await service.findAll({}, { page: 1, limit: 20 });
            expect(result.logs).toHaveLength(1);
            expect(result.total).toBe(1);
            expect(result.page).toBe(1);
            expect(result.limit).toBe(20);
            expect(result.totalPages).toBe(1);
        });
        it("should apply filters correctly", async () => {
            mockPrisma.auditLog.findMany.mockResolvedValue([]);
            mockPrisma.auditLog.count.mockResolvedValue(0);
            await service.findAll({
                userId: "user-1",
                action: AuditAction.USER_LOGIN,
                resourceType: ResourceType.USER,
                resourceId: "res-1",
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-12-31"),
                success: true,
            }, { page: 1, limit: 20 });
            const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
            expect(where.userId).toBe("user-1");
            expect(where.action).toBe(AuditAction.USER_LOGIN);
            expect(where.resourceType).toBe(ResourceType.USER);
            expect(where.resourceId).toBe("res-1");
            expect(where.createdAt.gte).toBeInstanceOf(Date);
            expect(where.createdAt.lte).toBeInstanceOf(Date);
            expect(where.success).toBe(true);
        });
        it("should handle empty result", async () => {
            mockPrisma.auditLog.findMany.mockResolvedValue([]);
            mockPrisma.auditLog.count.mockResolvedValue(0);
            const result = await service.findAll({}, { page: 1, limit: 20 });
            expect(result.logs).toEqual([]);
            expect(result.total).toBe(0);
        });
        it("should calculate totalPages correctly", async () => {
            mockPrisma.auditLog.findMany.mockResolvedValue([]);
            mockPrisma.auditLog.count.mockResolvedValue(45);
            const result = await service.findAll({}, { page: 1, limit: 20 });
            expect(result.totalPages).toBe(3);
        });
    });
    // ==================== findOne ====================
    describe("findOne", () => {
        it("should return audit log when found", async () => {
            const mockLog = {
                id: "log-1",
                action: AuditAction.USER_LOGIN,
                user: {
                    id: "user-1",
                    email: "test@test.com",
                    username: "test",
                    nickname: "Test",
                },
            };
            mockPrisma.auditLog.findUnique.mockResolvedValue(mockLog);
            const result = await service.findOne("log-1");
            expect(result.id).toBe("log-1");
            expect(result.user).toBeDefined();
        });
        it("should throw NotFoundException when not found", async () => {
            mockPrisma.auditLog.findUnique.mockResolvedValue(null);
            await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
        });
    });
    // ==================== getStatistics ====================
    describe("getStatistics", () => {
        it("should return statistics with all data", async () => {
            mockPrisma.auditLog.count
                .mockResolvedValueOnce(100) // total
                .mockResolvedValueOnce(80) // successCount
                .mockResolvedValueOnce(20); // failureCount
            mockPrisma.auditLog.groupBy.mockResolvedValue([
                { action: AuditAction.USER_LOGIN, _count: 50 },
                { action: AuditAction.USER_LOGOUT, _count: 30 },
            ]);
            const result = await service.getStatistics({});
            expect(result.total).toBe(100);
            expect(result.successCount).toBe(80);
            expect(result.failureCount).toBe(20);
            expect(result.successRate).toBe(80);
            expect(result.actionStats[AuditAction.USER_LOGIN]).toBe(50);
        });
        it("should handle empty data", async () => {
            mockPrisma.auditLog.count
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0);
            mockPrisma.auditLog.groupBy.mockResolvedValue([]);
            const result = await service.getStatistics({});
            expect(result.total).toBe(0);
            expect(result.successRate).toBe(0);
            expect(result.actionStats).toEqual({});
        });
        it("should apply date filters", async () => {
            mockPrisma.auditLog.count.mockResolvedValue(10);
            mockPrisma.auditLog.groupBy.mockResolvedValue([]);
            await service.getStatistics({
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-12-31"),
            });
            const where = mockPrisma.auditLog.count.mock.calls[0][0].where;
            expect(where.createdAt.gte).toBeInstanceOf(Date);
            expect(where.createdAt.lte).toBeInstanceOf(Date);
        });
    });
    // ==================== cleanupOldLogs ====================
    describe("cleanupOldLogs", () => {
        it("should delete old logs", async () => {
            mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 50 });
            const result = await service.cleanupOldLogs(30, "admin");
            expect(result).toBe(50);
            expect(mockPrisma.auditLog.deleteMany).toHaveBeenCalled();
        });
        it("should handle no logs to delete", async () => {
            mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 });
            const result = await service.cleanupOldLogs(30);
            expect(result).toBe(0);
        });
        it("should use default userId when not provided", async () => {
            mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 });
            await service.cleanupOldLogs(30);
            // Should not throw
        });
    });
});
//# sourceMappingURL=audit-log.service.spec.js.map