/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////////
jest.mock("child_process", () => {
	const actual = jest.requireActual("child_process");
	const { promisify } = jest.requireActual("util");
	const mockExec = jest.fn();
	mockExec[promisify.custom] = (command: string, options: unknown) =>
		new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			mockExec(command, options, (err: Error | null, stdout: string, stderr: string) => {
				if (err) {
					(err as Error & { stdout: string; stderr: string }).stdout = stdout;
					(err as Error & { stdout: string; stderr: string }).stderr = stderr;
					reject(err);
				} else {
					resolve({ stdout, stderr });
				}
			});
		});
	return { ...actual, exec: mockExec };
});

import { exec } from "child_process";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { FileConversionService } from "./file-conversion.service";
import { VipFeatureRequiredException } from "../../vip/errors/vip-feature-required.error";
import { CONVERSION_ACCESS_GUARD } from "../../common/interfaces/conversion-access-guard";

// Module-level child_process.exec mock — allows per-test control of exec()
function setExec(
	_pattern: string,
	fn: (cmd: string) => { error: Error | null; stdout: string; stderr: string },
) {
	const mockExec = exec as unknown as jest.Mock;
	mockExec.mockImplementation((cmd: string, _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
		const result = fn(cmd);
		if (result.error) {
			const errWithOutput = Object.assign(new Error(result.error.message), {
				stdout: result.stdout,
				stderr: result.stderr,
				code: (result.error as Error & { code?: number }).code,
			});
			callback(errWithOutput, result.stdout, result.stderr);
		} else {
			callback(null, result.stdout, result.stderr);
		}
	});
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

		// Reset exec mock to default success state
		const mockExec = exec as unknown as jest.Mock;
		mockExec.mockImplementation((_cmd: string, _opts: unknown, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
			callback(null, '{"code":0}', "");
		});

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
			setExec("*", () => ({ error: null, stdout: '{"code":0}', stderr: "" }));
			const r = await service.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(r.isOk).toBe(true);
		});

		it("should handle conversion failure with error code", async () => {
			setExec("*", () => ({
				error: null,
				stdout: '{"code":1,"message":"Invalid file"}',
				stderr: "",
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/bad.dwg",
				fileHash: "xyz",
			});
			expect(r.isOk).toBe(false);
			expect(r.error).toContain("Invalid file");
		});

		it("should handle parse error when output is invalid JSON", async () => {
			setExec("*", () => ({ error: null, stdout: "not json", stderr: "" }));
			const r = await service.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(r.isOk).toBe(false);
		});

		it("should handle exec error with successful stdout fallback", async () => {
			setExec("*", () => ({
				error: new Error("exec error"),
				stdout: '{"code":0}',
				stderr: "",
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(r.isOk).toBe(true);
		});

		it("should handle exec error with no successful output", async () => {
			setExec("*", () => ({
				error: new Error("ETIMEOUT"),
				stdout: "",
				stderr: "timeout",
			}));
			const r = await service.convertFile({
				srcPath: "/tmp/f.dwg",
				fileHash: "abc",
			});
			expect(r.isOk).toBe(false);
		});

		// ===== 导出下载方向会员门控（mxweb → 其他格式）=====
		it("should call conversion guard for mxweb source (export direction)", async () => {
			setExec("*", () => ({ error: null, stdout: '{"code":0}', stderr: "" }));
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
			setExec("*", () => ({ error: null, stdout: '{"code":0}', stderr: "" }));
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
			setExec("*", () => ({ error: null, stdout: '{"code":0}', stderr: "" }));
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
			setExec("*", () => ({ error: null, stdout: '{"code":0}', stderr: "" }));
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
		setExec("*", () => ({ error: null, stdout: '{"code":0}', stderr: "" }));
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
			setExec("*", () => ({ error: null, stdout: '{"code":0}', stderr: "" }));
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
			setExec("*", () => ({ error: null, stdout: '{"code":0}', stderr: "" }));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(true);
			expect(r.outputPath).toContain("f.mxweb");
		});

		it("should handle conversion failure", async () => {
			setExec("*", () => ({
				error: null,
				stdout: '{"code":1,"message":"Convert failed"}',
				stderr: "",
			}));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(false);
		});

		it("should handle parse error", async () => {
			setExec("*", () => ({ error: null, stdout: "invalid json", stderr: "" }));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(false);
		});

		it("should handle execution error", async () => {
			setExec("*", () => ({
				error: new Error("Exec failed"),
				stdout: "",
				stderr: "",
			}));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(false);
		});

		it("should handle success when exit code non-zero but output indicates success", async () => {
			setExec("*", () => ({
				error: new Error("non-zero"),
				stdout: '{"code":0}',
				stderr: "",
			}));
			const r = await service.convertBinToMxweb(
				"/tmp/f.bin",
				"/tmp/out",
				"f.mxweb",
			);
			expect(r.success).toBe(true);
		});
	});
});
