///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { RuntimeConfigService } from "./runtime-config.service";
import {
	ChannelTestService,
	CHANNEL_TEST_ACTIONS,
} from "./channel-test.service";
import {
	registerAuditLoggerInstance,
	type AuditLogger,
} from "../audit/audit-logger.service";
import type {
	ChannelStatus,
	ChannelTestAction,
	ChannelTestContext,
} from "./runtime-config.types";

describe("ChannelTestService", () => {
	let service: ChannelTestService;

	const auditMock = { audit: jest.fn() };

	const mockPrisma = {
		channelVerification: {
			upsert: jest.fn(),
		},
	};

	const mockRuntimeConfig = {
		getChannelStatus: jest.fn(),
		getValue: jest.fn(),
	};

		const completeStatus: ChannelStatus = {
			channel: "testChannel",
			configComplete: true,
			missingKeys: [],
			verified: false,
			verdict: null,
			verifiedAt: null,
			testedBy: null,
		};

		const incompleteStatus: ChannelStatus = {
			channel: "testChannel",
			configComplete: false,
			missingKeys: ["testChannelHost", "testChannelPassword"],
			verified: false,
			verdict: null,
			verifiedAt: null,
			testedBy: null,
		};

	const action: ChannelTestAction = {
		channel: "testChannel",
		test: jest.fn(),
	};
	const otherAction: ChannelTestAction = {
		channel: "otherChannel",
		test: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockPrisma.channelVerification.upsert.mockResolvedValue(undefined);
		auditMock.audit.mockResolvedValue(undefined);
		// 审计走 AuditLogModule 注册的全局单例：测试里注册 mock 单例
		registerAuditLoggerInstance(auditMock as unknown as AuditLogger);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ChannelTestService,
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfig },
				{ provide: DatabaseService, useValue: mockPrisma },
				// 生产环境经 useFactory 聚合各通道动作（NestJS 11 已移除 multi
				// 注入）；单测直接给聚合后的数组，服务侧语义一致
				{ provide: CHANNEL_TEST_ACTIONS, useValue: [action, otherAction] },
			],
		}).compile();

		service = module.get<ChannelTestService>(ChannelTestService);
	});

	afterEach(() => {
		registerAuditLoggerInstance(null);
	});

	// ==================== 注册表 ====================
	describe("注册表", () => {
		it("getChannels 返回全部已注册通道（多注入聚合）", () => {
			expect(service.getChannels()).toEqual([
				"testChannel",
				"otherChannel",
			]);
		});

		it("getChannelsStatus 逐通道查状态", async () => {
			mockRuntimeConfig.getChannelStatus.mockResolvedValue(completeStatus);

			const statuses = await service.getChannelsStatus();

			expect(mockRuntimeConfig.getChannelStatus).toHaveBeenCalledWith(
				"testChannel"
			);
			expect(mockRuntimeConfig.getChannelStatus).toHaveBeenCalledWith(
				"otherChannel"
			);
			expect(statuses).toHaveLength(2);
		});
	});

	// ==================== testChannel ====================
	describe("testChannel", () => {
		it("测试成功 → 写验证记录 + 入审计（success=true）", async () => {
			mockRuntimeConfig.getChannelStatus.mockResolvedValue(completeStatus);
			(action.test as jest.Mock).mockResolvedValue({
				ok: true,
				message: "测试邮件已发送",
			});

			const result = await service.testChannel(
				"testChannel",
				undefined,
				"op-1",
				"127.0.0.1"
			);

			expect(result).toEqual({
				channel: "testChannel",
				ok: true,
				message: "测试邮件已发送",
			});
			expect(mockPrisma.channelVerification.upsert).toHaveBeenCalledWith({
				where: { channel: "testChannel" },
				update: {
					verifiedAt: expect.any(Date),
					testedBy: "op-1",
					testedByIp: "127.0.0.1",
					verdict: "PROBE",
				},
				create: {
					channel: "testChannel",
					testedBy: "op-1",
					testedByIp: "127.0.0.1",
					verdict: "PROBE",
				},
			});
			expect(auditMock.audit).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					resourceName: "testChannel",
					userId: "op-1",
				})
			);
		});

		// 结论强度如实落库：动作声明什么就存什么，机制层不推断、不静默降格
		it.each([
			["end-to-end", "END_TO_END"],
			["simulated", "SIMULATED"],
		])("动作声明 verdict=%s → 以 %s 落库", async (verdict, column) => {
			mockRuntimeConfig.getChannelStatus.mockResolvedValue(completeStatus);
			(action.test as jest.Mock).mockResolvedValue({
				ok: true,
				message: "ok",
				verdict,
			});

			await service.testChannel("testChannel", undefined, "op-1");

			expect(mockPrisma.channelVerification.upsert).toHaveBeenCalledWith({
				where: { channel: "testChannel" },
				update: expect.objectContaining({ verdict: column }),
				create: expect.objectContaining({ verdict: column }),
			});
		});

		it("测试失败 → 不写验证记录，仍入审计（success=false）", async () => {
			mockRuntimeConfig.getChannelStatus.mockResolvedValue(completeStatus);
			(action.test as jest.Mock).mockResolvedValue({
				ok: false,
				message: "SMTP 连接被拒绝",
			});

			const result = await service.testChannel("testChannel", undefined, "op-1");

			expect(result.ok).toBe(false);
			expect(mockPrisma.channelVerification.upsert).not.toHaveBeenCalled();
			expect(auditMock.audit).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					errorMessage: "SMTP 连接被拒绝",
				})
			);
		});

		it("测试动作抛异常 → 归一为失败结果，端点不 500", async () => {
			mockRuntimeConfig.getChannelStatus.mockResolvedValue(completeStatus);
			(action.test as jest.Mock).mockRejectedValue(new Error("network down"));

			const result = await service.testChannel("testChannel", undefined, "op-1");

			expect(result.ok).toBe(false);
			expect(result.message).toContain("network down");
			expect(mockPrisma.channelVerification.upsert).not.toHaveBeenCalled();
			expect(auditMock.audit).toHaveBeenCalledWith(
				expect.objectContaining({ success: false })
			);
		});

		it("配置不完整 → 失败并带缺失键原因，不执行测试动作、无验证记录", async () => {
			mockRuntimeConfig.getChannelStatus.mockResolvedValue(incompleteStatus);

			const result = await service.testChannel("testChannel", undefined, "op-1");

			expect(result.ok).toBe(false);
			expect(result.message).toContain("testChannelHost");
			expect(result.message).toContain("testChannelPassword");
			expect(result.problemKeys).toEqual([
				"testChannelHost",
				"testChannelPassword",
			]);
			expect(action.test).not.toHaveBeenCalled();
			expect(mockPrisma.channelVerification.upsert).not.toHaveBeenCalled();
			expect(auditMock.audit).toHaveBeenCalledWith(
				expect.objectContaining({ success: false })
			);
		});

		it("未注册测试动作的通道 → 抛错", async () => {
			await expect(
				service.testChannel("noSuchChannel", undefined, "op-1")
			).rejects.toThrow(BadRequestException);
			expect(auditMock.audit).not.toHaveBeenCalled();
		});

		it("recipient 与 getValue 经上下文传给测试动作", async () => {
			mockRuntimeConfig.getChannelStatus.mockResolvedValue(completeStatus);
			(action.test as jest.Mock).mockImplementation(
				async (ctx: ChannelTestContext) => {
					await ctx.getValue("testChannelHost");
					return { ok: true, message: "ok" };
				}
			);
			mockRuntimeConfig.getValue.mockResolvedValue("smtp.test");

			await service.testChannel("testChannel", "admin@example.com", "op-1");

			expect(action.test).toHaveBeenCalledWith(
				expect.objectContaining({ recipient: "admin@example.com" })
			);
			expect(mockRuntimeConfig.getValue).toHaveBeenCalledWith(
				"testChannelHost"
			);
		});
	});
});
