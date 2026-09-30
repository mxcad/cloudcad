///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig, DatabaseConfig } from "../config/app.config";
import { DatabaseService } from "./database.service";

describe("DatabaseService", () => {
	const dbConfig: DatabaseConfig = {
		host: "127.0.0.1",
		port: 15432,
		username: "cloudcad",
		password: "secret",
		database: "cloudcad_wrong_db",
		ssl: false,
		maxConnections: 10,
		connectionTimeoutMillis: 3000,
		idleTimeoutMillis: 10000,
	};

	describe("onModuleInit 连接失败提示", () => {
		// 回归：P1017 只说「连不上」，不指出试图连的是哪个库。库名配错时
		// postgres 会先接受 TCP 连接再立即断开（库不存在），报的就是这类模糊错误，
		// 提示里必须带 host:port/database 才能区分「库名错」与「网络不通」。
		// mock 必须在测试体内创建：jest resetMocks 会在每个测试前清掉 mock 实现。
		const buildService = (queryError: Error) => {
			const configService = {
				get: jest.fn((key: string) =>
					key === "database" ? dbConfig : undefined,
				),
			};
			const service = new DatabaseService(
				configService as unknown as ConfigService<AppConfig>,
			);
			// 不真正查询：只验证错误提示内容
			(service as any).$queryRaw = jest.fn().mockRejectedValue(queryError);
			return service;
		};

		// fake timers：查询已立即 reject，onModuleInit 内的超时定时器不该触发，
		// 不切 fake timer 会留一个 3s 的 open handle
		const runInit = async (service: DatabaseService): Promise<never> => {
			jest.useFakeTimers();
			try {
				await service.onModuleInit();
			} finally {
				jest.useRealTimers();
			}
			throw new Error("onModuleInit 应当抛错");
		};

		it("网络不通 → 失败日志带 host:port/database", async () => {
			const errorSpy = jest.spyOn(Logger.prototype, "error");
			const service = buildService(
				new Error(
					"P1017: Can't reach database server at `127.0.0.1`, port 15432",
				),
			);

			await expect(runInit(service)).rejects.toThrow(
				"Can't reach database server",
			);
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining("127.0.0.1:15432/cloudcad_wrong_db"),
				expect.anything(),
			);
		});

		it("库名配错 → 连接目标与原始错误都出现在失败日志", async () => {
			const errorSpy = jest.spyOn(Logger.prototype, "error");
			const service = buildService(
				new Error(
					"Database `probe_nodb_20260930` does not exist on the database server",
				),
			);

			await expect(runInit(service)).rejects.toThrow("does not exist");
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining("127.0.0.1:15432/cloudcad_wrong_db"),
				expect.objectContaining({
					message: expect.stringContaining("probe_nodb_20260930"),
				}),
			);
		});
	});
});
