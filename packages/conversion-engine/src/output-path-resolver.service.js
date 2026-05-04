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
import * as path from 'path';
import * as fs from 'fs';
/**
 * OutputPathResolverService
 *
 * 统一管理转换输出路径的计算逻辑。
 * 根据源文件路径、目标格式和选项，生成标准化的输出路径，
 * 并确保输出目录存在。
 */
let OutputPathResolverService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var OutputPathResolverService = _classThis = class {
        constructor(config) {
            this.config = config;
            this.logger = new Logger(OutputPathResolverService.name);
        }
        /**
         * 解析输出文件路径
         *
         * 路径生成规则：
         *   {outputRoot}/{datePrefix}/{timestamp}_{random}.{ext}
         *
         * 如果 options.outputDir 不为空，则优先使用。
         *
         * @param sourcePath - 源文件路径
         * @param format     - 目标格式
         * @param options    - 转换选项
         * @returns 完整的输出文件路径
         */
        resolve(sourcePath, format, options) {
            const outputRoot = options?.outputDir ?? this.config.outputRoot;
            const ext = OutputPathResolverService.FORMAT_EXTENSIONS[format];
            const basename = options?.outputName ?? this.generateBaseName(sourcePath);
            const outputPath = path.join(outputRoot, `${basename}${ext}`);
            this.ensureDir(path.dirname(outputPath));
            return outputPath;
        }
        /**
         * 解析输出目录路径
         *
         * 对于 splitToBins 等会产生多个输出文件的场景，
         * 返回一个子目录而非单个文件路径。
         *
         * 目录规则：
         *   {outputRoot}/{datePrefix}/{timestamp}_{random}/
         *
         * @param sourcePath - 源文件路径
         * @param format     - 目标格式
         * @param options    - 转换选项
         * @returns 输出目录路径
         */
        resolveDir(sourcePath, format, options) {
            const outputRoot = options?.outputDir ?? this.config.outputRoot;
            const basename = options?.outputName ?? this.generateBaseName(sourcePath);
            const dir = path.join(outputRoot, `${basename}_${format}`);
            this.ensureDir(dir);
            return dir;
        }
        /**
         * 根据源文件生成唯一基础文件名（不含扩展名）
         *
         * 格式：{源文件名}_{timestamp}_{random4}
         */
        generateBaseName(sourcePath) {
            const ext = path.extname(sourcePath);
            const name = path.basename(sourcePath, ext);
            const timestamp = Date.now();
            const random = Math.random().toString(36).slice(2, 6);
            return `${name}_${timestamp}_${random}`;
        }
        /**
         * 确保目录存在（mkdir -p）
         */
        ensureDir(dirPath) {
            try {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            catch (err) {
                // EEXIST 在并发场景下可能出现，忽略
                const nodeErr = err;
                if (nodeErr.code !== 'EEXIST') {
                    this.logger.error(`创建目录失败: ${dirPath}`, nodeErr.message);
                    throw err;
                }
            }
        }
    };
    __setFunctionName(_classThis, "OutputPathResolverService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        OutputPathResolverService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
    })();
    /** 格式 → 文件扩展名映射 */
    _classThis.FORMAT_EXTENSIONS = {
        mxweb: '.mxweb',
        dwg: '.dwg',
        pdf: '.pdf',
        thumbnail: '.jpg',
        bins: '.bin',
    };
    (() => {
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return OutputPathResolverService = _classThis;
})();
export { OutputPathResolverService };
//# sourceMappingURL=output-path-resolver.service.js.map