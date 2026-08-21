///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { AuditAction, ResourceType } from "../common/enums/audit.enum";
import { DatabaseService } from "../database/database.service";
import { AlertService } from "../alert/alert.service";
import {
	AuditLogService,
	parseLocalDate,
	splitQueryValues,
} from "./audit-log.service";

describe("AuditLogService", () => {
	let service: AuditLogService;

	const mockPrisma = {
		auditLog: {
			create: jest.fn(),
			findMany: jest.fn(),
			count: jest.fn(),
			findUnique: jest.fn(),
			deleteMany: jest.fn(),
			groupBy: jest.fn(),
		},
		fileSystemNode: {
			findUnique: jest.fn(),
		},
	};

	const mockAlertService = {
		raise: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuditLogService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: AlertService, useValue: mockAlertService },
			],
		}).compile();

		service = module.get<AuditLogService>(AuditLogService);
	});

	// ==================== log ====================
	describe("log", () => {
		it("should create audit log successfully with high-value action", async () => {
			mockPrisma.auditLog.create.mockResolvedValue({
				id: "log-1",
				action: AuditAction.ADD_MEMBER,
				resourceType: ResourceType.PROJECT,
				resourceId: "proj-1",
				userId: "admin",
				success: true,
			});

			await service.log(
				AuditAction.ADD_MEMBER,
				ResourceType.PROJECT,
				"proj-1",
				"admin",
				true,
			);

			expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
				data: {
					action: AuditAction.ADD_MEMBER,
					resourceType: ResourceType.PROJECT,
					resourceId: "proj-1",
					projectId: undefined,
					resourceName: undefined,
					params: undefined,
					userId: "admin",
					success: true,
					ipAddress: undefined,
					userAgent: undefined,
					errorMessage: undefined,
				},
			});
		});

		it("should skip high-frequency read action success records (#207)", async () => {
			await service.log(
				AuditAction.USER_LOGIN,
				ResourceType.USER,
				"user-1",
				"admin",
				true,
			);

			expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
		});

		it("should skip FILE_DOWNLOAD success records (#207)", async () => {
			await service.log(
				AuditAction.FILE_DOWNLOAD,
				ResourceType.FILE,
				"node-1",
				"admin",
				true,
			);

			expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
		});

		it("should keep high-frequency read action failure records (#207)", async () => {
			mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });

			await service.log(
				AuditAction.FILE_DOWNLOAD,
				ResourceType.FILE,
				"node-1",
				"admin",
				false,
				"download failed",
			);

			expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
				data: {
					action: AuditAction.FILE_DOWNLOAD,
					resourceType: ResourceType.FILE,
					resourceId: "node-1",
					projectId: undefined,
					resourceName: undefined,
					params: undefined,
					userId: "admin",
					success: false,
					errorMessage: "download failed",
					ipAddress: undefined,
					userAgent: undefined,
				},
			});
		});

		it("should handle error without throwing", async () => {
			mockPrisma.auditLog.create.mockRejectedValue(new Error("DB error"));
			// Should not throw, just log error internally
			await expect(
				service.log(
					AuditAction.ADD_MEMBER,
					ResourceType.PROJECT,
					"proj-1",
					"admin",
					true,
				),
			).resolves.toBeUndefined();
		});

		it("should raise alert on write failure (fail-open #207)", async () => {
			mockPrisma.auditLog.create.mockRejectedValue(new Error("DB down"));
			await service.log(
				AuditAction.ADD_MEMBER,
				ResourceType.PROJECT,
				"proj-1",
				"admin",
				true,
			);

			expect(mockAlertService.raise).toHaveBeenCalledWith(
				expect.objectContaining({
					source: "audit-log",
					messageKey: "audit.write.failed",
					message: expect.stringContaining("DB down"),
				}),
			);
		});

		it("should not throw when alert raise fails (fail-open #207)", async () => {
			mockPrisma.auditLog.create.mockRejectedValue(new Error("DB down"));
			mockAlertService.raise.mockRejectedValue(new Error("alert down"));
			await expect(
				service.log(
					AuditAction.ADD_MEMBER,
					ResourceType.PROJECT,
					"proj-1",
					"admin",
					true,
				),
			).resolves.toBeUndefined();
		});

		it("should log with optional parameters (details migrated to params)", async () => {
			mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });

			await service.log(
				AuditAction.PROJECT_CREATE,
				ResourceType.PROJECT,
				"proj-1",
				"user-1",
				false,
				"Error message",
				JSON.stringify({ details: "test" }),
				"proj-1",
				"项目A",
				null,
				"192.168.1.1",
				"Mozilla",
			);

			expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
				data: {
					action: AuditAction.PROJECT_CREATE,
					resourceType: ResourceType.PROJECT,
					resourceId: "proj-1",
					projectId: "proj-1",
					resourceName: "项目A",
					params: { details: "test" },
					userId: "user-1",
					success: false,
					errorMessage: "Error message",
					ipAddress: "192.168.1.1",
					userAgent: "Mozilla",
				},
			});
		});

		it("should write structured params when provided", async () => {
			mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });

			await service.log(
				AuditAction.REMOVE_MEMBER,
				ResourceType.PROJECT,
				"proj-1",
				"user-1",
				true,
				undefined,
				undefined,
				"proj-1",
				"项目A",
				{ userId: "u-2", fromRole: "viewer" },
			);

			expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
				data: {
					action: AuditAction.REMOVE_MEMBER,
					resourceType: ResourceType.PROJECT,
					resourceId: "proj-1",
					projectId: "proj-1",
					resourceName: "项目A",
					params: { userId: "u-2", fromRole: "viewer" },
					userId: "user-1",
					success: true,
					errorMessage: undefined,
					ipAddress: undefined,
					userAgent: undefined,
				},
			});
		});

		it("should fall back to raw details when JSON.parse fails", async () => {
			mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });

			await service.log(
				AuditAction.ADD_MEMBER,
				ResourceType.PROJECT,
				"proj-1",
				"user-1",
				true,
				undefined,
				"not-valid-json{{",
			);

			const data = mockPrisma.auditLog.create.mock.calls[0][0].data;
			expect(data.params).toEqual({ raw: "not-valid-json{{" });
		});

		it("should handle undefined resourceId", async () => {
			mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });

			await service.log(
				AuditAction.USER_LOGOUT,
				ResourceType.USER,
				undefined,
				"user-1",
				true,
			);

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

			await service.findAll(
				{
					userId: "user-1",
					action: [AuditAction.USER_LOGIN, AuditAction.USER_LOGOUT],
					resourceType: [ResourceType.USER],
					resourceId: "res-1",
					projectId: "proj-1",
					startDate: new Date("2024-01-01"),
					endDate: new Date("2024-12-31"),
					success: true,
				},
				{ page: 1, limit: 20 },
			);

			const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
			expect(where.userId).toBe("user-1");
			// 多选：action / resourceType 为 in 数组查询
			expect(where.action).toEqual({
				in: [AuditAction.USER_LOGIN, AuditAction.USER_LOGOUT],
			});
			expect(where.resourceType).toEqual({ in: [ResourceType.USER] });
			expect(where.resourceId).toBe("res-1");
			expect(where.projectId).toBe("proj-1");
			expect(where.createdAt.gte).toBeInstanceOf(Date);
			// 结束日期为"包含当天"语义：lt 次日零点（lte 当天零点会漏掉当天全部记录）
			expect(where.createdAt.lt).toBeInstanceOf(Date);
			expect(where.createdAt.lte).toBeUndefined();
			expect(where.success).toBe(true);
		});

		it("should apply multi-value action/resourceType via in query", async () => {
			mockPrisma.auditLog.findMany.mockResolvedValue([]);
			mockPrisma.auditLog.count.mockResolvedValue(0);

			await service.findAll(
				{
					action: [AuditAction.FILE_DELETE, AuditAction.PROJECT_CREATE],
					resourceType: [ResourceType.FILE, ResourceType.PROJECT],
				},
				{ page: 1, limit: 20 },
			);

			const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
			expect(where.action).toEqual({
				in: [AuditAction.FILE_DELETE, AuditAction.PROJECT_CREATE],
			});
			expect(where.resourceType).toEqual({
				in: [ResourceType.FILE, ResourceType.PROJECT],
			});
		});

		it("should include the whole end day (endDate -> next day lt)", async () => {
			mockPrisma.auditLog.findMany.mockResolvedValue([]);
			mockPrisma.auditLog.count.mockResolvedValue(0);

			// 开始=结束同一天：区间应为 [当天零点, 次日零点)，同一天记录可查
			const start = new Date(2024, 5, 15);
			const end = new Date(2024, 5, 15);
			await service.findAll(
				{ startDate: start, endDate: end },
				{ page: 1, limit: 20 },
			);

			const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
			expect(where.createdAt.gte.getTime()).toBe(start.getTime());
			expect(where.createdAt.lt.getTime()).toBe(
				new Date(2024, 5, 16).getTime(),
			);
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

			await expect(service.findOne("missing")).rejects.toThrow(
				NotFoundException,
			);
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
				startDate: new Date(2024, 0, 1),
				endDate: new Date(2024, 11, 31),
			});

			const where = mockPrisma.auditLog.count.mock.calls[0][0].where;
			expect(where.createdAt.gte.getTime()).toBe(
				new Date(2024, 0, 1).getTime(),
			);
			// 结束日期闭区间：lt 次日零点
			expect(where.createdAt.lt.getTime()).toBe(
				new Date(2025, 0, 1).getTime(),
			);
			expect(where.createdAt.lte).toBeUndefined();
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

	// ==================== exportLogs (#207 阶段 2) ====================
	describe("exportLogs", () => {
		it("should export CSV with header and rows", async () => {
			mockPrisma.auditLog.findMany.mockResolvedValue([
				{
					id: "log-1",
					action: AuditAction.ADD_MEMBER,
					resourceType: ResourceType.PROJECT,
					resourceId: "proj-1",
					projectId: "proj-1",
					resourceName: "项目A",
					params: { targetUserName: "李工" },
					userId: "u-1",
					ipAddress: "127.0.0.1",
					userAgent: null,
					success: true,
					errorMessage: null,
					createdAt: new Date("2024-01-01T00:00:00.000Z"),
					user: { id: "u-1", email: "a@b.c", username: "张工" },
				},
			]);

			const result = await service.exportLogs(
				{ projectId: "proj-1" },
				"csv",
			);

			expect(result.filename).toMatch(/^audit-logs-\d{8}\.csv$/);
			expect(result.mimeType).toContain("text/csv");
			const content = result.buffer.toString("utf8");
			expect(content.startsWith("\uFEFF")).toBe(true);
			expect(content).toContain("时间,操作用户,操作");
			expect(content).toContain("张工");
			expect(content).toContain("ADD_MEMBER");
		});

		it("should escape CSV fields with comma/quote/newline", async () => {
			mockPrisma.auditLog.findMany.mockResolvedValue([
				{
					id: "log-1",
					action: AuditAction.ADD_MEMBER,
					resourceType: ResourceType.PROJECT,
					resourceId: "proj-1",
					projectId: null,
					resourceName: '项目"A",B',
					params: { note: "line1\nline2" },
					userId: "u-1",
					ipAddress: null,
					userAgent: null,
					success: false,
					errorMessage: "失败原因,含逗号",
					createdAt: new Date("2024-01-01T00:00:00.000Z"),
					user: null,
				},
			]);

			const result = await service.exportLogs({});
			const content = result.buffer.toString("utf8");
			expect(content).toContain('"项目""A"",B"');
			expect(content).toContain('"失败原因,含逗号"');
		});

		it("should apply filters and limit to EXPORT_MAX_ROWS", async () => {
			mockPrisma.auditLog.findMany.mockResolvedValue([]);

			await service.exportLogs({
				action: [AuditAction.ROLE_CREATE],
				startDate: new Date(2024, 0, 1),
				endDate: new Date(2024, 11, 31),
				success: true,
			});

			const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
			expect(findManyCall.where.action).toEqual({
				in: [AuditAction.ROLE_CREATE],
			});
			expect(findManyCall.where.success).toBe(true);
			expect(findManyCall.where.createdAt.gte).toBeInstanceOf(Date);
			expect(findManyCall.where.createdAt.lt).toBeInstanceOf(Date);
			expect(findManyCall.take).toBe(50000);
		});
	});

	// ==================== parseLocalDate / splitQueryValues ====================
	describe("parseLocalDate", () => {
		it("should parse YYYY-MM-DD as local midnight (not UTC)", () => {
			const date = parseLocalDate("2026-08-13");
			expect(date).toBeInstanceOf(Date);
			// 本地时区解析：年/月/日必须精确落在本地零点，而不是 UTC 零点
			expect(date.getFullYear()).toBe(2026);
			expect(date.getMonth()).toBe(7); // 8 月
			expect(date.getDate()).toBe(13);
			expect(date.getHours()).toBe(0);
			expect(date.getMinutes()).toBe(0);
			expect(date.getSeconds()).toBe(0);
		});

		it("should return undefined for malformed input", () => {
			expect(parseLocalDate("2026-13-45")).toBeUndefined();
			expect(parseLocalDate("not-a-date")).toBeUndefined();
			expect(parseLocalDate("")).toBeUndefined();
			expect(parseLocalDate("2026-8-3")).toBeUndefined();
		});
	});

	describe("splitQueryValues", () => {
		it("should split comma-separated values and trim", () => {
			expect(splitQueryValues("A,B")).toEqual(["A", "B"]);
			expect(splitQueryValues(" A , B ,C ")).toEqual(["A", "B", "C"]);
		});

		it("should return undefined for empty/blank input", () => {
			expect(splitQueryValues(undefined)).toBeUndefined();
			expect(splitQueryValues("")).toBeUndefined();
			expect(splitQueryValues(" , , ")).toBeUndefined();
		});
	});

	// ==================== logProjectNodeAction ====================
	describe("logProjectNodeAction", () => {
		it("should log FILE_CREATE with projectId/resourceName when node belongs to a project", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "node-1",
				projectId: "proj-1",
				name: "drawing.dwg",
			});
			mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });

			await service.logProjectNodeAction(
				AuditAction.FILE_CREATE,
				"node-1",
				"user-1",
			);

			expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
				data: {
					action: AuditAction.FILE_CREATE,
					resourceType: ResourceType.FILE,
					resourceId: "node-1",
					projectId: "proj-1",
					resourceName: "drawing.dwg",
					params: { fileName: "drawing.dwg", nodeId: "node-1" },
					userId: "user-1",
					ipAddress: undefined,
					userAgent: undefined,
					success: true,
					errorMessage: undefined,
				},
			});
		});

		it("should pass extraParams into params (e.g. shareAction revoke)", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "node-1",
				projectId: "proj-1",
				name: "drawing.dwg",
			});
			mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });

			await service.logProjectNodeAction(
				AuditAction.FILE_SHARE,
				"node-1",
				"user-1",
				{ shareAction: "revoke", shareToken: "tok-1" },
			);

			expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					params: {
						fileName: "drawing.dwg",
						nodeId: "node-1",
						shareAction: "revoke",
						shareToken: "tok-1",
					},
				}),
			});
		});

		it("should use ResourceType.FOLDER when resourceType param passed (FOLDER_CREATE)", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "folder-1",
				projectId: "proj-1",
				name: "设计图纸",
			});
			mockPrisma.auditLog.create.mockResolvedValue({ id: "log-1" });

			await service.logProjectNodeAction(
				AuditAction.FOLDER_CREATE,
				"folder-1",
				"user-1",
				undefined,
				ResourceType.FOLDER,
			);

			expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					action: AuditAction.FOLDER_CREATE,
					resourceType: ResourceType.FOLDER,
					resourceName: "设计图纸",
				}),
			});
		});

		it("should NOT log when node has no projectId (personal space)", async () => {
			mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
				id: "node-1",
				projectId: null,
				name: "drawing.dwg",
			});

			await service.logProjectNodeAction(
				AuditAction.FILE_CREATE,
				"node-1",
				"user-1",
			);

			expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
		});

		it("should NOT throw when node lookup fails (fail-open)", async () => {
			mockPrisma.fileSystemNode.findUnique.mockRejectedValue(
				new Error("db down"),
			);

			await expect(
				service.logProjectNodeAction(
					AuditAction.FILE_UPDATE,
					"node-1",
					"user-1",
				),
			).resolves.toBeUndefined();
			expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
		});

		it("should skip when nodeId or userId missing", async () => {
			await service.logProjectNodeAction(
				AuditAction.FILE_CREATE,
				undefined,
				"user-1",
			);
			await service.logProjectNodeAction(
				AuditAction.FILE_CREATE,
				"node-1",
				"",
			);

			expect(mockPrisma.fileSystemNode.findUnique).not.toHaveBeenCalled();
			expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
		});
	});
});
