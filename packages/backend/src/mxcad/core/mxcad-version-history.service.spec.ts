import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { VERSION_CONTROL_TOKEN } from "../../version-control/interfaces/version-control.interface";
import { FileConversionService } from "../conversion/file-conversion.service";
import { MxcadVersionHistoryService } from "./mxcad-version-history.service";
import { RestrictionEngine } from "../../vip/restriction-engine.service";
import { QuotaExceededException } from "../../vip/errors/quota-exceeded.error";

// fs 模块按需 mock：existsSync 默认 false（认为 _v<rev>.mxweb 缓存不存在），
// readFile 返回固定 buffer（读转换输出）；mkdir/writeFile/rm 只记录调用，
// 避免转换链路真的写 /fake/temp 污染文件系统
jest.mock("fs", () => ({
	...jest.requireActual("fs"),
	existsSync: jest.fn(() => false),
}));
jest.mock("fs/promises", () => ({
	...jest.requireActual("fs/promises"),
	readFile: jest.fn(async () => Buffer.from("mxweb-content")),
	mkdir: jest.fn(async () => undefined),
	writeFile: jest.fn(async () => undefined),
	rm: jest.fn(async () => undefined),
}));

describe("MxcadVersionHistoryService", () => {
	let service: MxcadVersionHistoryService;

	const mockConfigService = {
		get: jest.fn((key: string) => {
			if (key === "filesDataPath") return "/fake/filesData";
			if (key === "mxcadTempPath") return "/fake/temp";
			if (key === "mxcadUploadPath") return "/fake/uploads";
			return undefined;
		}),
	};

	const mockVersionControlService = {
		listDirectoryAtRevision: jest.fn(),
		getFileContentAtRevision: jest.fn(),
	};

	const mockFileConversionService = {
		convertBinToMxweb: jest.fn(),
		convertFile: jest.fn(),
	};

	const mockRestrictionEngine = {
		reserveHistoryCountOrThrow: jest.fn(),
		releaseHistoryCount: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		// jest 配置 resetMocks 全 true：每个测试前会清掉所有 jest.fn 的实现，
		// 这里重新设置各 mock 的默认实现
		mockConfigService.get.mockImplementation((key: string) => {
			if (key === "filesDataPath") return "/fake/filesData";
			if (key === "mxcadTempPath") return "/fake/temp";
			if (key === "mxcadUploadPath") return "/fake/uploads";
			return undefined;
		});
		const { existsSync } = jest.requireMock("fs") as { existsSync: jest.Mock };
		existsSync.mockImplementation(() => false);
		// fs/promises 的 mock 实现同样会被 resetMocks 清除，需一并重设
		const fsPromisesMock = jest.requireMock("fs/promises") as {
			readFile: jest.Mock;
			mkdir: jest.Mock;
			writeFile: jest.Mock;
			rm: jest.Mock;
		};
		fsPromisesMock.readFile.mockImplementation(async () =>
			Buffer.from("mxweb-content")
		);
		fsPromisesMock.mkdir.mockImplementation(async () => undefined);
		fsPromisesMock.writeFile.mockImplementation(async () => undefined);
		fsPromisesMock.rm.mockImplementation(async () => undefined);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MxcadVersionHistoryService,
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControlService },
				{ provide: FileConversionService, useValue: mockFileConversionService },
				{ provide: RestrictionEngine, useValue: mockRestrictionEngine },
			],
		}).compile();

		service = module.get<MxcadVersionHistoryService>(MxcadVersionHistoryService);
	});

	it("should be defined", () => {
		expect(service).toBeDefined();
	});

	it("should have handleHistoricalVersionRequest method", () => {
		expect(service.handleHistoricalVersionRequest).toBeDefined();
	});

	it("should have cleanupTempFiles method", () => {
		expect(service.cleanupTempFiles).toBeDefined();
	});

	describe("handleHistoricalVersionRequest — 等待者失败兜底与预热(warmup)", () => {
		const makeRes = () => {
			const res: any = {
				setHeader: jest.fn(),
				removeHeader: jest.fn(),
				status: jest.fn().mockReturnThis(),
				json: jest.fn(),
				send: jest.fn(),
				end: jest.fn(),
			};
			return res;
		};
		const mockReq: any = {};
		// 登录用户请求：user.id 用于限频占位
		const mockReqWithUser: any = { user: { id: "user-1" } };

		const mockMxwebSource = () => {
			mockVersionControlService.listDirectoryAtRevision.mockResolvedValue({
				success: true,
				files: ["abc123.bin"],
			});
			mockVersionControlService.getFileContentAtRevision.mockResolvedValue({
				success: true,
				content: Buffer.from("bin-content"),
			});
		};

		it("等待中的转换失败（reject）时：删除失效锁并自行重试，最终成功返回文件", async () => {
			mockMxwebSource();
			mockFileConversionService.convertBinToMxweb
				.mockRejectedValueOnce(new Error("MX 转换进程崩溃"))
				.mockResolvedValueOnce({
					success: true,
					outputPath: "/fake/filesData/202608/node-1/abc123_v3.mxweb",
				});

			const filename = "202608/node-1/abc123.dwg.mxweb";
			const res1 = makeRes();
			const res2 = makeRes();

			// 第一个请求：发起转换（reject）
			const p1 = service.handleHistoricalVersionRequest(
				filename,
				"3",
				res1,
				mockReq,
				false
			);
			// 第二个请求：等待同一转换，应在失败后自行重试
			const p2 = service.handleHistoricalVersionRequest(
				filename,
				"3",
				res2,
				mockReq,
				false
			);

			await Promise.all([p1, p2]);

			// 第一次转换失败 → 500；等待者失败后清锁重试 → 第二次成功 200
			expect(res1.status).toHaveBeenCalledWith(500);
			expect(res2.status).toHaveBeenCalledWith(200);
			expect(res2.send).toHaveBeenCalledWith(Buffer.from("mxweb-content"));
			// 重试意味着重新列目录 + 重新转换（各调用 2 次）
			expect(mockVersionControlService.listDirectoryAtRevision).toHaveBeenCalledTimes(2);
			expect(mockFileConversionService.convertBinToMxweb).toHaveBeenCalledTimes(2);
		});

		it("warmup=1 且缓存已生成：返回 204 且不发送文件内容", async () => {
			const { existsSync } = jest.requireMock("fs") as {
				existsSync: jest.Mock;
			};
			existsSync.mockReturnValueOnce(true); // _v3.mxweb 缓存已存在

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockReq,
				false,
				true
			);

			expect(res.status).toHaveBeenCalledWith(204);
			expect(res.end).toHaveBeenCalled();
			expect(res.send).not.toHaveBeenCalled();
			expect(mockVersionControlService.listDirectoryAtRevision).not.toHaveBeenCalled();
		});

		/** 让 runHistoryConversion 的异步链（占额→拉分片→转换→清理→记录结果）跑完 */
		const flushAsync = async (times = 10) => {
			for (let i = 0; i < times; i++) {
				await new Promise((resolve) => setImmediate(resolve));
			}
		};

		it("warmup=1 且需转换：发起转换后立即返回 202（PROCESSING），不阻塞等转换完成", async () => {
			mockMxwebSource();
			let resolveConvert!: (value: unknown) => void;
			mockFileConversionService.convertBinToMxweb.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveConvert = resolve;
					})
			);

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockReq,
				false,
				true
			);

			// 转换已发起但未完成：本次请求返回 202 供前端轮询，不返回文件内容
			expect(res.status).toHaveBeenCalledWith(202);
			expect(res.json).toHaveBeenCalledWith({ status: "PROCESSING" });
			expect(res.end).not.toHaveBeenCalled();
			expect(res.send).not.toHaveBeenCalled();
			expect(mockVersionControlService.listDirectoryAtRevision).toHaveBeenCalledTimes(1);
			expect(mockFileConversionService.convertBinToMxweb).toHaveBeenCalledTimes(1);

			// 转换完成 → 下一次预热轮询命中缓存返回 204
			resolveConvert({
				success: true,
				outputPath: "/fake/filesData/202608/node-1/abc123_v3.mxweb",
			});
			await flushAsync();
			const { existsSync } = jest.requireMock("fs") as {
				existsSync: jest.Mock;
			};
			existsSync.mockReturnValueOnce(true); // 缓存已生成

			const res2 = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res2,
				mockReq,
				false,
				true
			);

			expect(res2.status).toHaveBeenCalledWith(204);
			expect(res2.end).toHaveBeenCalled();
			expect(res2.send).not.toHaveBeenCalled();
			// 命中缓存不重跑转换
			expect(mockFileConversionService.convertBinToMxweb).toHaveBeenCalledTimes(1);
		});

		it("warmup=1 命中在途转换：返回 202 且复用同一转换（不重复列目录/占额/转换）", async () => {
			mockMxwebSource();
			let resolveConvert!: (value: unknown) => void;
			mockFileConversionService.convertBinToMxweb.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveConvert = resolve;
					})
			);
			mockRestrictionEngine.reserveHistoryCountOrThrow.mockResolvedValue(
				undefined
			);

			const first = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				first,
				mockReqWithUser,
				false,
				true
			);
			expect(first.status).toHaveBeenCalledWith(202);

			const second = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				second,
				mockReqWithUser,
				false,
				true
			);
			expect(second.status).toHaveBeenCalledWith(202);

			// 复用同一转换：三个副作用各只发生一次
			expect(mockVersionControlService.listDirectoryAtRevision).toHaveBeenCalledTimes(1);
			expect(mockFileConversionService.convertBinToMxweb).toHaveBeenCalledTimes(1);
			expect(mockRestrictionEngine.reserveHistoryCountOrThrow).toHaveBeenCalledTimes(1);

			resolveConvert({
				success: true,
				outputPath: "/fake/filesData/202608/node-1/abc123_v3.mxweb",
			});
			await flushAsync();
		});

		it("warmup=1 命中近期转换失败：返回 500 且不重跑转换（防轮询重试风暴）", async () => {
			mockMxwebSource();
			mockFileConversionService.convertBinToMxweb.mockRejectedValue(
				new Error("转换进程崩溃")
			);
			mockRestrictionEngine.reserveHistoryCountOrThrow.mockResolvedValue(
				undefined
			);
			mockRestrictionEngine.releaseHistoryCount.mockResolvedValue(undefined);

			const first = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				first,
				mockReqWithUser,
				false,
				true
			);
			expect(first.status).toHaveBeenCalledWith(202);
			await flushAsync();
			expect(mockFileConversionService.convertBinToMxweb).toHaveBeenCalledTimes(1);

			const second = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				second,
				mockReqWithUser,
				false,
				true
			);

			expect(second.status).toHaveBeenCalledWith(500);
			expect(mockFileConversionService.convertBinToMxweb).toHaveBeenCalledTimes(1);
			expect(mockRestrictionEngine.reserveHistoryCountOrThrow).toHaveBeenCalledTimes(1);
		});

		it("warmup=1 失败记忆过期后允许重试（瞬时失败不永久阻断）", async () => {
			mockMxwebSource();
			mockFileConversionService.convertBinToMxweb
				.mockRejectedValueOnce(new Error("转换服务超时"))
				.mockResolvedValueOnce({
					success: true,
					outputPath: "/fake/filesData/202608/node-1/abc123_v3.mxweb",
				});
			mockRestrictionEngine.reserveHistoryCountOrThrow.mockResolvedValue(
				undefined
			);
			mockRestrictionEngine.releaseHistoryCount.mockResolvedValue(undefined);

			const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
			try {
				const first = makeRes();
				await service.handleHistoricalVersionRequest(
					"202608/node-1/abc123.dwg.mxweb",
					"3",
					first,
					mockReqWithUser,
					false,
					true
				);
				expect(first.status).toHaveBeenCalledWith(202);
				await flushAsync();

				// 记忆窗口内（60s）短路；窗口外允许重试
				nowSpy.mockReturnValue(1_000_000 + 60_001);

				const res2 = makeRes();
				await service.handleHistoricalVersionRequest(
					"202608/node-1/abc123.dwg.mxweb",
					"3",
					res2,
					mockReqWithUser,
					false,
					true
				);

				expect(res2.status).toHaveBeenCalledWith(202);
				expect(mockFileConversionService.convertBinToMxweb).toHaveBeenCalledTimes(2);
			} finally {
				nowSpy.mockRestore();
			}
		});

		it("warmup=1 且无 bin 分片：同步走兜底解析后返回 204", async () => {
			mockVersionControlService.listDirectoryAtRevision.mockResolvedValue({
				success: true,
				files: ["abc123.dwg"], // 无 .bin 分片
			});
			mockVersionControlService.getFileContentAtRevision.mockResolvedValue({
				success: true,
				content: Buffer.from("original-content"),
			});
			mockFileConversionService.convertFile.mockResolvedValue({ isOk: true });

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockReq,
				false,
				true
			);

			expect(res.status).toHaveBeenCalledWith(204);
			expect(res.end).toHaveBeenCalled();
			expect(res.send).not.toHaveBeenCalled();
			expect(mockFileConversionService.convertBinToMxweb).not.toHaveBeenCalled();
		});
	});

	describe("handleHistoricalVersionRequest — bin→mxweb 转换限频（quota.history_window_count）", () => {
		const makeRes = () => {
			const res: any = {
				setHeader: jest.fn(),
				removeHeader: jest.fn(),
				status: jest.fn().mockReturnThis(),
				json: jest.fn(),
				send: jest.fn(),
				end: jest.fn(),
			};
			return res;
		};
		// 登录用户请求：user.id 用于限频占位
		const mockReqWithUser: any = { user: { id: "user-1" } };
		// 游客请求（分享访问）：无 userId，不应占位
		const mockGuestReq: any = {};

		const mockMxwebSource = () => {
			mockVersionControlService.listDirectoryAtRevision.mockResolvedValue({
				success: true,
				files: ["abc123.bin"],
			});
			mockVersionControlService.getFileContentAtRevision.mockResolvedValue({
				success: true,
				content: Buffer.from("bin-content"),
			});
		};

		it("缓存命中（_v<rev>.mxweb 已存在）：直接返回，不占位额度", async () => {
			const { existsSync } = jest.requireMock("fs") as {
				existsSync: jest.Mock;
			};
			existsSync.mockReturnValueOnce(true); // _v3.mxweb 缓存已存在

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockReqWithUser,
				false
			);

			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.send).toHaveBeenCalledWith(Buffer.from("mxweb-content"));
			expect(
				mockRestrictionEngine.reserveHistoryCountOrThrow
			).not.toHaveBeenCalled();
			expect(mockFileConversionService.convertBinToMxweb).not.toHaveBeenCalled();
		});

		it("真正执行 bin→mxweb 转换时：转换前占位额度，成功返回 200 且不回补", async () => {
			mockMxwebSource();
			mockFileConversionService.convertBinToMxweb.mockResolvedValue({
				success: true,
				outputPath: "/fake/filesData/202608/node-1/abc123_v3.mxweb",
			});
			mockRestrictionEngine.reserveHistoryCountOrThrow.mockResolvedValue(
				undefined
			);

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockReqWithUser,
				false
			);

			expect(
				mockRestrictionEngine.reserveHistoryCountOrThrow
			).toHaveBeenCalledWith("user-1");
			expect(mockFileConversionService.convertBinToMxweb).toHaveBeenCalledTimes(1);
			expect(res.status).toHaveBeenCalledWith(200);
			expect(mockRestrictionEngine.releaseHistoryCount).not.toHaveBeenCalled();
		});

		it("无 bin 分片（走 _initial/原始文件兜底）：不占位额度", async () => {
			mockVersionControlService.listDirectoryAtRevision.mockResolvedValue({
				success: true,
				files: ["abc123.dwg"], // 无 .bin 分片
			});
			mockVersionControlService.getFileContentAtRevision.mockResolvedValue({
				success: true,
				content: Buffer.from("original-content"),
			});

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockReqWithUser,
				false
			);

			expect(
				mockRestrictionEngine.reserveHistoryCountOrThrow
			).not.toHaveBeenCalled();
			expect(mockFileConversionService.convertBinToMxweb).not.toHaveBeenCalled();
		});

		it("转换失败：回补已占位额度并返回 500", async () => {
			mockMxwebSource();
			mockFileConversionService.convertBinToMxweb.mockRejectedValue(
				new Error("转换进程崩溃")
			);
			mockRestrictionEngine.reserveHistoryCountOrThrow.mockResolvedValue(
				undefined
			);
			mockRestrictionEngine.releaseHistoryCount.mockResolvedValue(undefined);

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockReqWithUser,
				false
			);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(mockRestrictionEngine.releaseHistoryCount).toHaveBeenCalledWith(
				"user-1"
			);
		});

		it("限频超限（QuotaExceededException）：返回 403 且不执行转换、不回补", async () => {
			mockMxwebSource();
			mockRestrictionEngine.reserveHistoryCountOrThrow.mockRejectedValue(
				new QuotaExceededException("历史版本查看过于频繁", {
					restrictionKey: "quota.history_window_count",
					limit: 300,
				})
			);

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockReqWithUser,
				false
			);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(mockFileConversionService.convertBinToMxweb).not.toHaveBeenCalled();
			expect(mockRestrictionEngine.releaseHistoryCount).not.toHaveBeenCalled();
		});

		it("游客（无 userId）：不占位额度、正常转换返回 200", async () => {
			mockMxwebSource();
			mockFileConversionService.convertBinToMxweb.mockResolvedValue({
				success: true,
				outputPath: "/fake/filesData/202608/node-1/abc123_v3.mxweb",
			});

			const res = makeRes();
			await service.handleHistoricalVersionRequest(
				"202608/node-1/abc123.dwg.mxweb",
				"3",
				res,
				mockGuestReq,
				false
			);

			expect(res.status).toHaveBeenCalledWith(200);
			expect(
				mockRestrictionEngine.reserveHistoryCountOrThrow
			).not.toHaveBeenCalled();
			expect(mockRestrictionEngine.releaseHistoryCount).not.toHaveBeenCalled();
		});
	});
});
