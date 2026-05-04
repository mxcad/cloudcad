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
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger } from '@nestjs/common';
/**
 * FormatConverterService
 *
 * 实现 IConversionService，内部委托给 ProcessRunnerService 执行实际转换。
 * 所有转换操作遵循统一的流程：
 *   1. 通过 OutputPathResolverService 计算输出路径
 *   2. 构建 MxCAD 转换程序命令行参数
 *   3. 调用 ProcessRunnerService.run() 执行
 *   4. 解析进程输出，返回 ConversionResult
 */
let FormatConverterService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FormatConverterService = _classThis = class {
        constructor(processRunner, pathResolver, config) {
            this.processRunner = processRunner;
            this.pathResolver = pathResolver;
            this.config = config;
            this.logger = new Logger(FormatConverterService.name);
        }
        // -----------------------------------------------------------------------
        // toMxweb
        // -----------------------------------------------------------------------
        async toMxweb(sourcePath, options) {
            const outputPath = this.pathResolver.resolve(sourcePath, 'mxweb', options);
            const result = await this.processRunner.run(this.config.binPath, {
                args: ['-i', sourcePath, '-o', outputPath, '-f', 'mxweb'],
                timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
            });
            if (result.exitCode !== 0) {
                return {
                    success: false,
                    outputPaths: [],
                    error: `MxWeb 转换失败: ${result.stderr || result.stdout}`,
                    durationMs: result.durationMs,
                };
            }
            // 尝试从 stdout JSON 中提取实际路径
            const actualPath = this.tryExtractPath(result.stdout, outputPath);
            return {
                success: true,
                outputPaths: [actualPath],
                durationMs: result.durationMs,
            };
        }
        // -----------------------------------------------------------------------
        // toDwg
        // -----------------------------------------------------------------------
        async toDwg(sourcePath, options) {
            const outputPath = this.pathResolver.resolve(sourcePath, 'dwg', options);
            const result = await this.processRunner.run(this.config.binPath, {
                args: ['-i', sourcePath, '-o', outputPath, '-f', 'dwg'],
                timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
            });
            if (result.exitCode !== 0) {
                return {
                    success: false,
                    outputPaths: [],
                    error: `DWG 转换失败: ${result.stderr || result.stdout}`,
                    durationMs: result.durationMs,
                };
            }
            const actualPath = this.tryExtractPath(result.stdout, outputPath);
            return {
                success: true,
                outputPaths: [actualPath],
                durationMs: result.durationMs,
            };
        }
        // -----------------------------------------------------------------------
        // toPdf
        // -----------------------------------------------------------------------
        async toPdf(sourcePath, options) {
            const outputPath = this.pathResolver.resolve(sourcePath, 'pdf', options);
            const args = ['-i', sourcePath, '-o', outputPath, '-f', 'pdf'];
            if (options?.width) {
                args.push('-w', String(options.width));
            }
            if (options?.height) {
                args.push('-h', String(options.height));
            }
            if (options?.colorPolicy) {
                args.push('--color', options.colorPolicy);
            }
            const result = await this.processRunner.run(this.config.binPath, {
                args,
                timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
            });
            if (result.exitCode !== 0) {
                return {
                    success: false,
                    outputPaths: [],
                    error: `PDF 转换失败: ${result.stderr || result.stdout}`,
                    durationMs: result.durationMs,
                };
            }
            const actualPath = this.tryExtractPath(result.stdout, outputPath);
            return {
                success: true,
                outputPaths: [actualPath],
                durationMs: result.durationMs,
            };
        }
        // -----------------------------------------------------------------------
        // generateThumbnail
        // -----------------------------------------------------------------------
        async generateThumbnail(sourcePath, options) {
            const outputPath = this.pathResolver.resolve(sourcePath, 'thumbnail', options);
            const args = [
                '-i',
                sourcePath,
                '-o',
                outputPath,
                '-f',
                'thumbnail',
            ];
            if (options?.width) {
                args.push('-w', String(options.width));
            }
            if (options?.height) {
                args.push('-h', String(options.height));
            }
            if (options?.quality) {
                args.push('-q', String(options.quality));
            }
            const result = await this.processRunner.run(this.config.binPath, {
                args,
                timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
            });
            if (result.exitCode !== 0) {
                return {
                    success: false,
                    outputPaths: [],
                    error: `缩略图生成失败: ${result.stderr || result.stdout}`,
                    durationMs: result.durationMs,
                };
            }
            // 缩略图可能输出多张图片（多页图纸），尝试解析 JSON 输出获知实际文件列表
            const outputPaths = this.tryExtractPaths(result.stdout, outputPath);
            return {
                success: true,
                outputPaths,
                durationMs: result.durationMs,
            };
        }
        // -----------------------------------------------------------------------
        // splitToBins
        // -----------------------------------------------------------------------
        async splitToBins(sourcePath, options) {
            // 分片输出到目录而非单文件
            const outputDir = this.pathResolver.resolveDir(sourcePath, 'bins', options);
            const result = await this.processRunner.run(this.config.binPath, {
                args: ['-i', sourcePath, '-o', outputDir, '-f', 'bins'],
                timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs,
            });
            if (result.exitCode !== 0) {
                return {
                    success: false,
                    outputPaths: [],
                    error: `BIN 分片失败: ${result.stderr || result.stdout}`,
                    durationMs: result.durationMs,
                };
            }
            // 从 stdout JSON 提取分片文件列表，或执行 glob 扫描
            const outputPaths = this.tryExtractPaths(result.stdout, outputDir);
            return {
                success: true,
                outputPaths: outputPaths.length > 0 ? outputPaths : [outputDir],
                durationMs: result.durationMs,
            };
        }
        // -----------------------------------------------------------------------
        // 辅助方法
        // -----------------------------------------------------------------------
        /**
         * 尝试从进程 stdout 的 JSON 输出中提取 newpath 字段，
         * 失败时返回 fallback 路径
         */
        tryExtractPath(stdout, fallback) {
            try {
                const parsed = this.processRunner.parseJsonOutput(stdout);
                if (parsed?.newpath) {
                    return parsed.newpath;
                }
            }
            catch {
                // JSON 解析失败是正常的（有些工具不输出 JSON），直接使用 fallback
            }
            return fallback;
        }
        /**
         * 尝试从 stdout JSON 中提取文件路径列表
         */
        tryExtractPaths(stdout, fallback) {
            try {
                const parsed = this.processRunner.parseJsonOutput(stdout);
                if (parsed?.files && parsed.files.length > 0) {
                    return parsed.files;
                }
                if (parsed?.newpath) {
                    return [parsed.newpath];
                }
            }
            catch {
                // 忽略
            }
            return [fallback];
        }
    };
    __setFunctionName(_classThis, "FormatConverterService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FormatConverterService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FormatConverterService = _classThis;
})();
export { FormatConverterService };
//# sourceMappingURL=format-converter.service.js.map