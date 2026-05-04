/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////////
import { ProcessRunnerService } from "@cloudcad/conversion-engine";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { FileConversionService } from "./file-conversion.service";
// Module-level ProcessRunnerService mock — allows per-test control of run()
const mockProcessRunner = {
    run: jest.fn().mockResolvedValue({ stdout: '{"code":0}', stderr: "" }),
    stop: jest.fn(),
    isRunning: jest.fn().mockReturnValue(false),
};
// Replaces the old child_process.exec dispatch pattern.
// Controls mockProcessRunner.run() with the same callback-based API.
function setExec(_pattern, fn) {
    const result = fn("dummy");
    if (result.error) {
        const errWithOutput = new Error(result.error.message);
        errWithOutput.stdout = result.stdout;
        errWithOutput.stderr = result.stderr;
        if (result.error.code)
            errWithOutput.code = result.error.code;
        mockProcessRunner.run.mockRejectedValueOnce(errWithOutput);
    }
    else {
        mockProcessRunner.run.mockResolvedValueOnce({ stdout: result.stdout, stderr: result.stderr });
    }
}
describe("FileConversionService", () => {
    let service;
    beforeEach(async () => {
        jest.clearAllMocks();
        // Reset the mock to its default success state (resetMocks clears it)
        mockProcessRunner.run.mockResolvedValue({ stdout: '{"code":0}', stderr: "" });
        mockProcessRunner.isRunning.mockReturnValue(false);
        const mockConfigService = {
            get: jest.fn((key, options) => {
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
        const module = await Test.createTestingModule({
            providers: [
                FileConversionService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: ProcessRunnerService, useValue: mockProcessRunner },
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
        service = module.get(FileConversionService);
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
    // ==================== checkConversionStatus ====================
    describe("checkConversionStatus", () => {
        it("should return completed status", async () => {
            const r = await service.checkConversionStatus("task-1");
            expect(r.code).toBe(0);
            expect(r.status).toBe("completed");
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
            const r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
            expect(r.success).toBe(true);
            expect(r.outputPath).toContain("f.mxweb");
        });
        it("should handle conversion failure", async () => {
            setExec("*", () => ({
                error: null,
                stdout: '{"code":1,"message":"Convert failed"}',
                stderr: "",
            }));
            const r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
            expect(r.success).toBe(false);
        });
        it("should handle parse error", async () => {
            setExec("*", () => ({ error: null, stdout: "invalid json", stderr: "" }));
            const r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
            expect(r.success).toBe(false);
        });
        it("should handle execution error", async () => {
            setExec("*", () => ({
                error: new Error("Exec failed"),
                stdout: "",
                stderr: "",
            }));
            const r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
            expect(r.success).toBe(false);
        });
        it("should handle success when exit code non-zero but output indicates success", async () => {
            setExec("*", () => ({
                error: new Error("non-zero"),
                stdout: '{"code":0}',
                stderr: "",
            }));
            const r = await service.convertBinToMxweb("/tmp/f.bin", "/tmp/out", "f.mxweb");
            expect(r.success).toBe(true);
        });
    });
});
//# sourceMappingURL=file-conversion.service.spec.js.map