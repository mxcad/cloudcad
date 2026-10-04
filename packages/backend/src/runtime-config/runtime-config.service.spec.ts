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
			update: jest.fn(),
			upsert: jest.fn(),
		},
		// syncDefaultConfigs 用事务回填 isPublic/description 漂移，未 mock 会在
		// 构造期的 .catch() 里静默失败
		$transaction: jest.fn().mockImplementation(async (ops: unknown[]) => ops),
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

	// ==================== 启动期同步与 env 别名一致性 ====================
	describe("启动期同步与 env 别名一致性", () => {
		// 全部定义键都算「已存在」，否则其余键会被判为新增而走 createMany
		const allDefRows = (
			overrides: Record<string, Record<string, unknown>> = {},
		) =>
			RUNTIME_CONFIG_DEFINITIONS.map((d) => ({
				key: d.key,
				value: JSON.stringify(d.defaultValue),
				type: d.type,
				category: d.category,
				description: d.description,
				isPublic: d.isPublic,
				updatedBy: null,
				updatedAt: new Date(),
				...overrides[d.key],
			}));

		afterEach(() => {
			delete process.env.AUDIT_RETENTION_DAYS;
			delete process.env.AUDIT_LOG_RETENTION_DAYS;
		});

		it("isPublic / description 漂移时逐键回填，且不动 value / updatedBy", async () => {
			// mailEnabled 定义表 isPublic=true、description='邮件服务开关'；
			// 这里造的存量行两个字段都是旧值 → 应当被回填
			mockPrisma.runtimeConfig.findMany.mockResolvedValue(
				allDefRows({
					mailEnabled: { description: "旧文案", isPublic: false },
				}),
			);
			mockPrisma.runtimeConfig.createMany.mockResolvedValue({});
			mockPrisma.runtimeConfig.update.mockResolvedValue({});
			mockPrisma.$transaction.mockResolvedValue([]);

			await (service as any).syncDefaultConfigs();

			const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "mailEnabled")!;
			expect(mockPrisma.runtimeConfig.createMany).not.toHaveBeenCalled();
			expect(mockPrisma.runtimeConfig.update).toHaveBeenCalledTimes(1);
			// 只回填定义表独有的元数据两列——value / updatedBy 是「用户改过」与
			// 「env 层生效」的判据，碰了会让私有化定制静默失效
			expect(mockPrisma.runtimeConfig.update).toHaveBeenCalledWith({
				where: { key: "mailEnabled" },
				data: { isPublic: def.isPublic, description: def.description },
			});
			expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
		});

		it("全新键仍走 createMany + skipDuplicates，不做任何 update", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]);
			mockPrisma.runtimeConfig.createMany.mockResolvedValue({});

			await (service as any).syncDefaultConfigs();

			expect(mockPrisma.runtimeConfig.createMany).toHaveBeenCalledWith({
				data: expect.any(Array),
				skipDuplicates: true,
			});
			expect(mockPrisma.runtimeConfig.update).not.toHaveBeenCalled();
			expect(mockPrisma.$transaction).not.toHaveBeenCalled();
		});

		it("无新增也无漂移时直接返回，不产生任何写操作", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue(allDefRows());

			await (service as any).syncDefaultConfigs();

			expect(mockPrisma.runtimeConfig.createMany).not.toHaveBeenCalled();
			expect(mockPrisma.runtimeConfig.update).not.toHaveBeenCalled();
			expect(mockPrisma.$transaction).not.toHaveBeenCalled();
		});

		it("envValue 与 resolveValue 同口径：只配兼容别名时管理端也能看到 env 值", async () => {
			// 部署方沿用 #322 之前的旧变量名 AUDIT_LOG_RETENTION_DAYS=730
			delete process.env.AUDIT_RETENTION_DAYS;
			process.env.AUDIT_LOG_RETENTION_DAYS = "730";

			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "auditRetentionDays",
					value: JSON.stringify(183),
					type: "number",
					category: "audit",
					description: "审计日志保留天数",
					isPublic: false,
					updatedBy: null,
					updatedAt: new Date(),
				},
			]);

			const item = (await service.getAllConfigs()).find(
				(i) => i.key === "auditRetentionDays",
			)!;

			// resolveValue 认别名 → 生效值 730；enrichFromDefinition 若漏传 envAliases，
			// envValue 会是 null，「已被 env 锁定、清空后要重启才生效」的提示随之失效
			expect(item.value).toBe(730);
			expect(item.source).toBe("env");
			expect(item.envValue).toBe(730);
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


	// ==================== 定义表元数据不变式 ====================
	// tier / category / dangerous 只做展示分层，不参与任何权限与校验逻辑，
	// 因此这些字段的正确性没有别的测试能拦：写错只会让配置页「分组错位、
	// 运维基线默认看不见、该二次确认的没确认」。这里把运营上定下来的规则写成断言。
	describe("RUNTIME_CONFIG_DEFINITIONS 元数据不变式", () => {
		// 运维基线：系统管理员日常要动、改错后果可接受的项。
		// 必须在 admin 档——advanced 在 PC 配置页默认整档收起，放错等于「默认看不见」。
		const OPS_BASELINE = [
			"backupEnabled",
			"backupKeepLocal",
			"backupDrillEnabled",
			"alertEmailEnabled",
			"alertEmailTo",
			"alertEmailFailEscalate",
			"alertEmailP1WindowMinutes",
			"alertEmailP2DailyHour",
			"auditArchiveEnabled",
			"taskRunRetentionDays",
			"storageCleanupEnabled",
			"storageCleanupDelayDays",
			"trashCleanupEnabled",
			"trashCleanupDelayDays",
			"orphanCleanupEnabled",
			"lockCleanupEnabled",
			"userCleanupEnabled",
			"cacheCleanupEnabled",
			"cacheMonitorEnabled",
			"batchDownloadCleanupEnabled",
			"deviceAuthFrontendDomain",
		];

		// 各接口限流与账号锁定：必须在同一个 security 分组的同一个 advanced 档里，
		// 否则「调一处安全策略」要翻好几个分组。
		const RATE_LIMIT_KEYS = [
			"rateLimitPublicMax",
			"rateLimitPublicWindowMs",
			"rateLimitAuthMax",
			"rateLimitLoginMax",
			"rateLimitLoginWindowMs",
			"loginRateLimitMax",
			"loginRateLimitWindowSeconds",
			"passwordResetRateLimitMax",
			"passwordResetRateLimitWindowSeconds",
			"registerRateLimitMax",
			"registerRateLimitWindowSeconds",
			"orderCreateRateLimitMax",
			"orderCreateRateLimitWindowSeconds",
			"accountLockFailThreshold",
			"accountLockWindowSeconds",
			"accountLockDurationSeconds",
			"smsDailyLimitPerPhone",
			"smsHourlyLimitPerIp",
		];

		// 与前端 packages/frontend/src/pages/RuntimeConfigPage/meta.ts 的
		// CATEGORY_META 键集合必须一致：任一侧改动都要同步另一侧
		// （后端新增分类 → 前端补图标与标签，否则页面掉到末尾用 key 当标签）。
		const EXPECTED_CATEGORIES = [
			"brand",
			"mail",
			"sms",
			"file",
			"user",
			"system",
			"wechat",
			"storage",
			"billing",
			"collaboration",
			"security",
			"audit",
			"alert",
			"backup",
		];

		// 账号锁定的窗口与时长和阈值是一套：改一个不改另一个会互相抵消，故一起标 dangerous
		const LOCK_SET_KEYS = ["accountLockWindowSeconds", "accountLockDurationSeconds"];

		const def = (key: string) =>
			RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);

		it("每项必须声明 impact（没有「改了会怎样」的项不该出现在配置页）", () => {
			expect(RUNTIME_CONFIG_DEFINITIONS.length).toBeGreaterThan(0);
			expect(
				RUNTIME_CONFIG_DEFINITIONS.filter((d) => !d.impact).map((d) => d.key)
			).toEqual([]);
		});

		it("运维基线必须在 admin 档，不能落到默认收起的 advanced", () => {
			expect(OPS_BASELINE.filter((k) => !def(k))).toEqual([]);
			expect(
				OPS_BASELINE.filter((k) => def(k)?.tier !== "admin")
			).toEqual([]);
		});

		it("限流与锁定阈值成组落在 advanced + security", () => {
			expect(RATE_LIMIT_KEYS.filter((k) => !def(k))).toEqual([]);
			expect(
				RATE_LIMIT_KEYS.filter(
					(k) =>
						def(k)?.tier !== "advanced" ||
						def(k)?.category !== "security"
				)
			).toEqual([]);
		});

		it("dangerous 只标在阈值上：次数阈值必须标记，窗口长度除账号锁定外不得标记", () => {
			const thresholds = RUNTIME_CONFIG_DEFINITIONS.filter(
				(d) => d.key.endsWith("Max") || d.key === "accountLockFailThreshold"
			);
			expect(thresholds.length).toBeGreaterThan(0);
			expect(thresholds.filter((d) => !d.dangerous).map((d) => d.key)).toEqual([]);

			const windows = RUNTIME_CONFIG_DEFINITIONS.filter(
				(d) =>
					d.key.endsWith("WindowMs") ||
					d.key.endsWith("WindowSeconds") ||
					d.key.endsWith("DurationSeconds")
			);
			expect(
				windows
					.filter((d) => d.dangerous && !LOCK_SET_KEYS.includes(d.key))
					.map((d) => d.key)
			).toEqual([]);
		});

		it("分类集合闭集：与前端 CATEGORY_META 的键集合一致", () => {
			const actual = [...new Set(RUNTIME_CONFIG_DEFINITIONS.map((d) => d.category))].sort();
			expect(actual.filter((c) => !EXPECTED_CATEGORIES.includes(c))).toEqual([]);
			expect(actual).toEqual([...EXPECTED_CATEGORIES].sort());
		});
	});
	// ==================== 键登记完整性 ====================
	describe("getValue 键登记完整性", () => {
		it("业务代码读取的配置键必须都已登记（拼错的键会静默回落到 fallback，配置页改不动）", () => {
			const fs = require("fs");
			const path = require("path");
			const srcRoot = path.join(__dirname, "..");
			const registered = new Set(RUNTIME_CONFIG_DEFINITIONS.map((d) => d.key));

			// 间接键来源：这些文件用常量而非字面量持有配置键，字面量正则扫不到。

			// 配置键形如 camelCase 标识符；用 charCode 判定，避免在正则里写引号与转义。
			const isConfigKey = (s: string): boolean => {
				if (s.length === 0) return false;
				const first = s.charCodeAt(0);
				if (first < 97 || first > 122) return false;
				for (let k = 1; k < s.length; k += 1) {
					const c = s.charCodeAt(k);
					const ok = (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95;
					if (!ok) return false;
				}
				return true;
			};

			// 从声明体挑出形如 key: 'value' 或 key: "value" 的字符串字面量。
			function quotedKeys(body: string): string[] {
				const keys: string[] = [];
				const quotes = [34, 39];
				let i = 0;
				while (i < body.length) {
					if (!quotes.includes(body.charCodeAt(i))) { i += 1; continue; }
					let j = i + 1;
					while (j < body.length && !quotes.includes(body.charCodeAt(j))) j += 1;
					const inner = body.slice(i + 1, j);
					if (isConfigKey(inner)) keys.push(inner);
					i = j + 1;
				}
				return keys;
			}

			const INDIRECT_KEY_SOURCES: [string, RegExp][] = [
				[
					"task-run/task-run.constants.ts",
					/TASK_ENABLED_KEYS\s*=\s*[\x7b]([\s\S]*?)[\x7d]/ig,
				],
				[
					"vip/restriction-engine.service.ts",
					/\b[A-Z][A-Z_]*KEY\s*=\s*/gm,
				],
			];

			const indirectKeys = new Set<string>();
			for (const [rel, matcher] of INDIRECT_KEY_SOURCES) {
				const text = fs.readFileSync(path.join(srcRoot, rel), "utf8");
				for (const m of text.matchAll(matcher)) {
					const body = m[1] ?? text.slice(m.index, text.indexOf("\n", m.index + 1));
					for (const key of quotedKeys(body)) indirectKeys.add(key);
				}
			}

			// 调用侧：允许 getValue<T>( 与键之间换行（Prettier 换行后的常见形态）。
			const callPattern = /getValue\s*<[^>]*>\(\s*['"]([a-zA-Z][a-zA-Z0-9_]*)['"]/g;
			const calls: { key: string; file: string }[] = [];

			const walk = (dir: string): void => {
				for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
					const full = path.join(dir, entry.name);
					if (entry.isDirectory()) {
						if (entry.name !== "node_modules") walk(full);
					} else if (
						entry.name.endsWith(".ts") &&
						!entry.name.endsWith(".spec.ts") &&
						entry.name !== "runtime-config.service.ts"
					) {
						const text = fs.readFileSync(full, "utf8").replace(/\n\s*\(/g, "(");
						for (const m of text.matchAll(callPattern)) {
							calls.push({
								key: m[1],
								file: path.relative(srcRoot, full),
							});
						}
					}
				}
			};

			walk(srcRoot);

			// 调用侧扫描必须真跑起来，否则下面所有断言都是空过。
			expect(calls.length).toBeGreaterThan(0);

			const unknown = new Set(
				calls.filter((c) => !registered.has(c.key)).map((c) => c.key),
			);
			if (unknown.size > 0) {
				throw new Error(
					"以下键被 getValue 读取但未登记在 RUNTIME_CONFIG_DEFINITIONS：" +
						[...unknown]
							.sort()
							.map(
								(k) => `${k} <- ${calls.find((c) => c.key === k)?.file}`,
							)
							.join("\n"),
				);
			}

			// 间接引用的键也必须已登记（常量化引用最容易漏登记），断言非空防正则失配空过。
			expect(indirectKeys.size).toBeGreaterThan(0);
			const unknownIndirect = [...indirectKeys].filter((k) => !registered.has(k));
			if (unknownIndirect.length > 0) {
				throw new Error(`间接引用的配置键未登记：${unknownIndirect.join(", ")}`);
			}

			// 本轮迁运行时配置的键：必须已登记且有消费者
			// （未登记会让配置页改了不生效；无人读取则是空壳定义）。
			const migratedKeys = [
				"auditArchiveEnabled",
				"taskRunRetentionDays",
				"backupKeepLocal",
				"backupDrillEnabled",
				"fileZipCompressionLevel",
				"alertEmailEnabled",
				"alertEmailTo",
				"alertEmailFailEscalate",
				"alertEmailP1WindowMinutes",
				"alertEmailP2DailyHour",
			];
			const problems = migratedKeys.filter(
				(k) => !registered.has(k) || !calls.some((c) => c.key === k),
			);
			if (problems.length > 0) {
				throw new Error(`迁移键未登记或无人读取：${problems.join(", ")}`);
			}
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
