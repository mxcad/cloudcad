///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
	BadRequestException,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { RUNTIME_CONFIG_DEFINITIONS } from "./runtime-config.constants";
import { RuntimeConfigService } from "./runtime-config.service";

describe("RuntimeConfigService", () => {
	let service: RuntimeConfigService;

	const mockPrisma = {
		runtimeConfig: {
			findMany: jest.fn(),
			findUnique: jest.fn(),
			createMany: jest.fn(),
			upsert: jest.fn(),
		},
		runtimeConfigLog: {
			create: jest.fn(),
			findMany: jest.fn(),
		},
	};

	const mockRedis = {
		get: jest.fn(),
		setex: jest.fn(),
		del: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		// resetMocks 会清 mock 实现；setex/del 现以 .catch() 链式调用，必须返回 promise
		mockRedis.setex.mockResolvedValue(undefined);
		mockRedis.del.mockResolvedValue(undefined);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RuntimeConfigService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{
					provide: "default_IORedisModuleConnectionToken",
					useValue: mockRedis,
				},
			],
		}).compile();

		service = module.get<RuntimeConfigService>(RuntimeConfigService);
	});

	// ==================== getValue ====================
	describe("getValue", () => {
		it("should return cached value", async () => {
			mockRedis.get.mockResolvedValue(JSON.stringify("cached-value"));
			const result = await service.getValue("test-key");
			expect(result).toBe("cached-value");
		});

		it("should return database value when cache miss", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "test-key",
				value: JSON.stringify("db-value"),
				type: "string",
			});

			const result = await service.getValue("test-key");
			expect(result).toBe("db-value");
			expect(mockRedis.setex).toHaveBeenCalled();
		});

		it("should return default value when not found", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			const result = await service.getValue("unknown-key", "default");
			expect(result).toBe("default");
		});

		it("should return definition default when no default provided", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			const result = await service.getValue("mailEnabled");
			expect(result).toBe(false); // From RUNTIME_CONFIG_DEFINITIONS
		});
	});

	// ==================== getValue 启动期降级 ====================
	// 回归：MulterModule.registerAsync 的 useFactory 在模块实例化期（早于任何
	// onModuleInit）await getValue 查库，数据库不可达时若抛错，进程崩在实例化
	// 阶段，DatabaseService.onModuleInit 的带超时优雅错误提示走不到。
	describe("getValue 启动期/运行期降级", () => {
		// 模拟实例化期数据库不可达（P1017：缓存 miss + 查询失败）
		const dbDown = () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findUnique.mockRejectedValue(
				new Error("P1017: Can't reach database server"),
			);
		};

		it("启动期数据库不可达且传 fallback → 降级返回定义默认值，不抛错", async () => {
			const warnSpy = jest.spyOn(Logger.prototype, "warn");
			dbDown();

			const result = await service.getValue("maxFileSize", 500);

			expect(result).toBe(100);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("启动期降级用默认值"),
			);
		});

		it("启动期数据库不可达且未传默认值 → 回落到配置定义默认值", async () => {
			dbDown();

			// maxFileSize 在 RUNTIME_CONFIG_DEFINITIONS 中的默认值是 100
			expect(await service.getValue("maxFileSize")).toBe(100);
		});

		it("运行期（onModuleInit 之后）数据库不可达 → 抛错，不静默降级", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]);
			await service.onModuleInit();

			dbDown();

			await expect(service.getValue("maxFileSize", 500)).rejects.toThrow(
				"Can't reach database server",
			);
		});
	});

	// ==================== 三层解析：runtime > env > default ====================
	describe("resolveValue 三层优先级", () => {
		it("DB 行 updatedBy 非空 → 运行时值优先于 env", async () => {
			process.env.TEST_RUNTIME_ENV = "99";
			try {
				mockRedis.get.mockResolvedValue(null);
				mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
					key: "maxFileSize",
					value: JSON.stringify(256),
					type: "number",
					updatedBy: "user-1",
				});

				expect(await service.getValue("maxFileSize")).toBe(256);
			} finally {
				delete process.env.TEST_RUNTIME_ENV;
			}
		});

		it("DB 行为安装默认行（updatedBy 为空）→ env 值生效", async () => {
			process.env.RATE_LIMIT_PUBLIC_MAX = "33";
			try {
				mockRedis.get.mockResolvedValue(null);
				mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
					key: "rateLimitPublicMax",
					value: JSON.stringify(100),
					type: "number",
					updatedBy: null,
				});

				expect(await service.getValue("rateLimitPublicMax")).toBe(33);
			} finally {
				delete process.env.RATE_LIMIT_PUBLIC_MAX;
			}
		});

		it("env 未设置 → 回退定义默认值", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			expect(await service.getValue("maxFileSize")).toBe(100);
		});

		it("env 值非法（number 类型）→ 回退定义默认值", async () => {
			process.env.RATE_LIMIT_PUBLIC_MAX = "not-a-number";
			try {
				mockRedis.get.mockResolvedValue(null);
				mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
					key: "rateLimitPublicMax",
					value: JSON.stringify(100),
					type: "number",
					updatedBy: null,
				});

				expect(await service.getValue("rateLimitPublicMax")).toBe(100);
			} finally {
				delete process.env.RATE_LIMIT_PUBLIC_MAX;
			}
		});

		it("DB 行 updatedBy 为空且无 env → 使用 DB 行值（安装默认行）", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "unknown-key",
				value: JSON.stringify("db-default-row"),
				type: "string",
				updatedBy: null,
			});

			expect(await service.getValue("unknown-key")).toBe("db-default-row");
		});

		it("调用方传 fallback 且不等于三层解析结果 → 三层结果优先（fallback 不遮蔽 env）", async () => {
			// 回归：resolveValue 永不返回 nullish，`(fallback ?? value)` 恒为 fallback，
			// 使 93/94 个带 fallback 的调用点全部静默无效。
			process.env.RATE_LIMIT_PUBLIC_MAX = "33";
			try {
				mockRedis.get.mockResolvedValue(null);
				mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
					key: "rateLimitPublicMax",
					value: JSON.stringify(100),
					type: "number",
					updatedBy: null,
				});

				expect(await service.getValue("rateLimitPublicMax", 100)).toBe(33);
			} finally {
				delete process.env.RATE_LIMIT_PUBLIC_MAX;
			}
		});

		it("DB 行 updatedBy 非空且传 fallback → 运行时值优先", async () => {
			process.env.TEST_RUNTIME_ENV = "99";
			try {
				mockRedis.get.mockResolvedValue(null);
				mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
					key: "maxFileSize",
					value: JSON.stringify(256),
					type: "number",
					updatedBy: "user-1",
				});

				expect(await service.getValue("maxFileSize", 500)).toBe(256);
			} finally {
				delete process.env.TEST_RUNTIME_ENV;
			}
		});

		it("未登记在定义表的 key + 传 fallback → fallback 生效", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			expect(await service.getValue("unregistered-key", "fallback")).toBe(
				"fallback",
			);
		});

		it("getAllConfigs 附带来源、默认值与元数据", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "mailEnabled",
					value: JSON.stringify(true),
					type: "boolean",
					category: "mail",
					description: "邮件服务开关",
					isPublic: true,
					updatedBy: "user-1",
					updatedAt: new Date("2026-01-01T00:00:00Z"),
				},
			]);

			const [item] = await service.getAllConfigs();
			expect(item.value).toBe(true);
			expect(item.source).toBe("runtime");
			expect(item.isModified).toBe(true);
			expect(item.defaultValue).toBe(false);
			expect(item.tier).toBe("user");
			expect(item.dangerous).toBe(true);
			expect(item.hot).toBe(true);
			expect(item.impact).toContain("邮件");
		});
	});

	// ==================== get ====================
	describe("get", () => {
		it("should return config item", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "test-key",
				value: JSON.stringify("value"),
				type: "string",
				category: "system",
				description: "test",
				isPublic: true,
				updatedBy: "admin",
				updatedAt: new Date(),
			});

			const result = await service.get("test-key");
			expect(result.key).toBe("test-key");
			expect(result.value).toBe("value");
		});

		it("should throw NotFoundException when not found", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);
			await expect(service.get("unknown")).rejects.toThrow(NotFoundException);
		});
	});

	// ==================== set ====================
	describe("set", () => {
		it("should set config value", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				value: JSON.stringify("old"),
			});
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});

			await service.set("mailEnabled", true, "admin", "192.168.1.1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
			expect(mockPrisma.runtimeConfigLog.create).toHaveBeenCalled();
			expect(mockRedis.del).toHaveBeenCalled();
		});

		it("should throw BadRequestException for unknown key", async () => {
			await expect(service.set("unknown-key", "value")).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should create new config when not exists", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});

			await service.set("mailEnabled", true);

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
		});
	});

	// ==================== getPublicConfigs ====================
	describe("getPublicConfigs", () => {
		it("should return cached public configs", async () => {
			mockRedis.get.mockResolvedValue(JSON.stringify({ mailEnabled: true }));

			const result = await service.getPublicConfigs();
			expect(result).toEqual({ mailEnabled: true });
		});

		it("should fetch from database when cache miss", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{ key: "mailEnabled", value: JSON.stringify(true), type: "boolean" },
			]);

			const result = await service.getPublicConfigs();
			expect(result).toEqual({ mailEnabled: true });
			expect(mockRedis.setex).toHaveBeenCalled();
		});

		it("should handle empty result", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]);

			const result = await service.getPublicConfigs();
			expect(result).toEqual({});
		});
	});

	// ==================== getAllConfigs ====================
	describe("getAllConfigs", () => {
		it("should return all configs", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "mailEnabled",
					value: JSON.stringify(true),
					type: "boolean",
					category: "mail",
					description: "test",
					isPublic: true,
					updatedBy: "admin",
					updatedAt: new Date(),
				},
			]);

			const result = await service.getAllConfigs();
			expect(result).toHaveLength(1);
			expect(result[0].key).toBe("mailEnabled");
		});
	});

	// ==================== resetToDefault ====================
	describe("resetToDefault", () => {
		const mailDefault = JSON.stringify(
			RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "mailEnabled")!.defaultValue,
		);

		it("清空 updatedBy 标记，让 env 层默认值重新生效", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "mailEnabled",
				value: JSON.stringify(true),
				updatedBy: "user-1",
			});
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			await service.resetToDefault("mailEnabled", "admin", "192.168.1.1");

			// 关键不变式：updatedBy 必须归零。若改写回默认值（set 路径会带上操作者 id），
			// resolveValue 会把该行判为「已显式修改」，env 层默认值被永久遮蔽且 isModified 恒为 true。
			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledWith({
				where: { key: "mailEnabled" },
				update: { value: mailDefault, updatedBy: null },
				create: expect.objectContaining({
					key: "mailEnabled",
					value: mailDefault,
					updatedBy: null,
				}),
			});
			expect(mockPrisma.runtimeConfigLog.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					key: "mailEnabled",
					oldValue: JSON.stringify(true),
					newValue: mailDefault,
					operatorId: "admin",
					operatorIp: "192.168.1.1",
				}),
			});
		});

		it("行不存在时补建默认行（不删行，getAllConfigs 仍需可见）", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});

			await service.resetToDefault("mailEnabled", "admin");

			// getAllConfigs / get 遍历的是数据库行，删行会让配置项从面板消失，
			// 因此「恢复默认」必须是 upsert 归零而非 delete。
			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledWith(
				expect.objectContaining({
					create: expect.objectContaining({
						key: "mailEnabled",
						value: mailDefault,
						updatedBy: null,
					}),
				}),
			);
			// 新建行同样留审计记录（oldValue 为空）
			expect(mockPrisma.runtimeConfigLog.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					key: "mailEnabled",
					oldValue: undefined,
					newValue: mailDefault,
				}),
			});
		});

		it("值已是默认值时不留审计记录但仍失效缓存", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				value: mailDefault,
				updatedBy: null,
			});
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});

			await service.resetToDefault("mailEnabled", "admin");

			expect(mockPrisma.runtimeConfigLog.create).not.toHaveBeenCalled();
			expect(mockRedis.del).toHaveBeenCalled();
		});

		it("should throw BadRequestException for unknown key", async () => {
			await expect(service.resetToDefault("unknown-key")).rejects.toThrow(
				BadRequestException,
			);
		});
	});

	// ==================== set 校验 / history / resetCategory ====================
	describe("set 值校验", () => {
		beforeEach(() => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "maxFileSize",
				value: JSON.stringify(100),
				type: "number",
				updatedBy: null,
			});
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});
		});

		it("超出 max 上限 → BadRequestException", async () => {
			await expect(service.set("maxFileSize", 99999)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("低于 min 下限 → BadRequestException", async () => {
			await expect(service.set("maxFileSize", 0)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("类型不匹配（boolean 传入字符串）→ BadRequestException", async () => {
			await expect(service.set("mailEnabled", "yes")).rejects.toThrow(
				BadRequestException,
			);
		});

		it("number 类型传入 NaN → BadRequestException", async () => {
			await expect(service.set("maxFileSize", NaN)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("合法值正常写入", async () => {
			await service.set("maxFileSize", 256, "user-1", "127.0.0.1");
			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
			expect(mockPrisma.runtimeConfigLog.create).toHaveBeenCalled();
		});
	});

	describe("getHistory", () => {
		it("返回倒序历史并截断 limit", async () => {
			mockPrisma.runtimeConfigLog.findMany.mockResolvedValue([]);
			await service.getHistory("maxFileSize", 100000);
			expect(mockPrisma.runtimeConfigLog.findMany).toHaveBeenCalledWith({
				where: { key: "maxFileSize" },
				orderBy: { createdAt: "desc" },
				take: 100,
			});
		});
	});

	describe("resetCategory", () => {
		it("按分类批量重置并返回键列表", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			const keys = await service.resetCategory("mail", "user-1");
			expect(keys).toEqual(expect.arrayContaining(["mailEnabled", "requireEmailVerification", "refundNotifyEmails"]));
			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(keys.length);
		});

		it("未知分类 → BadRequestException（避免静默空操作）", async () => {
			await expect(service.resetCategory("no-such-category", "admin")).rejects.toThrow(
				BadRequestException,
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});
	});

	// ==================== getDefinitions ====================
	describe("getDefinitions", () => {
		it("should return all definitions", () => {
			const definitions = service.getDefinitions();
			expect(definitions.length).toBeGreaterThan(0);
			expect(definitions[0].key).toBeDefined();
		});
	});

	// ==================== parseValue ====================
	describe("parseValue", () => {
		it("should parse boolean type", () => {
			const result = (service as any).parseValue(
				JSON.stringify(true),
				"boolean",
			);
			expect(typeof result).toBe("boolean");
			expect(result).toBe(true);
		});

		it("should parse number type", () => {
			const result = (service as any).parseValue(JSON.stringify(42), "number");
			expect(typeof result).toBe("number");
			expect(result).toBe(42);
		});

		it("should parse string type", () => {
			const result = (service as any).parseValue(
				JSON.stringify("test"),
				"string",
			);
			expect(typeof result).toBe("string");
			expect(result).toBe("test");
		});

		it("should return original value on parse error", () => {
			const result = (service as any).parseValue("invalid-json", "string");
			expect(result).toBe("invalid-json");
		});

		it("should parse json type into object", () => {
			const result = (service as any).parseValue(
				JSON.stringify({ title: "CloudCAD" }),
				"json",
			);
			expect(result).toEqual({ title: "CloudCAD" });
		});

		it("should return empty object for non-object json value", () => {
			const result = (service as any).parseValue(JSON.stringify("str"), "json");
			expect(result).toEqual({});
		});
	});
});
