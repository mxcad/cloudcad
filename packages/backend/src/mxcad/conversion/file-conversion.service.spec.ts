/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////////
jest.mock("./mxcad-exec", () => ({
	runMxcadAssembly: jest.fn(),
}));

import * as path from "path";
import { runMxcadAssembly } from "./mxcad-exec";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { FileConversionService } from "./file-conversion.service";
import { VipFeatureRequiredException } from "../../vip/errors/vip-feature-required.error";
import { CONVERSION_ACCESS_GUARD } from "../../common/interfaces/conversion-access-guard";
import {
	IFunctionExecutor,
	type IFunctionExecutor as IFunctionExecutorType,
} from "../../function-executor/function-executor.interface";

// runMxcadAssembly 返回值形状（与 mxcad-exec.ts 的 MxcadRunResult 一致）
interface RunResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	timedOut: boolean;
}

// Module-level runMxcadAssembly mock — allows per-test control of the conversion run.
// 助手始终 resolve（不 reject）：非零退出/超时通过 exitCode/signal/timedOut 表达。
function setRun(fn: () => RunResult) {
	const mockRun = runMxcadAssembly as unknown as jest.Mock;
	mockRun.mockImplementation(() => Promise.resolve(fn()));
}

describe("FileConversionService", () => {
	let service: FileConversionService;

	function createMockConfig() {
		return {
			get: jest.fn((key: string, options?: Record<string, unknown>) => {
				if (key === "mxcad")
					return {
						assemblyPath: "/fake/mxcadassembly.exe",
						fileExt: ".mxweb",
						compression: true,
					};
				if (key === "upload")
					return { maxConcurrent: 2, conversionMaxConcurrent: 2 };
				if (options?.infer) {
					if (key === "mxcad")
						return {
							assemblyPath: "/fake/mxcadassembly.exe",
							fileExt: ".mxweb",
							compression: true,
						};
					if (key === "upload")
						return { maxConcurrent: 2, conversionMaxConcurrent: 2 };
				}
				return undefined;
			}),
		};
	}

	beforeEach(async () => {
		jest.clearAllMocks();

		// Reset runMxcadAssembly mock to default success state
		const mockRun = runMxcadAssembly as unknown as jest.Mock;
		mockRun.mockImplementation(() =>
			Promise.resolve({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}),
		);

		const mockConfigService = createMockConfig();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				FileConversionService,
				{ provide: ConfigService, useValue: createMockConfig() },
			],
		})
			.setLogger({
				log: jest.fn(),
				error: jest.fn(),
				warn: jest.fn(),
				debug: jest.fn(),
				verbose: jest.fn(),
			})
			.compile();

		service = module.get<FileConversionService>(FileConversionService);
	});

	// ==================== convertFile ====================
	describe("convertFile", () => {
		it("should convert DWG file successfully", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(r.isOk).toBe(true);
		});

		it("should handle conversion failure with error code", async () => {
			setRun(() => ({
				stdout: '{"code":1,"message":"Invalid file"}',
				stderr: "",
				exitCode: 1,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/bad.dwg",
				fileHash: "xyz",
			});
			expect(r.isOk).toBe(false);
			expect(r.error).toContain("Invalid file");
			// 引擎返回非 0 code = 确定性内容失败，同一输入重试注定再失败
			expect(r.transient).toBe(false);
		});

		it("should handle parse error when output is invalid JSON", async () => {
			setRun(() => ({
				stdout: "not json",
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(r.isOk).toBe(false);
			// 引擎已正常退出但输出不可解析 = 引擎协议/配置异常，属环境性失败
			expect(r.transient).toBe(true);
		});

		it("should handle non-zero exit with successful stdout fallback", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 1,
				signal: null,
				timedOut: true,
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(r.isOk).toBe(true);
		});

		it("should handle timeout with no successful output", async () => {
			setRun(() => ({
				stdout: "",
				stderr: "timeout",
				exitCode: null,
				signal: "SIGTERM",
				timedOut: true,
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(r.isOk).toBe(false);
			// 超时是环境性失败（可重试），且 code=-2 区别于内容失败与解析失败
			expect(r.transient).toBe(true);
			expect(r.ret.code).toBe(-2);
			expect(r.error).toContain("文件转换超时");
		});

		// ===== 导出下载方向会员门控（mxweb → 其他格式）=====
		it("should call conversion guard for mxweb source (export direction)", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const guard = { assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined) };
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: createMockConfig() },
					{ provide: CONVERSION_ACCESS_GUARD, useValue: guard },
				],
			})
				.setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() })
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);
			const r = await svc.convertFile({
				srcPath: "/tmp/f.mxweb",
				fileHash: "abc",
				userId: "user-1",
			});
			expect(r.isOk).toBe(true);
			expect(guard.assertExportDownloadAllowed).toHaveBeenCalledWith("user-1");
		});

		it("should skip guard for non-mxweb source (open direction)", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const guard = { assertExportDownloadAllowed: jest.fn().mockResolvedValue(undefined) };
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: createMockConfig() },
					{ provide: CONVERSION_ACCESS_GUARD, useValue: guard },
				],
			})
				.setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() })
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);
			await svc.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(guard.assertExportDownloadAllowed).not.toHaveBeenCalled();
		});

		it("should propagate guard rejection for mxweb export", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const guard = {
				assertExportDownloadAllowed: jest.fn().mockRejectedValue(
					new Error("VIP_FEATURE_REQUIRED")
				),
			};
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: createMockConfig() },
					{ provide: CONVERSION_ACCESS_GUARD, useValue: guard },
				],
			})
				.setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() })
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);
			await expect(
				svc.convertFile({
					srcPath: "/tmp/f.mxweb",
					fileHash: "abc",
				})
			).rejects.toThrow("VIP_FEATURE_REQUIRED");
		});

		it("convertServerFile 透传门控拒绝（不折叠为 code:12）", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const guard = {
				assertExportDownloadAllowed: jest.fn().mockRejectedValue(
					new VipFeatureRequiredException(
						"导出下载为会员专属功能，开通 VIP 后即可使用",
						"export_download"
					)
				),
			};
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: createMockConfig() },
					{ provide: CONVERSION_ACCESS_GUARD, useValue: guard },
				],
			})
				.setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() })
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);
			await expect(
				svc.convertServerFile({
					srcPath: "/tmp/f.mxweb",
					fileHash: "abc",
					nodeId: "node-1",
					userId: "free-user",
				})
			).rejects.toMatchObject({ name: "VipFeatureRequiredException" });
		});
	});

	// ===== skipExportGate：内部转换跳过导出下载门控 =====
	it("should skip export gate when skipExportGate is set (internal conversion)", async () => {
		setRun(() => ({
			stdout: '{"code":0}',
			stderr: "",
			exitCode: 0,
			signal: null,
			timedOut: false,
		}));
		const guard = {
			assertExportDownloadAllowed: jest.fn().mockRejectedValue(
				new Error("VIP_FEATURE_REQUIRED")
			),
		};
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				FileConversionService,
				{ provide: ConfigService, useValue: createMockConfig() },
				{ provide: CONVERSION_ACCESS_GUARD, useValue: guard },
			],
		})
			.setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() })
			.compile();
		const svc = module.get<FileConversionService>(FileConversionService);
		const r = await svc.convertFile({
			srcPath: "/tmp/f.mxweb",
			fileHash: "abc",
			skipExportGate: true,
		});
		expect(r.isOk).toBe(true);
		expect(guard.assertExportDownloadAllowed).not.toHaveBeenCalled();
	});

	// ==================== generateBinFiles ====================
	describe("generateBinFiles", () => {
		it("保存时生成 bin 文件属于内部转换，不应触发导出下载会员门控", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const guard = {
				assertExportDownloadAllowed: jest.fn().mockRejectedValue(
					new VipFeatureRequiredException(
						"导出下载为会员专属功能，开通 VIP 后即可使用",
						"export_download"
					)
				),
			};
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: createMockConfig() },
					{ provide: CONVERSION_ACCESS_GUARD, useValue: guard },
				],
			})
				.setLogger({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), verbose: jest.fn() })
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);
			// 不抛出 VIP 拒绝即代表门控被正确跳过
			await expect(
				svc.generateBinFiles("/tmp/f.mxweb", "f.mxweb")
			).resolves.toBeUndefined();
			expect(guard.assertExportDownloadAllowed).not.toHaveBeenCalled();
		});
	});

	// ==================== convertFileAsync ====================
	describe("convertFileAsync", () => {
		it("should return a task ID", async () => {
			const r = await service.convertFileAsync({
				srcPath: "/f.dwg",
				fileHash: "abc",
			});
			expect(r).toMatch(/^task_\d+/);
		});

		it("should generate unique task IDs for multiple calls", async () => {
			const r1 = await service.convertFileAsync({
				srcPath: "/f.dwg",
				fileHash: "abc",
			});
			const r2 = await service.convertFileAsync({
				srcPath: "/f.dwg",
				fileHash: "abc",
			});
			expect(r1).not.toBe(r2);
		});
	});

	// ==================== getConvertedExtension ====================
	describe("getConvertedExtension", () => {
		it("should return .mxweb for .dwg files", () => {
			expect(service.getConvertedExtension("f.dwg")).toBe(".mxweb");
		});

		it("should return .mxweb for .dxf files", () => {
			expect(service.getConvertedExtension("f.dxf")).toBe(".mxweb");
		});

		it("should return .pdf for .pdf files", () => {
			expect(service.getConvertedExtension("f.pdf")).toBe(".pdf");
		});

		it("should return .png for .png files", () => {
			expect(service.getConvertedExtension("f.png")).toBe(".png");
		});

		it("should return .jpg for .jpg files", () => {
			expect(service.getConvertedExtension("f.jpg")).toBe(".jpg");
		});

		it("should return .jpeg for .jpeg files", () => {
			expect(service.getConvertedExtension("f.jpeg")).toBe(".jpeg");
		});

		it("should return default extension for unknown file types", () => {
			expect(service.getConvertedExtension("f.unknown")).toBe(".mxweb");
		});

		it("should handle case-insensitive extensions", () => {
			expect(service.getConvertedExtension("f.DWG")).toBe(".mxweb");
			expect(service.getConvertedExtension("f.Dxf")).toBe(".mxweb");
			expect(service.getConvertedExtension("f.PDF")).toBe(".pdf");
		});
	});

	// ==================== needsConversion ====================
	describe("needsConversion", () => {
		it("should return true for DWG files", () => {
			expect(service.needsConversion("f.dwg")).toBe(true);
		});

		it("should return true for DXF files", () => {
			expect(service.needsConversion("f.dxf")).toBe(true);
		});

		it("should return false for PDF files", () => {
			expect(service.needsConversion("f.pdf")).toBe(false);
		});

		it("should return false for image files", () => {
			expect(service.needsConversion("f.png")).toBe(false);
			expect(service.needsConversion("f.jpg")).toBe(false);
		});
	});

	// ==================== convertBinToMxweb ====================
	describe("convertBinToMxweb", () => {
		it("should convert bin file to mxweb successfully", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(true);
			expect(r.outputPath).toContain("f.mxweb");
		});

		it("should handle conversion failure", async () => {
			setRun(() => ({
				stdout: '{"code":1,"message":"Convert failed"}',
				stderr: "",
				exitCode: 1,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(false);
		});

		it("should handle parse error", async () => {
			setRun(() => ({
				stdout: "invalid json",
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(false);
		});

		it("should handle spawn failure with no output", async () => {
			setRun(() => ({
				stdout: "",
				stderr: "Exec failed",
				exitCode: null,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(false);
		});

		it("should handle success when exit code non-zero but output indicates success", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 1,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(true);
		});

		it("should limit concurrent bin→mxweb conversions to the configured max", async () => {
			let active = 0;
			let maxActive = 0;
			const mockRun = runMxcadAssembly as unknown as jest.Mock;
			mockRun.mockImplementation(
				() =>
					new Promise<RunResult>((resolve) => {
						active++;
						maxActive = Math.max(maxActive, active);
						setTimeout(() => {
							active--;
							resolve({
								stdout: '{"code":0}',
								stderr: "",
								exitCode: 0,
								signal: null,
								timedOut: false,
							});
						}, 50);
					}),
			);
			await Promise.all([
				service.convertBinToMxweb("/tmp/a.bin", "/tmp/out", "a.mxweb"),
				service.convertBinToMxweb("/tmp/b.bin", "/tmp/out", "b.mxweb"),
				service.convertBinToMxweb("/tmp/c.bin", "/tmp/out", "c.mxweb"),
			]);
			// 限流器 cap = min(2, cpu, 2) = 2：3 个并发请求最多 2 个同时跑
			expect(maxActive).toBeLessThanOrEqual(2);
		});
	});

	// ==================== 部署模式 env 分支（#433） ====================
	describe("FUNCTION_EXECUTOR 部署模式分支", () => {
		const silentLogger = {
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
			verbose: jest.fn(),
		};

		function configWithExecutorMode(mode?: string) {
			const base = createMockConfig();
			return {
				get: jest.fn((key: string, options?: Record<string, unknown>) => {
					if (key === "FUNCTION_EXECUTOR") return mode;
					return base.get(key, options);
				}),
			};
		}

		it("conversion-service 模式：convertFile 经 IFunctionExecutor 转发，不 spawn 进程", async () => {
			const mockExecutor = {
				invoke: jest.fn(async () => ({
					taskId: "cs_1",
					status: "COMPLETED",
					outputPath: "/out/f.mxweb",
					metadata: { code: 0, newpath: "/out/f.mxweb" },
				})),
				getTaskStatus: jest.fn(),
			} as unknown as IFunctionExecutorType;
			const module = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: configWithExecutorMode("conversion-service") },
					{ provide: IFunctionExecutor, useValue: mockExecutor },
				],
			})
				.setLogger(silentLogger)
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);

			const r = await svc.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
			expect(r.isOk).toBe(true);
			expect(r.ret.newpath).toBe("/out/f.mxweb");
			expect(mockExecutor.invoke).toHaveBeenCalledTimes(1);
			// 转发模式下进程内 spawn 不应被调用
			expect(runMxcadAssembly).not.toHaveBeenCalled();
			await module.close();
		});

		it("conversion-service 模式：转发参数为 ConversionOptions 驼峰形状（srcPath 非 srcpath），防契约断裂", async () => {
			const mockExecutor = {
				invoke: jest.fn(async () => ({
					taskId: "cs_1",
					status: "COMPLETED",
					outputPath: "/out/f.mxweb",
					metadata: { code: 0, newpath: "/out/f.mxweb" },
				})),
				getTaskStatus: jest.fn(),
			} as unknown as IFunctionExecutorType;
			const module = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: configWithExecutorMode("conversion-service") },
					{ provide: IFunctionExecutor, useValue: mockExecutor },
				],
			})
				.setLogger(silentLogger)
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);

			const r = await svc.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
				outname: "out.mxweb",
				cmd: "to_mxweb",
				bd_pt1_x: "1",
				bd_pt1_y: "2",
				bd_pt2_x: "3",
				bd_pt2_y: "4",
				open_file_md5: "md5hash",
				create_clip_block: true,
			});
			expect(r.isOk).toBe(true);
			// 转发给转换服务的参数必须是 ConversionOptions 驼峰形状：转换服务 MxcadRunner 读
			// params.srcPath（驼峰），若误发 mxcadassembly 小写 srcpath 会读 undefined → .replace 崩溃。
			const invokeMock = mockExecutor.invoke as unknown as {
				mock: { calls: unknown[][] };
			};
			const task = invokeMock.mock.calls[0][0] as {
				params: Record<string, unknown>;
			};
			// 核心回归：srcPath（驼峰）必须存在——转换服务读 params.srcPath，缺失即 .replace 崩溃
			expect(typeof task.params.srcPath).toBe("string");
			// 路径值（Windows 下 path.normalize 产出反斜杠，统一转正斜杠比对，跨平台稳定）
			expect(String(task.params.srcPath).replace(/\\/g, "/")).toBe("/tmp/f.dwg");
			expect(task.params.fileHash).toBe("abc");
			expect(task.params.outname).toBe("out.mxweb");
			expect(task.params.cmd).toBe("to_mxweb");
			// 关键回归：不得携带 mxcadassembly 小写键，否则转换服务读 srcPath 恒 undefined
			expect(task.params).not.toHaveProperty("srcpath");
			expect(task.params).not.toHaveProperty("src_file_md5");
			// 721fe02 重构 serviceParam 时漏抄的 6 个字段（cut_dwg/print_to_pdf 区域/引用），
			// 丢失会致引擎缺区域信息回 {"message":"false"}——锁定必须转发，防再漏
			expect(task.params.bd_pt1_x).toBe("1");
			expect(task.params.bd_pt1_y).toBe("2");
			expect(task.params.bd_pt2_x).toBe("3");
			expect(task.params.bd_pt2_y).toBe("4");
			expect(task.params.open_file_md5).toBe("md5hash");
			expect(task.params.create_clip_block).toBe(true);
			await module.close();
		});

		it("conversion-service 模式：转发失败时返回 isOk=false 与错误信息", async () => {
			const mockExecutor = {
				invoke: jest.fn(async () => ({
					taskId: "cs_1",
					status: "FAILED",
					error: "conversion service down",
				})),
				getTaskStatus: jest.fn(),
			} as unknown as IFunctionExecutorType;
			const module = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: configWithExecutorMode("conversion-service") },
					{ provide: IFunctionExecutor, useValue: mockExecutor },
				],
			})
				.setLogger(silentLogger)
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);

			const r = await svc.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
			expect(r.isOk).toBe(false);
			expect(r.error).toContain("conversion service down");
			expect(runMxcadAssembly).not.toHaveBeenCalled();
			await module.close();
		});

		// 转换服务只回错误字符串、不透传失败性质，按 runner.ts 抛出的文案归类：
		// '转换超时' / '转换进程被终止' / '进程未正常启动' / '转换输出格式错误' = 瞬态；
		// 其余（引擎非 0 code 的原始 message，如 'read file error'）= 确定性内容失败。
		it.each([
			["转换超时", true],
			["转换进程被终止 (SIGKILL)", true],
			["mxcadassembly 进程未正常启动（stderr: 无）", true],
			["转换输出格式错误", true],
			["read file error", false],
			["false", false],
			["转换参数缺少 srcPath", false],
		])(
			"conversion-service 模式：转发失败文案「%s」归类 transient=%s",
			async (error, expectedTransient) => {
				const mockExecutor = {
					invoke: jest.fn(async () => ({
						taskId: "cs_1",
						status: "FAILED",
						error,
					})),
					getTaskStatus: jest.fn(),
				} as unknown as IFunctionExecutorType;
				const module = await Test.createTestingModule({
					providers: [
						FileConversionService,
						{ provide: ConfigService, useValue: configWithExecutorMode("conversion-service") },
						{ provide: IFunctionExecutor, useValue: mockExecutor },
					],
				})
					.setLogger(silentLogger)
					.compile();
				const svc = module.get<FileConversionService>(FileConversionService);
				const r = await svc.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
				expect(r.isOk).toBe(false);
				expect(r.error).toContain(error);
				expect(r.transient).toBe(expectedTransient);
				await module.close();
			},
		);

		it("conversion-service 模式：binToMxweb 空串 newpath 回落本地计算路径（回归：历史版本「bin→mxweb 转换失败: undefined」）", async () => {
			// 忠实模拟 HttpConversionExecutor 映射：转换服务单任务结果 = mxcadassembly 输出
			// {code, message}（无 newpath 键），runner 成功时补 newpath: ''，
			// getTaskStatus 映射 outputPath = raw.newpath ?? raw.outputPath = ''（空串非 nullish）。
			const mockExecutor = {
				invoke: jest.fn(async () => ({
					taskId: "cs_1",
					status: "COMPLETED",
					outputPath: "",
					metadata: { code: 0, message: "ok", newpath: "" },
				})),
				getTaskStatus: jest.fn(),
			} as unknown as IFunctionExecutorType;
			const module = await Test.createTestingModule({
				providers: [
					FileConversionService,
					{ provide: ConfigService, useValue: configWithExecutorMode("conversion-service") },
					{ provide: IFunctionExecutor, useValue: mockExecutor },
				],
			})
				.setLogger(silentLogger)
				.compile();
			const svc = module.get<FileConversionService>(FileConversionService);

			const r = await svc.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
			expect(r.success).toBe(true);
			// 空串 newpath 必须回落本地计算路径（与进程内分支一致），
			// 不得返回 outputPath=''（调用方 !outputPath 判失败且 error=undefined）
			expect(r.outputPath).toBe(path.join("/tmp/out", "f.mxweb"));
			expect(runMxcadAssembly).not.toHaveBeenCalled();
			await module.close();
		});

		it("默认 process-pool 模式：convertFile 走进程内 spawn，不经 IFunctionExecutor", async () => {
			// beforeEach 的 service：FUNCTION_EXECUTOR 未设 = process-pool
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
			expect(r.isOk).toBe(true);
			// 进程内 spawn 被调用
			expect(runMxcadAssembly).toHaveBeenCalledTimes(1);
		});
	});

	// ==================== 失败分类（process-pool 对齐 conversion-service） ====================
	describe("失败分类（process-pool 对齐 conversion-service）", () => {
		it("进程被信号杀死（exitCode=null）归为瞬态，并给出可定位的进程未启动文案", async () => {
			setRun(() => ({
				stdout: "",
				stderr: "ENOENT: no such file",
				exitCode: null,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
			expect(r.isOk).toBe(false);
			expect(r.transient).toBe(true);
			expect(r.ret.code).toBe(-2);
			expect(r.error).toContain("进程未正常启动");
		});

		it("被 SIGKILL 强杀归为瞬态（非超时）", async () => {
			setRun(() => ({
				stdout: "",
				stderr: "",
				exitCode: null,
				signal: "SIGKILL",
				timedOut: false,
			}));
			const r = await service.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
			expect(r.isOk).toBe(false);
			expect(r.transient).toBe(true);
			expect(r.error).toContain("signal=SIGKILL");
			expect(r.error).not.toContain("文件转换超时");
		});

		it("引擎返回非 0 code 归为确定性失败并保留引擎原始 message", async () => {
			setRun(() => ({
				stdout: '{"code":1,"message":"read file error"}',
				stderr: "",
				exitCode: 1,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
			expect(r.isOk).toBe(false);
			expect(r.transient).toBe(false);
			expect(r.ret.message).toBe("read file error");
			expect(r.error).toBe("read file error");
		});

		it("超时但 stdout 已含完整成功结果时采信成功（超时线边界竞态）", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 1,
				signal: null,
				timedOut: true,
			}));
			const r = await service.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
			expect(r.isOk).toBe(true);
			expect(r.ret.code).toBe(0);
		});

		it("输出无法解析时归为瞬态且错误信息带原始输出片段", async () => {
			setRun(() => ({
				stdout: "garbled engine output",
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertFile({ srcPath: "/tmp/f.dwg", fileHash: "abc" });
			expect(r.isOk).toBe(false);
			expect(r.transient).toBe(true);
			expect(r.error).toContain("输出无法解析");
			expect(r.error).toContain("garbled engine output");
		});

		it("成功且引擎未回 newpath 时按 outname 补算产物路径", async () => {
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/src.dwg",
				fileHash: "abc",
				outname: "out.pdf",
			});
			expect(r.isOk).toBe(true);
			// 与 conversion-service MxcadRunner 的补算规则一致：产物在源文件同目录
			expect(r.ret.newpath).toBe(path.join("/tmp", "out.pdf"));
		});

		it("convertBinToMxweb 四路失败分类齐全（超时/未启动/内容失败/解析失败）", async () => {
			// 1) 超时（无成功输出）→ 瞬态
			setRun(() => ({
				stdout: "",
				stderr: "timeout",
				exitCode: null,
				signal: "SIGTERM",
				timedOut: true,
			}));
			let r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
			expect(r.success).toBe(false);
			expect(r.transient).toBe(true);
			expect(r.error).toContain("转换超时");

			// 2) 超时但已含完整成功结果 → 采信成功
			setRun(() => ({
				stdout: '{"code":0}',
				stderr: "",
				exitCode: 1,
				signal: null,
				timedOut: true,
			}));
			r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
			expect(r.success).toBe(true);
			expect(r.outputPath).toBe(path.join("/tmp/out", "f.mxweb"));

			// 3) 进程未正常启动（exitCode=null）→ 瞬态
			setRun(() => ({
				stdout: "",
				stderr: "",
				exitCode: null,
				signal: null,
				timedOut: false,
			}));
			r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
			expect(r.success).toBe(false);
			expect(r.transient).toBe(true);
			expect(r.error).toContain("进程未正常启动");

			// 4) 引擎非 0 code → 确定性内容失败
			setRun(() => ({
				stdout: '{"code":1,"message":"read file error"}',
				stderr: "",
				exitCode: 1,
				signal: null,
				timedOut: false,
			}));
			r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
			expect(r.success).toBe(false);
			expect(r.transient).toBe(false);
			expect(r.error).toBe("read file error");

			// 5) 输出无法解析 → 瞬态
			setRun(() => ({
				stdout: "junk",
				stderr: "",
				exitCode: 0,
				signal: null,
				timedOut: false,
			}));
			r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
			expect(r.success).toBe(false);
			expect(r.transient).toBe(true);
			expect(r.error).toContain("输出无法解析");
		});
	});
});
