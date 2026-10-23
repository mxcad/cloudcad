///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
	BadRequestException,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { RUNTIME_CONFIG_DEFINITIONS } from "./runtime-config.constants";
import { RuntimeConfigService } from "./runtime-config.service";
import { ChannelCryptoService } from "./channel-crypto.service";
import { validateDefinitions } from "./runtime-config.invariants";
import type { RuntimeConfigDefinition } from "./runtime-config.types";

describe("RuntimeConfigService", () => {
	let service: RuntimeConfigService;
	let channelCrypto: ChannelCryptoService;

	const mockPrisma = {
		runtimeConfig: {
			findMany: jest.fn(),
			findUnique: jest.fn(),
			createMany: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
			upsert: jest.fn(),
		},
		// syncDefaultConfigs 用事务回填 isPublic/description 漂移，未 mock 会在
		// 构造期的 .catch() 里静默失败
		$transaction: jest.fn(),
		runtimeConfigLog: {
			create: jest.fn(),
			findMany: jest.fn(),
		},
		// 通道验证记录（ADR-0082 D4）：门禁读验证状态、配置写路径删验证记录
		channelVerification: {
			findUnique: jest.fn(),
			deleteMany: jest.fn(),
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

			// 依赖门禁与一致性检测走 findMany 批量读生效值；默认空行集
			// （全部键落到定义默认值），各用例按需覆盖
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]);

			// 通道验证记录：默认「无验证」（findUnique 返回 null），删除为 no-op
			mockPrisma.channelVerification.findUnique.mockResolvedValue(null);
			mockPrisma.channelVerification.deleteMany.mockResolvedValue({
				count: 0,
			});

		// $transaction 两种形态：数组式（syncDefaultConfigs 批量回填）与交互式
		// （applyProfile 把值写入与审计写入放进同一个事务）。交互式的 tx 直接用
		// mockPrisma 本身，断言仍落在同一批 mock 上。
		mockPrisma.$transaction.mockImplementation(async (arg: unknown) =>
			typeof arg === "function"
				? (arg as (tx: unknown) => Promise<unknown>)(mockPrisma)
				: arg,
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RuntimeConfigService,
				ChannelCryptoService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{
					provide: "default_IORedisModuleConnectionToken",
					useValue: mockRedis,
				},
				// 通道加密密钥：固定 64 位 hex（真实 AES-256-GCM 加解密走真实现）
				{
					provide: ConfigService,
					useValue: {
						get: (path: string) =>
							path === "channel.encryptionKey"
								? "ab".repeat(32)
								: undefined,
					},
				},
			],
		}).compile();

		service = module.get<RuntimeConfigService>(RuntimeConfigService);
		channelCrypto = module.get<ChannelCryptoService>(ChannelCryptoService);
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

		it("启动期数据库不可达 → 降级返回定义默认值，不抛错", async () => {
			const warnSpy = jest.spyOn(Logger.prototype, "warn");
			dbDown();

			const result = await service.getValue("maxFileSize");

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

			await expect(service.getValue("maxFileSize")).rejects.toThrow(
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

		it("未登记在定义表的 key → 无 DB 行时返回空串（默认值由调用方自带）", async () => {
			// 删参前的行为是返回调用方 fallback；现由 impl-mx 的 oldSiteApiBase 这样
			// 刻意不登记的键在自己的唯一消费点做 `|| 默认值`。
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			expect(await service.getValue("unregistered-key")).toBe("");
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
			// 样例键用 allowRegister：无通道门禁/依赖边，纯验证 set 写路径
			// （mailEnabled/smsEnabled 自 #495/#502 起是通道开关，置 true 会触发通道门禁）
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				value: JSON.stringify(false),
			});
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});

			await service.set("allowRegister", true, "admin", "192.168.1.1");

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

			await service.set("allowRegister", false);

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
		});

		it("改回出厂默认值且无 env 层 → 清 updatedBy，不写冗余行", async () => {
			// 「切 true 保存 → 再切回出厂值 true」这条路径的第二步：DB 行还挂着旧值，
			// 用户视角是「本质没改」。若照旧写 updatedBy，该行会永久遮蔽 env 层，
			// 且「已修改」标记只能靠 resetToDefault 才能清掉。
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				value: JSON.stringify(false),
				updatedBy: "user-1",
			});
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			await service.set("allowRegister", true, "admin", "192.168.1.1");

			// 关键不变式：updatedBy 必须归零而非带上操作者 id
			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledWith({
				where: { key: "allowRegister" },
				update: { value: JSON.stringify(true), updatedBy: null },
				create: expect.objectContaining({
					key: "allowRegister",
					value: JSON.stringify(true),
					updatedBy: null,
				}),
			});
			expect(mockRedis.del).toHaveBeenCalled();
		});

		it("env 层有值时不短路：写库压住 env 是显式覆盖部署期配置的唯一通道", async () => {
			delete process.env.AUDIT_RETENTION_DAYS;
			delete process.env.AUDIT_LOG_RETENTION_DAYS;
			process.env.AUDIT_RETENTION_DAYS = "183";

			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});

			// 提交值恰好等于出厂默认值，但 env 也设了同值——仍须写库，
			// 否则用户改完刷新页面又会弹回 env 值
			await service.set("auditRetentionDays", 183, "admin");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledWith(
				expect.objectContaining({
					update: expect.objectContaining({ updatedBy: "admin" }),
				}),
			);

			delete process.env.AUDIT_RETENTION_DAYS;
		});
	});

	// ==================== 已修改标记口径 ====================
	describe("isModified 口径", () => {
		beforeEach(() => {
			delete process.env.AUDIT_RETENTION_DAYS;
			delete process.env.AUDIT_LOG_RETENTION_DAYS;
		});

		afterEach(() => {
			delete process.env.AUDIT_RETENTION_DAYS;
			delete process.env.AUDIT_LOG_RETENTION_DAYS;
		});

		it("已修改 = 生效值偏离出厂值，不看 updatedBy", async () => {
			// allowRegister：值已等于出厂默认 true，但历史上被写过（updatedBy 挂着）
			// → 不标记。按 updatedBy 判的话，用户把值切回出厂值后标记永远清不掉。
			// auditRetentionDays：从未被改过（updatedBy 为空），但 env 注入了偏离
			// 出厂值 183 的值 → 标记，来源归 env。
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "allowRegister",
					value: JSON.stringify(true),
					type: "boolean",
					updatedBy: "user-1",
					updatedAt: new Date(),
				},
				{
					key: "auditRetentionDays",
					value: JSON.stringify(90),
					type: "number",
					updatedBy: null,
					updatedAt: new Date(),
				},
			]);
			process.env.AUDIT_RETENTION_DAYS = "365";

			const result = await service.getAllConfigs();
			const backToDefault = result.find((c) => c.key === "allowRegister");
			const envDriven = result.find((c) => c.key === "auditRetentionDays");

			expect(backToDefault?.value).toBe(true);
			expect(backToDefault?.isModified).toBe(false);
			expect(envDriven?.value).toBe(365);
			expect(envDriven?.isModified).toBe(true);
			expect(envDriven?.source).toBe("env");
			expect(envDriven?.envValue).toBe(365);
		});

		it("profile 预览与列表页共用同一口径", async () => {
			// 真实定义表的 allowRegister 未声明 profiles，注入一个声明了 profiles
			// 的同名测试定义，只验证 isModified 判据、不验证 profile 值本身
			jest
				.spyOn(
					service as unknown as { getProfileDefinitions: () => unknown },
					"getProfileDefinitions",
				)
				.mockReturnValue([
					{
						key: "allowRegister",
						type: "boolean",
						category: "account",
						description: "测试用键",
						defaultValue: true,
						isPublic: true,
						profiles: { normal: true, secure: false },
					},
				]);

			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "allowRegister",
					value: JSON.stringify(true),
					type: "boolean",
					updatedBy: "user-1",
				},
			]);

			const preview = await service.previewProfileApply("normal");
			const entry = preview.find((e) => e.key === "allowRegister");

			expect(entry?.isModified).toBe(false);
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
			// 只回填定义表独有的元数据列——value / updatedBy 是「用户改过」与
			// 「env 层生效」的判据，碰了会让私有化定制静默失效
			expect(mockPrisma.runtimeConfig.update).toHaveBeenCalledWith({
				where: { key: "mailEnabled" },
				data: {
					isPublic: def.isPublic,
					description: def.description,
					category: def.category,
				},
			});
			expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
		});

		it("分类漂移时回填 category（#498 重划后存量行不再落回裸英文分类名）", async () => {
			// mailEnabled 重划后归 alert（原 mail 类已并入）；
			// 存量行还停在旧分类 → 启动期同步应回填为新分类
			mockPrisma.runtimeConfig.findMany.mockResolvedValue(
				allDefRows({
					mailEnabled: { category: "mail" as never },
				}),
			);
			mockPrisma.runtimeConfig.createMany.mockResolvedValue({});
			mockPrisma.runtimeConfig.update.mockResolvedValue({});
			mockPrisma.$transaction.mockResolvedValue([]);

			await (service as any).syncDefaultConfigs();

			const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "mailEnabled")!;
			expect(def.category).toBe("alert");
			expect(mockPrisma.runtimeConfig.update).toHaveBeenCalledTimes(1);
			expect(mockPrisma.runtimeConfig.update).toHaveBeenCalledWith({
				where: { key: "mailEnabled" },
				data: {
					isPublic: def.isPublic,
					description: def.description,
					category: "alert",
				},
			});
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

		it("分类以定义表为准：存量行残留旧分类时读路径不回 DB 旧值", async () => {
			// quota 并入 billing 后存量行仍停在旧分类。照 DB 回会让前端渲染出无显示名的
			// 幽灵分组，且对该分组「恢复默认」会被 resetCategory 判为未知分类而 400。
			const rows = allDefRows({
				conversionGuestLimit: { category: "quota" as never },
			});
			mockPrisma.runtimeConfig.findMany.mockResolvedValue(rows);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(
				rows.find((r) => r.key === "conversionGuestLimit")!,
			);

			const item = (await service.getAllConfigs()).find(
				(i) => i.key === "conversionGuestLimit",
			)!;
			const single = await service.get("conversionGuestLimit");

			expect(item.category).toBe("billing");
			expect(single.category).toBe("billing");
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

	// ==================== 依赖门禁（requires，ADR-0082） ====================
	// 「功能开关开着、它依赖的通道开关关着」的静默失效状态必须无法被新制造：
	// 单键 set / 重置 / profile 批量应用三条更新路径共用同一套拒绝式判定。
	describe("依赖门禁（requires）", () => {
		// 布尔键的生效行：updatedBy 非空 = 运行时层生效
		const boolRow = (key: string, value: boolean) => ({
			key,
			value: JSON.stringify(value),
			type: "boolean",
			category: "mail",
			description: "",
			isPublic: true,
			updatedBy: "u-1",
			updatedAt: new Date(),
		});

		const mockWritePath = (rows: object[]) => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue(rows);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});
		};

		/** 邮件通道完整 + 已验证（#495 起开启 mailEnabled 的通道门禁前提） */
		const mockMailChannelReady = (rows: object[]) => {
			mockWritePath([
				...rows,
				{
					key: "smtpHost",
					value: JSON.stringify("smtp.test.com"),
					type: "string",
					updatedBy: "u-1",
				},
				{
					key: "smtpPort",
					value: JSON.stringify(465),
					type: "number",
					updatedBy: "u-1",
				},
				{
					key: "smtpSecure",
					value: JSON.stringify(true),
					type: "boolean",
					updatedBy: "u-1",
				},
				{
					key: "smtpUser",
					value: JSON.stringify("u@test"),
					type: "string",
					updatedBy: "u-1",
				},
				{
					key: "smtpPassword",
					value: JSON.stringify(channelCrypto.encrypt("p")),
					type: "string",
					updatedBy: "u-1",
				},
				{
					key: "smtpFrom",
					value: JSON.stringify("CloudCAD <noreply@test.com>"),
					type: "string",
					updatedBy: "u-1",
				},
			]);
			mockPrisma.channelVerification.findUnique.mockResolvedValue({
				id: "cv-mail",
				channel: "mail",
				verifiedAt: new Date("2026-10-22T08:00:00Z"),
				testedBy: "u-1",
				testedByIp: "127.0.0.1",
				verdict: "PROBE",
				createdAt: new Date("2026-10-22T08:00:00Z"),
			});
		};

		it("开启功能开关而依赖的通道开关为关 → 拒绝，错误明确指出缺失的依赖", async () => {
			mockWritePath([]); // mailEnabled 落默认值 false

			await expect(
				service.set("requireEmailVerification", true, "admin"),
			).rejects.toThrow("mailEnabled");
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("依赖的通道开关已开 → 功能开关正常开启", async () => {
			mockWritePath([boolRow("mailEnabled", true)]);

			await service.set("requireEmailVerification", true, "admin");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
		});

		it("关闭仍被功能开关依赖的通道开关 → 拒绝，提示先关闭依赖方", async () => {
			// mailEnabled 当前为开（有运行时行）：关闭它才会新制造违规
			mockWritePath([
				boolRow("requireEmailVerification", true),
				boolRow("mailEnabled", true),
			]);

			await expect(
				service.set("mailEnabled", false, "admin"),
			).rejects.toThrow("requireEmailVerification");
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("依赖方为关时，通道开关可正常关闭", async () => {
			mockWritePath([]);

			await service.set("mailEnabled", false, "admin");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
		});

		it("告警邮件依赖邮件服务（现代码缺失的边）：邮件关着时开告警邮件 → 拒绝", async () => {
			mockWritePath([]);

			await expect(
				service.set("alertEmailEnabled", true, "admin"),
			).rejects.toThrow("mailEnabled");
		});

		it("微信自动建号依赖微信登录开关 → 微信关着时拒绝", async () => {
			mockWritePath([]);

			await expect(
				service.set("wechatAutoRegister", true, "admin"),
			).rejects.toThrow("wechatEnabled");
		});

		it("强制手机号验证依赖短信服务开关 → 短信关着时拒绝", async () => {
			mockWritePath([]);

			await expect(
				service.set("requirePhoneVerification", true, "admin"),
			).rejects.toThrow("smsEnabled");
		});

		it("已存在的遗留不一致（重放同一个值）不算新制造 → 放行", async () => {
			// requireEmailVerification 已开、mailEnabled 已关：门禁上线前的遗留状态
			mockWritePath([boolRow("requireEmailVerification", true)]);

			await service.set("requireEmailVerification", true, "admin");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
		});

		it("开启依赖项修复遗留不一致 → 放行", async () => {
			// 通道门禁（#495）：开启 mailEnabled 还须邮件通道完整 + 已验证
			mockMailChannelReady([boolRow("requireEmailVerification", true)]);

			await service.set("mailEnabled", true, "admin");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
		});

		it("非布尔键不受门禁影响", async () => {
			mockWritePath([]);

			await service.set("maxFileSize", 256, "admin");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
		});

		it("重置通道开关为默认（关）而依赖方仍开 → 同样被门禁拦截", async () => {
			mockWritePath([
				boolRow("requireEmailVerification", true),
				boolRow("mailEnabled", true),
			]);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(
				service.resetToDefault("mailEnabled", "admin"),
			).rejects.toThrow("requireEmailVerification");
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("依赖方为关时，重置通道开关放行", async () => {
			mockWritePath([]);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);
			mockPrisma.runtimeConfig.upsert.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			await service.resetToDefault("mailEnabled", "admin");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalled();
		});
	});

	// ==================== 依赖一致性检测（检查手段①） ====================
	describe("依赖一致性检测（detectDependencyViolations）", () => {
		const boolRow = (key: string, value: boolean) => ({
			key,
			value: JSON.stringify(value),
			type: "boolean",
			updatedBy: "u-1",
		});

		it("状态一致 → 空清单", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]);

			expect(await service.detectDependencyViolations()).toEqual([]);
		});

		it("揪出门禁上线前遗留的「验证开+通道关」", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				boolRow("requireEmailVerification", true),
			]);

			const violations = await service.detectDependencyViolations();

			expect(violations).toEqual([
				{ dependent: "requireEmailVerification", required: "mailEnabled" },
			]);
		});

		it("揪出告警邮件「邮件服务关着、告警照发」的反向偏离", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				boolRow("alertEmailEnabled", true),
			]);

			const violations = await service.detectDependencyViolations();

			expect(violations).toEqual([
				{ dependent: "alertEmailEnabled", required: "mailEnabled" },
			]);
		});

		it("通道开着、功能关着（未使用依赖）→ 不是违规", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				boolRow("mailEnabled", true),
			]);

			expect(await service.detectDependencyViolations()).toEqual([]);
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

			const keys = await service.resetCategory("alert", "user-1");
			expect(keys).toEqual(expect.arrayContaining(["mailEnabled", "refundNotifyEmails", "alertEmailEnabled"]));
			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(keys.length);
		});

		it("未知分类 → BadRequestException（避免静默空操作）", async () => {
			await expect(service.resetCategory("no-such-category", "admin")).rejects.toThrow(
				BadRequestException,
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});
	});

	// ==================== profile 预览与应用 ====================
	// 预览展示的「将改动项」与实际写入集合不一致，是本机制最主要的失效方式
	// ——运维按预览做过决策、点应用后行为却不同。以下用例把这条不变量钉死。
	describe("profile 预览与应用", () => {
		// T11 填真实目标值之前，定义表里只有 securityMode 一个键声明了 profiles，
		// 不足以验证批量语义。这里注入一个三键定义集覆盖：需改写、已等于目标、
		// 无 DB 行三种情形。
		const seededDefs: RuntimeConfigDefinition[] = [
			{
				key: "lockFailThreshold",
				type: "number",
				category: "security",
				description: "测试用键",
				defaultValue: 5,
				isPublic: false,
				profiles: { secure: 1, normal: 10 },
			},
			{
				key: "sessionTtlSeconds",
				type: "number",
				category: "security",
				description: "测试用键",
				defaultValue: 3600,
				isPublic: false,
				envKey: "TEST_SESSION_TTL_SECONDS",
				profiles: { secure: 1800, normal: 7200 },
			},
			{
				key: "auditRetentionDays",
				type: "number",
				category: "audit",
				description: "测试用键",
				defaultValue: 90,
				isPublic: false,
				profiles: { secure: 365, normal: 30 },
			},
		];

		const withSeededDefs = () => {
			jest
				.spyOn(service as unknown as { getProfileDefinitions: () => unknown }, "getProfileDefinitions")
				.mockReturnValue(seededDefs);
		};

		beforeEach(() => {
			delete process.env.TEST_SESSION_TTL_SECONDS;
		});

		it("预览的 willChange 集合必须等于应用的 applied 集合", async () => {
			withSeededDefs();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{ key: "lockFailThreshold", value: JSON.stringify(8), type: "number", updatedBy: "u-1" },
				{ key: "sessionTtlSeconds", value: JSON.stringify(1800), type: "number", updatedBy: null },
			]);
			mockPrisma.runtimeConfig.update.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			const preview = await service.previewProfileApply("secure");
			const expected = preview.filter((e) => e.willChange).map((e) => e.key);

			const result = await service.applyProfile("secure", "admin-1", "127.0.0.1");

			expect(expected.sort()).toEqual(expect.not.arrayContaining(["sessionTtlSeconds"]));
			expect(result.applied.sort()).toEqual(expected.sort());
			expect(result.unchanged).toContain("sessionTtlSeconds");
			expect(result.profile).toBe("secure");
		});

		it("应用时覆盖用户已手工修改的值，并把旧值记进审计", async () => {
			withSeededDefs();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{ key: "lockFailThreshold", value: JSON.stringify(8), type: "number", updatedBy: "u-77" },
			]);
			mockPrisma.runtimeConfig.update.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			await service.applyProfile("secure", "admin-1", "10.0.0.2");

			expect(mockPrisma.runtimeConfig.update).toHaveBeenCalledWith({
				where: { key: "lockFailThreshold" },
				data: { value: JSON.stringify(1), updatedBy: "admin-1" },
			});
			expect(mockPrisma.runtimeConfigLog.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					key: "lockFailThreshold",
					oldValue: JSON.stringify(8),
					newValue: JSON.stringify(1),
					operatorId: "admin-1",
					operatorIp: "10.0.0.2",
				}),
			});
		});

		it("值写入与审计写入走同一个交互事务，缓存失效在事务外", async () => {
			withSeededDefs();
			// 全部无 DB 行 → 三种键都走 create
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]);
			mockPrisma.runtimeConfig.create.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			const result = await service.applyProfile("secure", "admin-1");

			expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
			expect(typeof mockPrisma.$transaction.mock.calls[0][0]).toBe("function");
			expect(mockPrisma.runtimeConfig.create).toHaveBeenCalledTimes(seededDefs.length);
			expect(mockPrisma.runtimeConfigLog.create).toHaveBeenCalledTimes(seededDefs.length);
			expect(mockPrisma.runtimeConfig.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					key: "lockFailThreshold",
					value: JSON.stringify(1),
					type: "number",
					updatedBy: "admin-1",
				}),
			});
			expect(mockRedis.del).toHaveBeenCalledWith("runtime_config:all");
			expect(result.applied.length).toBe(seededDefs.length);
			expect(result.unchanged).toEqual([]);
		});

		it("事务内任一项写入失败 → 抛错且不失效缓存", async () => {
			withSeededDefs();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{ key: "lockFailThreshold", value: JSON.stringify(5), type: "number", updatedBy: null },
				{ key: "sessionTtlSeconds", value: JSON.stringify(3600), type: "number", updatedBy: null },
			]);
			mockPrisma.runtimeConfig.update.mockRejectedValueOnce(new Error("constraint"));

			await expect(service.applyProfile("secure", "admin-1")).rejects.toThrow("constraint");
			expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
			// 缓存失效在事务之后，事务抛错时必须走不到
			expect(mockRedis.del).not.toHaveBeenCalled();
		});

		it("缓存失效失败不影响应用结果（尽力而为，不回滚已提交的 DB 写入）", async () => {
			withSeededDefs();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]);
			mockPrisma.runtimeConfig.create.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});
			mockRedis.del.mockRejectedValue(new Error("redis down"));

			const result = await service.applyProfile("secure", "admin-1");
			expect(result.applied.length).toBe(seededDefs.length);
		});

		it("生效值已等于目标值 → 跳过写入，但预览暴露 envValue 让运维知情", async () => {
			withSeededDefs();
			// env 层把生效值抬到 secure 目标值：DB 行仍是安装默认行
			process.env.TEST_SESSION_TTL_SECONDS = "1800";
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{ key: "sessionTtlSeconds", value: JSON.stringify(3600), type: "number", updatedBy: null },
			]);
			mockPrisma.runtimeConfig.update.mockResolvedValue({});

			const preview = await service.previewProfileApply("secure");
			const entry = preview.find((e) => e.key === "sessionTtlSeconds");
			expect(entry?.source).toBe("env");
			expect(entry?.envValue).toBe(1800);
			expect(entry?.currentValue).toBe(1800);
			expect(entry?.willChange).toBe(false);

			const result = await service.applyProfile("secure", "admin-1");
			expect(result.applied).not.toContain("sessionTtlSeconds");
			expect(result.unchanged).toContain("sessionTtlSeconds");
			expect(mockPrisma.runtimeConfig.update).not.toHaveBeenCalled();
		});

		it("缺操作者 → BadRequestException 且不写库", async () => {
			withSeededDefs();
			await expect(
				service.applyProfile("secure", undefined as unknown as string),
			).rejects.toThrow(BadRequestException);
			// 写空 updatedBy 会让 resolveValue 把该行当成安装默认行、env 重新压上来，
			// profile 静默不生效——所以必须在任何读取与写入之前拦下
			expect(mockPrisma.runtimeConfig.findMany).not.toHaveBeenCalled();
			expect(mockPrisma.$transaction).not.toHaveBeenCalled();
		});

		it("未知模式 → BadRequestException（拒绝静默回退成某个模式）", async () => {
			await expect(service.previewProfileApply("strict")).rejects.toThrow(
				BadRequestException,
			);
			await expect(service.applyProfile("strict", "admin-1")).rejects.toThrow(
				BadRequestException,
			);
			expect(mockPrisma.runtimeConfig.findMany).not.toHaveBeenCalled();
		});

		it("没有任何键声明 profiles → BadRequestException（拒绝静默空操作）", async () => {
			jest
				.spyOn(service as unknown as { getProfileDefinitions: () => unknown }, "getProfileDefinitions")
				.mockReturnValue([]);
			await expect(service.previewProfileApply("secure")).rejects.toThrow(
				BadRequestException,
			);
			expect(mockPrisma.runtimeConfig.findMany).not.toHaveBeenCalled();
		});

		it("securityMode 标记键参与应用：标记与取值同批提交", async () => {
			// 用真实定义表（不注入），验证 wiring 而非只验证注入逻辑
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]);
			mockPrisma.runtimeConfig.create.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			const preview = await service.previewProfileApply("secure");
			const marker = preview.find((e) => e.key === "securityMode");
			expect(marker).toBeDefined();
			expect(marker?.category).toBe("security");
			expect(marker?.targetValue).toBe("secure");
			expect(marker?.willChange).toBe(true);

			const result = await service.applyProfile("secure", "admin-1");
			expect(result.applied).toContain("securityMode");
		});

		// ── profile 批量应用的依赖门禁（ADR-0082） ──
		// 真实定义表里没有任何 profile 键声明 requires，无法用真实边触发批量门禁；
		// 这里注入「profile 键依赖非 profile 通道键」的合成边，验证门禁语义本身。
		const seededEdgeDefs: RuntimeConfigDefinition[] = [
			{
				key: "featureX",
				type: "boolean",
				category: "security",
				description: "测试功能开关",
				defaultValue: false,
				isPublic: false,
				profiles: { secure: true, normal: false },
				requires: ["channelY"],
			},
		];

		const withSeededEdge = () => {
			jest
				.spyOn(
					service as unknown as { getProfileDefinitions: () => unknown },
					"getProfileDefinitions",
				)
				.mockReturnValue(seededEdgeDefs);
			jest
				.spyOn(
					service as unknown as { getDependencyEdges: () => unknown },
					"getDependencyEdges",
				)
				.mockReturnValue([{ dependent: "featureX", required: "channelY" }]);
		};

		const boolRow = (key: string, value: boolean) => ({
			key,
			value: JSON.stringify(value),
			type: "boolean",
			updatedBy: "u-1",
		});

		it("批量应用会新制造「功能开+通道关」→ 预览与应用都拒绝", async () => {
			withSeededEdge();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([]); // channelY 关
			mockPrisma.runtimeConfig.create.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			await expect(service.previewProfileApply("secure")).rejects.toThrow(
				"channelY",
			);
			await expect(
				service.applyProfile("secure", "admin-1"),
			).rejects.toThrow("channelY");
			expect(mockPrisma.$transaction).not.toHaveBeenCalled();
		});

		it("依赖的通道开关已开 → 批量应用放行", async () => {
			withSeededEdge();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				boolRow("channelY", true),
			]);
			mockPrisma.runtimeConfig.create.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			const result = await service.applyProfile("secure", "admin-1");

			expect(result.applied).toContain("featureX");
		});

		it("遗留不一致且本次不动相关键（目标值=当前值）→ 不算新制造，放行", async () => {
			withSeededEdge();
			// featureX 已开、channelY 已关：secure 目标 featureX=true 与当前一致
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				boolRow("featureX", true),
			]);
			mockPrisma.runtimeConfig.update.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			const result = await service.applyProfile("secure", "admin-1");

			expect(result.applied).toEqual([]);
			expect(result.unchanged).toContain("featureX");
		});

		it("批量应用修复遗留不一致（功能开关目标为关）→ 放行", async () => {
			withSeededEdge();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				boolRow("featureX", true),
			]);
			mockPrisma.runtimeConfig.update.mockResolvedValue({});
			mockPrisma.runtimeConfigLog.create.mockResolvedValue({});

			const result = await service.applyProfile("normal", "admin-1");

			expect(result.applied).toContain("featureX");
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
	// tier / category / dangerous 等只做展示分层与运维习惯约定，不参与任何权限
	// 与校验逻辑，因此这些字段的正确性没有别的机制能拦：写错只会让配置页
	// 「分组错位、运维基线默认看不见、该二次确认的没确认」。规则本体与定义表
	// 同处一个模块（runtime-config.invariants.ts）跟着数据走，改定义的人在改动
	// 点旁边就能看到全部约束；这里只断言全部满足，失败信息含键名与期望值。
	describe("RUNTIME_CONFIG_DEFINITIONS 元数据不变式", () => {
		it("定义表元数据不变式全部满足", () => {
			expect(validateDefinitions()).toEqual([]);
		});
	});
	// ==================== 键登记完整性 ====================
	describe("getValue 键登记完整性", () => {
		it("业务代码读取的配置键必须都已登记（拼错的键静默返回空串，配置页也改不动）", () => {
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
	// ==================== 秘密键（通道秘密密文落库，ADR-0082 #493） ====================
	// 定义表当前尚无 secret 键（SMTP 等通道密钥在 #495 登记），
	// 这里注入合成定义验证机制层的通用行为。
	describe("秘密键（通道秘密密文落库）", () => {
		const secretDef: RuntimeConfigDefinition = {
			key: "testChannelSecret",
			type: "string",
			category: "alert",
			description: "测试通道秘密",
			defaultValue: "",
			isPublic: false,
			input: { secret: true },
			envKey: "TEST_CHANNEL_SECRET_ENV",
		};

		beforeEach(() => {
			RUNTIME_CONFIG_DEFINITIONS.push(secretDef);
		});

		afterEach(() => {
			RUNTIME_CONFIG_DEFINITIONS.pop();
			delete process.env.TEST_CHANNEL_SECRET_ENV;
		});

		it("set() 秘密键以密文落库，历史日志同存密文（明文不落盘）", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("testChannelSecret", "smtp-pass-123", "op-1");

			const upsert = mockPrisma.runtimeConfig.upsert.mock.calls[0][0];
			expect(upsert.update.value.startsWith('"chan:v1:')).toBe(true);
			expect(upsert.update.value).not.toContain("smtp-pass-123");
			expect(upsert.create.value).toBe(upsert.update.value);
			const log = mockPrisma.runtimeConfigLog.create.mock.calls[0][0];
			expect(log.data.newValue).toBe(upsert.update.value);
		});

		it("getValue 返回明文（内部消费方），且不读写 Redis 缓存", async () => {
			const ciphertext = channelCrypto.encrypt("smtp-pass-123");
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "testChannelSecret",
				value: JSON.stringify(ciphertext),
				type: "string",
				updatedBy: "op-1",
			});

			const result = await service.getValue("testChannelSecret");

			expect(result).toBe("smtp-pass-123");
			expect(mockRedis.get).not.toHaveBeenCalled();
			expect(mockRedis.setex).not.toHaveBeenCalled();
		});

		it("get() 对管理端只回掩码，envValue 不泄露 env 层明文", async () => {
			const ciphertext = channelCrypto.encrypt("smtp-pass-123");
			process.env.TEST_CHANNEL_SECRET_ENV = "env-smtp-pass";
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "testChannelSecret",
				value: JSON.stringify(ciphertext),
				type: "string",
				updatedBy: "op-1",
			});

			const item = await service.get("testChannelSecret");

			expect(item.value).toBe("sm****23");
			expect(item.envValue).toBeNull();
		});

		it("getAllConfigs 秘密键回掩码", async () => {
			const ciphertext = channelCrypto.encrypt("smtp-pass-123");
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "testChannelSecret",
					value: JSON.stringify(ciphertext),
					type: "string",
					category: "mail",
					description: "测试通道秘密",
					isPublic: false,
					updatedBy: "op-1",
					updatedAt: new Date(),
				},
			]);

			const items = await service.getAllConfigs();

			expect(items[0].value).toBe("sm****23");
		});

		it("公开端点永不包含秘密键（纵深防御）", async () => {
			mockRedis.get.mockResolvedValue(null);
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "testChannelSecret",
					value: JSON.stringify("x"),
					type: "string",
					updatedBy: null,
				},
				{
					key: "mailEnabled",
					value: "true",
					type: "boolean",
					updatedBy: null,
				},
			]);

			const result = await service.getPublicConfigs();

			expect(result).not.toHaveProperty("testChannelSecret");
			expect(result).toHaveProperty("mailEnabled");
		});

		it("清空秘密键（空值）= 恢复默认：清 updatedBy，env 层重新生效", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "testChannelSecret",
				value: JSON.stringify(channelCrypto.encrypt("old-pass")),
				type: "string",
				updatedBy: "op-1",
			});

			await service.set("testChannelSecret", "", "op-1");

			const upsert = mockPrisma.runtimeConfig.upsert.mock.calls[0][0];
			expect(upsert.update).toEqual({ value: '""', updatedBy: null });
		});

		it("未显式修改时 env 层明文生效（env 层不加密、不解密）", async () => {
			process.env.TEST_CHANNEL_SECRET_ENV = "env-smtp-pass";
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "testChannelSecret",
				value: '""',
				type: "string",
				updatedBy: null,
			});

			const result = await service.getValue("testChannelSecret");

			expect(result).toBe("env-smtp-pass");
		});

		it("不变式：秘密键不得公开、不得声明 profiles", () => {
			// 定义表当前无 secret 键（SMTP 键在 #495 登记），不变式先行钉死：
			// 秘密键进公开端点或 profile 批量应用都是泄露/静默改写路径
			const secretDefs = RUNTIME_CONFIG_DEFINITIONS.filter(
				(d) => d.input?.secret
			);
			expect(
				secretDefs
					.filter((d) => d.isPublic || d.profiles != null)
					.map((d) => d.key)
			).toEqual([]);
		});
	});

	describe("通道门禁与验证失效（ADR-0082 D4）", () => {
		// 合成通道 testChannel：2 个配置项（host 必填 + profile 项）+ 1 个开关（默认关）。
		// 真实 SMTP 键在 #495 登记，机制层用合成定义验证。
		const channelItemDef: RuntimeConfigDefinition = {
			key: "testChannelHost",
			type: "string",
			category: "alert",
			description: "测试通道主机",
			defaultValue: "",
			isPublic: false,
			channel: "testChannel",
		};
		const channelSwitchDef: RuntimeConfigDefinition = {
			key: "testChannelEnabled",
			type: "boolean",
			category: "alert",
			description: "测试通道开关",
			defaultValue: false,
			isPublic: false,
			channelSwitch: "testChannel",
			// 声明 profiles 才参与 profile 批量应用（验证「不得经 profile 绕过门禁」）
			profiles: { secure: true, normal: false },
		};
		const channelProfileItemDef: RuntimeConfigDefinition = {
			key: "testChannelProfileHost",
			type: "string",
			category: "alert",
			description: "测试通道 profile 主机",
			defaultValue: "",
			isPublic: false,
			channel: "testChannel",
			profiles: { secure: "smtp.secure.test", normal: "" },
		};

		beforeEach(() => {
			RUNTIME_CONFIG_DEFINITIONS.push(
				channelItemDef,
				channelSwitchDef,
				channelProfileItemDef
			);
		});

		afterEach(() => {
			RUNTIME_CONFIG_DEFINITIONS.pop();
			RUNTIME_CONFIG_DEFINITIONS.pop();
			RUNTIME_CONFIG_DEFINITIONS.pop();
		});

		/** 通道配置项行集：两项均已配置（updatedBy 非空，遮蔽 env/默认层） */
		const mockChannelRowsConfigured = () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "testChannelHost",
					value: JSON.stringify("smtp.test"),
					type: "string",
					updatedBy: "op-1",
				},
				{
					key: "testChannelProfileHost",
					value: JSON.stringify("smtp.old.test"),
					type: "string",
					updatedBy: "op-1",
				},
			]);
		};

		const mockVerified = (
			verdict: "PROBE" | "END_TO_END" | "SIMULATED" = "PROBE"
		) => {
			mockPrisma.channelVerification.findUnique.mockResolvedValue({
				id: "cv-1",
				channel: "testChannel",
				verifiedAt: new Date("2026-10-22T08:00:00Z"),
				testedBy: "op-1",
				testedByIp: "127.0.0.1",
				verdict,
				createdAt: new Date("2026-10-22T08:00:00Z"),
			});
		};

		// ==================== getChannelStatus ====================
		it("getChannelStatus：必填项生效值为空 → 不完整，missingKeys 列出缺失键", async () => {
			// findMany 默认空行集 → 两项落到默认值 ''
			const status = await service.getChannelStatus("testChannel");

			expect(status.configComplete).toBe(false);
			expect(status.missingKeys).toEqual(
				expect.arrayContaining([
					"testChannelHost",
					"testChannelProfileHost",
				])
			);
			expect(status.verified).toBe(false);
			expect(status.verdict).toBeNull();
		});

		it("getChannelStatus：配置完整 + 验证记录存在 → verified", async () => {
			mockChannelRowsConfigured();
			mockVerified();

			const status = await service.getChannelStatus("testChannel");

			expect(status.configComplete).toBe(true);
			expect(status.missingKeys).toEqual([]);
			expect(status.verified).toBe(true);
			expect(status.verdict).toBe("probe");
			expect(status.testedBy).toBe("op-1");
		});

		it("getChannelStatus：未登记配置项的通道 → 抛错", async () => {
			await expect(service.getChannelStatus("noSuchChannel")).rejects.toThrow(
				BadRequestException
			);
		});

		// ==================== 开启门禁 ====================
		it("配置不完整且未验证时开启通道开关 → 拒绝，不写库", async () => {
			await expect(service.set("testChannelEnabled", true, "op-1")).rejects.toThrow(
				BadRequestException
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("配置完整但未通过测试 → 拒绝（通道没验证过，开关就开不了）", async () => {
			mockChannelRowsConfigured();
			// channelVerification.findUnique 默认 null → 未验证

			await expect(service.set("testChannelEnabled", true, "op-1")).rejects.toThrow(
				BadRequestException
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("配置完整 + 测试通过 → 允许开启", async () => {
			mockChannelRowsConfigured();
			mockVerified();
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("testChannelEnabled", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		// 门禁按结论强度判：模拟模式（mock 探测）不算「验证过」，否则「测试通过」
		// 会被当成开启证据，通道开着等于没开（sms/payment 出厂默认即 mock 模式）
		it("最近一次验证为模拟模式 → verified=false，门禁拒绝开启且点出原因", async () => {
			mockChannelRowsConfigured();
			mockVerified("SIMULATED");

			const status = await service.getChannelStatus("testChannel");

			expect(status.verified).toBe(false);
			expect(status.verdict).toBe("simulated");

			await expect(service.set("testChannelEnabled", true, "op-1")).rejects.toThrow(
				"模拟模式"
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("端到端验证（END_TO_END）→ 与探测同样满足门禁", async () => {
			mockChannelRowsConfigured();
			mockVerified("END_TO_END");
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			const status = await service.getChannelStatus("testChannel");

			expect(status.verified).toBe(true);
			expect(status.verdict).toBe("end-to-end");
			await service.set("testChannelEnabled", true, "op-1");
			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		it("关闭通道开关不受测试门禁约束", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("testChannelEnabled", false, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		it("通道配置项（非开关）变更不触发开启门禁", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("testChannelHost", "smtp.new.test", "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		// ==================== 验证失效 ====================
		it("通道配置项变更 → 删除该通道验证记录", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("testChannelHost", "smtp.new.test", "op-1");

			expect(mockPrisma.channelVerification.deleteMany).toHaveBeenCalledWith({
				where: { channel: "testChannel" },
			});
		});

		it("通道配置项重置 → 删除该通道验证记录", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue({
				key: "testChannelHost",
				value: JSON.stringify("smtp.test"),
				type: "string",
				updatedBy: "op-1",
			});

			await service.resetToDefault("testChannelHost", "op-1");

			expect(mockPrisma.channelVerification.deleteMany).toHaveBeenCalledWith({
				where: { channel: "testChannel" },
			});
		});

		it("profile 批量应用改写通道配置项 → 删除该通道验证记录", async () => {
			// 当前值 ≠ secure 目标值 → 会写入；门禁要求已验证 + 完整
			mockChannelRowsConfigured();
			mockVerified();

			const result = await service.applyProfile("secure", "op-1");

			expect(result.applied).toContain("testChannelProfileHost");
			expect(mockPrisma.channelVerification.deleteMany).toHaveBeenCalledWith({
				where: { channel: "testChannel" },
			});
		});

		it("profile 批量应用开启通道开关但通道未验证 → 拒绝（不得经 profile 绕过门禁）", async () => {
			// findMany 默认空行集 → 配置不完整 + 未验证
			await expect(service.applyProfile("secure", "op-1")).rejects.toThrow(
				BadRequestException
			);
			expect(mockPrisma.$transaction).not.toHaveBeenCalled();
		});

		// ==================== 不变式 ====================
		it("不变式：通道开关必须是布尔键（门禁只对布尔开关有意义）", () => {
			const switchDefs = RUNTIME_CONFIG_DEFINITIONS.filter(
				(d) => d.channelSwitch
			);
			expect(
				switchDefs.filter((d) => d.type !== "boolean").map((d) => d.key)
			).toEqual([]);
		});

		it("不变式：通道开关对应的通道必须登记了配置项（否则完整性判定空转）", () => {
			const switchChannels = [
				...new Set(
					RUNTIME_CONFIG_DEFINITIONS.filter((d) => d.channelSwitch).map(
						(d) => d.channelSwitch as string
					)
				),
			];
			for (const channel of switchChannels) {
				// 开关对应的通道没有配置项 → 完整性判定空转，门禁形同虚设
				expect(
					RUNTIME_CONFIG_DEFINITIONS.some((d) => d.channel === channel)
				).toBe(true);
			}
		});
	});

	describe("邮件通道（ADR-0082 #495）：机制层对真实 SMTP 键生效", () => {
		const SMTP_ENV: Record<string, string> = {
			smtpHost: "MAIL_HOST",
			smtpPort: "MAIL_PORT",
			smtpSecure: "MAIL_SECURE",
			smtpUser: "MAIL_USER",
			smtpPassword: "MAIL_PASS",
			smtpFrom: "MAIL_FROM",
		};

		/** 六个 SMTP 键均在 runtime 层配置（updatedBy 非空，遮蔽 env/默认层） */
		const smtpRowsConfigured = () => [
			{
				key: "smtpHost",
				value: JSON.stringify("smtp.test.com"),
				type: "string",
				updatedBy: "op-1",
			},
			{
				key: "smtpPort",
				value: JSON.stringify(465),
				type: "number",
				updatedBy: "op-1",
			},
			{
				key: "smtpSecure",
				value: JSON.stringify(true),
				type: "boolean",
				updatedBy: "op-1",
			},
			{
				key: "smtpUser",
				value: JSON.stringify("user@test"),
				type: "string",
				updatedBy: "op-1",
			},
			{
				key: "smtpPassword",
				value: JSON.stringify(channelCrypto.encrypt("smtp-pass")),
				type: "string",
				updatedBy: "op-1",
			},
			{
				key: "smtpFrom",
				value: JSON.stringify("CloudCAD <noreply@test.com>"),
				type: "string",
				updatedBy: "op-1",
			},
		];

		const mockSmtpRowsConfigured = () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue(smtpRowsConfigured());
		};

		const mockMailVerified = () => {
			mockPrisma.channelVerification.findUnique.mockResolvedValue({
				id: "cv-mail",
				channel: "mail",
				verifiedAt: new Date("2026-10-22T08:00:00Z"),
				testedBy: "op-1",
				testedByIp: "127.0.0.1",
				verdict: "PROBE",
				createdAt: new Date("2026-10-22T08:00:00Z"),
			});
		};

		it("不变式：SMTP 六键登记在通道 mail 下、envKey 指向既有 MAIL_* 变量、全部非公开", () => {
			for (const [key, envKey] of Object.entries(SMTP_ENV)) {
				const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key);
				// jest expect 只收 1 参；缺失键会让下面的断言直接抛错并带上 key
				expect(def).toBeDefined();
				expect(def!.channel).toBe("mail");
				expect(def!.envKey).toBe(envKey);
				expect(def!.isPublic).toBe(false);
			}
			const switchDef = RUNTIME_CONFIG_DEFINITIONS.find(
				(d) => d.key === "mailEnabled"
			)!;
			expect(switchDef.channelSwitch).toBe("mail");
			expect(switchDef.type).toBe("boolean");
			// SMTP 密码是秘密键：加密落库 + 掩码回读（#493 不变式）
			expect(
				RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "smtpPassword")!
					.input?.secret
			).toBe(true);
		});

		it("不变式：#492 声明的依赖边对邮件通道生效（强制邮箱验证/告警邮件 → 邮件服务开关）", () => {
			for (const key of ["requireEmailVerification", "alertEmailEnabled"]) {
				const def = RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key)!;
				expect(def.requires).toContain("mailEnabled");
			}
		});

		it("getChannelStatus('mail')：六键 runtime 层配置齐 → 配置完整", async () => {
			mockSmtpRowsConfigured();

			const status = await service.getChannelStatus("mail");

			expect(status.configComplete).toBe(true);
			expect(status.missingKeys).toEqual([]);
			expect(status.verified).toBe(false);
		});

		it("getChannelStatus('mail')：主机被显式清空 → 不完整，missingKeys 指向 smtpHost", async () => {
			mockSmtpRowsConfigured();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "smtpHost",
					value: '""',
					type: "string",
					updatedBy: "op-1",
				},
				{
					key: "smtpFrom",
					value: JSON.stringify("CloudCAD <noreply@test.com>"),
					type: "string",
					updatedBy: "op-1",
				},
			]);

			const status = await service.getChannelStatus("mail");

			expect(status.configComplete).toBe(false);
			expect(status.missingKeys).toEqual(["smtpHost"]);
		});

		it("配置完整但未通过测试 → 邮件服务开关无法开启（硬阻断，不写库）", async () => {
			mockSmtpRowsConfigured();
			// channelVerification.findUnique 默认 null → 未验证
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(service.set("mailEnabled", true, "op-1")).rejects.toThrow(
				BadRequestException
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("配置完整 + 测试通过 → 允许开启邮件服务开关", async () => {
			mockSmtpRowsConfigured();
			mockMailVerified();
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("mailEnabled", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		it("配置不完整（主机为空）→ 拒绝开启，原因点出缺失键", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "smtpHost",
					value: '""',
					type: "string",
					updatedBy: "op-1",
				},
			]);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(service.set("mailEnabled", true, "op-1")).rejects.toThrow(
				/smtpHost/
			);
		});

		it("改任一 SMTP 配置项 → 删除 mail 通道验证记录（测试通过状态失效）", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("smtpHost", "smtp.new.com", "op-1");

			expect(mockPrisma.channelVerification.deleteMany).toHaveBeenCalledWith({
				where: { channel: "mail" },
			});
		});

		it("依赖边生效：邮件服务开关未开时，强制邮箱验证被拒绝（依赖门禁先于通道门禁）", async () => {
			// mailEnabled 无 runtime 行、无 envKey → 生效值 = 默认 false
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(
				service.set("requireEmailVerification", true, "op-1")
			).rejects.toThrow(BadRequestException);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("邮件服务开关已开（通道已验证）时，强制邮箱验证允许开启", async () => {
			// 依赖门禁与通道门禁都经 findMany 读生效值：行集须同时含
			// mailEnabled（依赖门禁）与六个 SMTP 键（通道完整性）
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				...smtpRowsConfigured(),
				{
					key: "mailEnabled",
					value: "true",
					type: "boolean",
					updatedBy: "op-1",
				},
			]);
			mockMailVerified();
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("requireEmailVerification", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});
	});

	describe("短信通道（ADR-0082 #502）：机制层对真实短信键生效", () => {
		const SMS_ENV: Record<string, string> = {
			smsProvider: "SMS_PROVIDER",
			aliyunSmsAccessKeyId: "ALIYUN_ACCESS_KEY_ID",
			aliyunSmsAccessKeySecret: "ALIYUN_ACCESS_KEY_SECRET",
			aliyunSmsSignName: "ALIYUN_SMS_SIGN_NAME",
			aliyunSmsTemplateCode: "ALIYUN_SMS_TEMPLATE_CODE",
			aliyunSmsRegionId: "ALIYUN_SMS_REGION_ID",
			tencentSmsSecretId: "TENCENT_SECRET_ID",
			tencentSmsSecretKey: "TENCENT_SECRET_KEY",
			tencentSmsAppId: "TENCENT_SMS_APP_ID",
			tencentSmsSignName: "TENCENT_SMS_SIGN_NAME",
			tencentSmsTemplateCode: "TENCENT_SMS_TEMPLATE_CODE",
			tencentSmsRegion: "TENCENT_SMS_REGION",
		};

		const mockSmsVerified = () => {
			mockPrisma.channelVerification.findUnique.mockResolvedValue({
				id: "cv-sms",
				channel: "sms",
				verifiedAt: new Date("2026-10-22T08:00:00Z"),
				testedBy: "op-1",
				testedByIp: "127.0.0.1",
				verdict: "PROBE",
				createdAt: new Date("2026-10-22T08:00:00Z"),
			});
		};

		it("不变式：12 键登记在通道 sms 下、envKey 指向既有环境变量、全部非公开", () => {
			for (const [key, envKey] of Object.entries(SMS_ENV)) {
				const def = RUNTIME_CONFIG_DEFINITIONS.find(
					(d) => d.key === key
				);
				expect(def).toBeDefined();
				expect(def!.channel).toBe("sms");
				expect(def!.envKey).toBe(envKey);
				expect(def!.isPublic).toBe(false);
			}
			const switchDef = RUNTIME_CONFIG_DEFINITIONS.find(
				(d) => d.key === "smsEnabled"
			)!;
			expect(switchDef.channelSwitch).toBe("sms");
			expect(switchDef.type).toBe("boolean");
			// 凭据是秘密键：加密落库 + 掩码回读（#493 不变式）
			for (const key of [
				"aliyunSmsAccessKeyId",
				"aliyunSmsAccessKeySecret",
				"tencentSmsSecretId",
				"tencentSmsSecretKey",
			]) {
				expect(
					RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key)!.input
						?.secret
				).toBe(true);
			}
			// 条件完整性（#502 设计决策）：凭据键全部 allowNull——静态完整性
			// 只要求 smsProvider 非空，按 provider 的凭据校验交给测试动作
			for (const key of Object.keys(SMS_ENV)) {
				if (key === "smsProvider" || key === "aliyunSmsRegionId" || key === "tencentSmsRegion") {
					continue;
				}
				expect(
					RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key)!.input
						?.allowNull
				).toBe(true);
			}
		});

		it("不变式：#492 声明的依赖边对短信通道生效（强制手机号验证 → 短信服务开关）", () => {
			const def = RUNTIME_CONFIG_DEFINITIONS.find(
				(d) => d.key === "requirePhoneVerification"
			)!;
			expect(def.requires).toContain("smsEnabled");
		});

		it("getChannelStatus('sms')：零行也配置完整（smsProvider 有默认值 mock，凭据键 allowNull）", async () => {
			const status = await service.getChannelStatus("sms");

			expect(status.configComplete).toBe(true);
			expect(status.missingKeys).toEqual([]);
			expect(status.verified).toBe(false);
		});

		it("配置完整但未通过测试 → 短信服务开关无法开启（硬阻断，不写库）", async () => {
			// channelVerification.findUnique 默认 null → 未验证
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(service.set("smsEnabled", true, "op-1")).rejects.toThrow(
				BadRequestException
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("配置完整 + 测试通过 → 允许开启短信服务开关", async () => {
			mockSmsVerified();
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("smsEnabled", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		it("改任一短信配置项 → 删除 sms 通道验证记录（测试通过状态失效）", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("aliyunSmsAccessKeyId", "LTAI-new", "op-1");

			expect(mockPrisma.channelVerification.deleteMany).toHaveBeenCalledWith({
				where: { channel: "sms" },
			});
		});

		it("依赖边生效：短信服务开关未开时，强制手机号验证被拒绝", async () => {
			// smsEnabled 无 runtime 行、无 envKey → 生效值 = 默认 false
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(
				service.set("requirePhoneVerification", true, "op-1")
			).rejects.toThrow(BadRequestException);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("短信服务开关已开时，强制手机号验证允许开启", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "smsEnabled",
					value: "true",
					type: "boolean",
					updatedBy: "op-1",
				},
			]);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("requirePhoneVerification", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});
	});

	describe("微信通道（ADR-0082 #503）：机制层对真实微信键生效", () => {
		const WECHAT_ENV: Record<string, string> = {
			wechatAppId: "WECHAT_APP_ID",
			wechatAppSecret: "WECHAT_APP_SECRET",
		};

		const mockWechatVerified = () => {
			mockPrisma.channelVerification.findUnique.mockResolvedValue({
				id: "cv-wechat",
				channel: "wechat",
				verifiedAt: new Date("2026-10-22T08:00:00Z"),
				testedBy: "op-1",
				testedByIp: "127.0.0.1",
				verdict: "PROBE",
				createdAt: new Date("2026-10-22T08:00:00Z"),
			});
		};

		it("不变式：2 键登记在通道 wechat 下、envKey 指向既有环境变量、全部非公开", () => {
			for (const [key, envKey] of Object.entries(WECHAT_ENV)) {
				const def = RUNTIME_CONFIG_DEFINITIONS.find(
					(d) => d.key === key
				);
				expect(def).toBeDefined();
				expect(def!.channel).toBe("wechat");
				expect(def!.envKey).toBe(envKey);
				expect(def!.isPublic).toBe(false);
				// 凭据键 allowNull：静态完整性恒满足，凭据校验交给测试动作
				expect(def!.input?.allowNull).toBe(true);
			}
			const switchDef = RUNTIME_CONFIG_DEFINITIONS.find(
				(d) => d.key === "wechatEnabled"
			)!;
			expect(switchDef.channelSwitch).toBe("wechat");
			expect(switchDef.type).toBe("boolean");
			// AppSecret 是秘密键：加密落库 + 掩码回读（#493 不变式）
			expect(
				RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "wechatAppSecret")!
					.input?.secret
			).toBe(true);
		});

		it("不变式：#492 声明的依赖边对微信通道生效（微信自动注册 → 微信登录开关）", () => {
			const def = RUNTIME_CONFIG_DEFINITIONS.find(
				(d) => d.key === "wechatAutoRegister"
			)!;
			expect(def.requires).toContain("wechatEnabled");
		});

		it("getChannelStatus('wechat')：零行也配置完整（凭据键 allowNull）", async () => {
			const status = await service.getChannelStatus("wechat");

			expect(status.configComplete).toBe(true);
			expect(status.missingKeys).toEqual([]);
			expect(status.verified).toBe(false);
		});

		it("配置完整但未通过测试 → 微信登录开关无法开启（硬阻断，不写库）", async () => {
			// channelVerification.findUnique 默认 null → 未验证
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(service.set("wechatEnabled", true, "op-1")).rejects.toThrow(
				BadRequestException
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("配置完整 + 测试通过 → 允许开启微信登录开关", async () => {
			mockWechatVerified();
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("wechatEnabled", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		it("改任一微信配置项 → 删除 wechat 通道验证记录（测试通过状态失效）", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("wechatAppId", "wx_new", "op-1");

			expect(mockPrisma.channelVerification.deleteMany).toHaveBeenCalledWith({
				where: { channel: "wechat" },
			});
		});

		it("依赖边生效：微信登录开关未开时，微信自动注册被拒绝", async () => {
			// wechatEnabled 无 runtime 行、无 envKey → 生效值 = 默认 false
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(
				service.set("wechatAutoRegister", true, "op-1")
			).rejects.toThrow(BadRequestException);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("微信登录开关已开时，微信自动注册允许开启", async () => {
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "wechatEnabled",
					value: "true",
					type: "boolean",
					updatedBy: "op-1",
				},
			]);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("wechatAutoRegister", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});
	});

	describe("支付通道（ADR-0082 #505）：机制层对真实支付键生效", () => {
		const PAYMENT_ENV: Record<string, string> = {
			paymentProvider: "PAYMENT_PROVIDER",
			wechatPayAppId: "WECHATPAY_APPID",
			wechatPayMchId: "WECHATPAY_MCHID",
			wechatPayKey: "WECHATPAY_KEY",
			wechatPayNotifyUrl: "WECHATPAY_NOTIFY_URL",
		};

		const mockPaymentVerified = () => {
			mockPrisma.channelVerification.findUnique.mockResolvedValue({
				id: "cv-payment",
				channel: "payment",
				verifiedAt: new Date("2026-10-22T08:00:00Z"),
				testedBy: "op-1",
				testedByIp: "127.0.0.1",
				verdict: "PROBE",
				createdAt: new Date("2026-10-22T08:00:00Z"),
			});
		};

		it("不变式：5 键登记在通道 payment 下、envKey 指向既有环境变量、全部非公开", () => {
			for (const [key, envKey] of Object.entries(PAYMENT_ENV)) {
				const def = RUNTIME_CONFIG_DEFINITIONS.find(
					(d) => d.key === key
				);
				expect(def).toBeDefined();
				expect(def!.channel).toBe("payment");
				expect(def!.envKey).toBe(envKey);
				expect(def!.isPublic).toBe(false);
			}
			const switchDef = RUNTIME_CONFIG_DEFINITIONS.find(
				(d) => d.key === "paymentEnabled"
			)!;
			expect(switchDef.channelSwitch).toBe("payment");
			expect(switchDef.type).toBe("boolean");
			// AppID 是完整性锚点（非 allowNull）；其余凭据键 allowNull，
			// 完整凭据校验交给测试动作（与短信通道「测试通过才是真闸门」同语义）
			expect(
				RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "wechatPayAppId")!
					.input?.allowNull
			).toBeFalsy();
			for (const key of ["wechatPayMchId", "wechatPayKey", "wechatPayNotifyUrl"]) {
				expect(
					RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === key)!.input
						?.allowNull
				).toBe(true);
			}
			// API 密钥是秘密键：加密落库 + 掩码回读（#493 不变式）
			expect(
				RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "wechatPayKey")!
					.input?.secret
			).toBe(true);
		});

		it("getChannelStatus('payment')：AppID 未配置 → 不完整并报缺失键", async () => {
			const status = await service.getChannelStatus("payment");

			expect(status.configComplete).toBe(false);
			expect(status.missingKeys).toEqual(["wechatPayAppId"]);
			expect(status.verified).toBe(false);
		});

		it("配置不完整 → 支付开关无法开启（硬阻断，不写库）", async () => {
			// channelVerification.findUnique 默认 null → 未验证；AppID 零行 → 不完整
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(service.set("paymentEnabled", true, "op-1")).rejects.toThrow(
				BadRequestException
			);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("配置完整 + 测试通过 → 允许开启支付开关", async () => {
			mockPaymentVerified();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "wechatPayAppId",
					value: "wx_test",
					type: "string",
					updatedBy: "op-1",
				},
			]);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("paymentEnabled", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		it("改任一支付配置项 → 删除 payment 通道验证记录（测试通过状态失效）", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("wechatPayKey", "new_key", "op-1");

			expect(mockPrisma.channelVerification.deleteMany).toHaveBeenCalledWith({
				where: { channel: "payment" },
			});
		});
	});

	describe("Webhook 通道（ADR-0082 #506）：机制层对真实 Webhook 键生效", () => {
		const WEBHOOK_ENV: Record<string, string> = {
			alertWebhookEnabled: "ALERT_WEBHOOK_ENABLED",
			alertWebhookUrl: "ALERT_WEBHOOK_URL",
			alertWebhookTemplate: "ALERT_WEBHOOK_TEMPLATE",
		};

		const mockWebhookVerified = () => {
			mockPrisma.channelVerification.findUnique.mockResolvedValue({
				id: "cv-webhook",
				channel: "webhook",
				verifiedAt: new Date("2026-10-22T08:00:00Z"),
				testedBy: "op-1",
				testedByIp: "127.0.0.1",
				verdict: "PROBE",
				createdAt: new Date("2026-10-22T08:00:00Z"),
			});
		};

		it("不变式：3 键登记在通道 webhook 下、envKey 指向既有环境变量、全部非公开", () => {
			for (const [key, envKey] of Object.entries(WEBHOOK_ENV)) {
				const def = RUNTIME_CONFIG_DEFINITIONS.find(
					(d) => d.key === key
				);
				expect(def).toBeDefined();
				// 开关键走 channelSwitch 标记，配置键走 channel 标记
				expect(
					key === "alertWebhookEnabled" ? def!.channelSwitch : def!.channel
				).toBe("webhook");
				expect(def!.envKey).toBe(envKey);
				expect(def!.isPublic).toBe(false);
			}
			const switchDef = RUNTIME_CONFIG_DEFINITIONS.find(
				(d) => d.key === "alertWebhookEnabled"
			)!;
			expect(switchDef.channelSwitch).toBe("webhook");
			expect(switchDef.type).toBe("boolean");
			// URL 是完整性锚点（非 allowNull）；模板有默认值（allowNull）
			expect(
				RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "alertWebhookUrl")!
					.input?.allowNull
			).toBeFalsy();
			expect(
				RUNTIME_CONFIG_DEFINITIONS.find((d) => d.key === "alertWebhookTemplate")!
					.input?.allowNull
			).toBe(true);
		});

		it("不变式：Webhook 通道无 requires 依赖边（独立通道，不依赖邮件通道）", () => {
			const def = RUNTIME_CONFIG_DEFINITIONS.find(
				(d) => d.key === "alertWebhookEnabled"
			)!;
			expect(def.requires ?? []).toEqual([]);
		});

		it("getChannelStatus('webhook')：URL 未配置 → 不完整并报缺失键", async () => {
			const status = await service.getChannelStatus("webhook");

			expect(status.configComplete).toBe(false);
			expect(status.missingKeys).toEqual(["alertWebhookUrl"]);
			expect(status.verified).toBe(false);
		});

		it("配置不完整 → Webhook 开关无法开启（硬阻断，不写库）", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await expect(
				service.set("alertWebhookEnabled", true, "op-1")
			).rejects.toThrow(BadRequestException);
			expect(mockPrisma.runtimeConfig.upsert).not.toHaveBeenCalled();
		});

		it("配置完整 + 测试通过 → 允许开启 Webhook 开关", async () => {
			mockWebhookVerified();
			mockPrisma.runtimeConfig.findMany.mockResolvedValue([
				{
					key: "alertWebhookUrl",
					value: "https://example.com/hook",
					type: "string",
					updatedBy: "op-1",
				},
			]);
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("alertWebhookEnabled", true, "op-1");

			expect(mockPrisma.runtimeConfig.upsert).toHaveBeenCalledTimes(1);
		});

		it("改任一 Webhook 配置项 → 删除 webhook 通道验证记录（测试通过状态失效）", async () => {
			mockPrisma.runtimeConfig.findUnique.mockResolvedValue(null);

			await service.set("alertWebhookUrl", "https://new.example.com/hook", "op-1");

			expect(mockPrisma.channelVerification.deleteMany).toHaveBeenCalledWith({
				where: { channel: "webhook" },
			});
		});
	});

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
