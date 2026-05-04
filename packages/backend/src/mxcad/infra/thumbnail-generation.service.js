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
import * as fsPromises from 'fs/promises';
import { findThumbnail, findThumbnailSync, hasThumbnail, getThumbnailFileName, THUMBNAIL_FORMATS, } from './thumbnail-utils';
/**
 * 缩略图生成服务
 * 使用 conversion-engine 将 CAD 文件转换为 JPG 缩略图
 */
let ThumbnailGenerationService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ThumbnailGenerationService = _classThis = class {
        constructor(configService, conversionService) {
            this.configService = configService;
            this.conversionService = conversionService;
            this.logger = new Logger(ThumbnailGenerationService.name);
            const thumbnailConfig = this.configService.get('thumbnail', {
                infer: true,
            });
            this.enabled = thumbnailConfig?.autoGenerateEnabled ?? true;
            this.width = thumbnailConfig?.width || 200;
            this.height = thumbnailConfig?.height || 200;
        }
        /**
         * 检查缩略图生成功能是否可用
         */
        isEnabled() {
            return this.enabled;
        }
        /**
         * 从 CAD 文件生成缩略图
         * @param cadFilePath CAD 文件（dwg/dxf）的绝对路径
         * @param outputDir 输出目录
         * @param nodeId 节点 ID（用于日志）
         * @param outputFileName 输出文件名（默认 thumbnail.webp，按优先级查找）
         * @returns 生成结果
         */
        async generateThumbnail(cadFilePath, outputDir, nodeId, outputFileName) {
            if (!this.isEnabled()) {
                return {
                    success: false,
                    error: '缩略图生成功能已禁用',
                };
            }
            const logPrefix = nodeId ? `[${nodeId}]` : '';
            try {
                // 检查 CAD 文件是否存在
                try {
                    await fsPromises.access(cadFilePath);
                }
                catch {
                    this.logger.error(`${logPrefix} CAD 文件不存在: ${cadFilePath}`);
                    return {
                        success: false,
                        error: 'CAD 文件不存在',
                    };
                }
                // 确保输出目录存在
                await fsPromises.mkdir(outputDir, { recursive: true });
                // 缩略图期望输出路径
                const fileName = outputFileName || getThumbnailFileName(THUMBNAIL_FORMATS[0]);
                const thumbnailPath = path.join(outputDir, fileName);
                this.logger.debug(`${logPrefix} 期望缩略图路径: ${thumbnailPath}`);
                // 通过 conversion-engine 生成缩略图
                const result = await this.conversionService.generateThumbnail(cadFilePath, {
                    outputDir,
                    outputName: fileName.replace(/\.(webp|jpg|png)$/, ''),
                    width: this.width,
                    height: this.height,
                });
                if (result.success && result.outputPaths.length > 0) {
                    this.logger.log(`${logPrefix} 缩略图生成成功: ${result.outputPaths[0]}`);
                    return {
                        success: true,
                        thumbnailPath: result.outputPaths[0],
                    };
                }
                else {
                    this.logger.error(`${logPrefix} 缩略图生成失败: ${result.error}`);
                    return {
                        success: false,
                        error: result.error || '缩略图生成失败',
                    };
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`${logPrefix} 缩略图生成异常: ${errorMessage}`);
                return {
                    success: false,
                    error: errorMessage,
                };
            }
        }
        /**
         * 检查指定目录是否已存在缩略图（按优先级查找 webp > jpg > png）
         * @param nodeDir 节点目录
         * @returns 是否存在
         */
        async hasThumbnail(nodeDir) {
            return hasThumbnail(nodeDir);
        }
        /**
         * 获取缩略图路径（按优先级查找存在的缩略图）
         * @param nodeDir 节点目录
         * @returns 缩略图完整路径，如果不存在则返回默认 webp 路径
         */
        getThumbnailPath(nodeDir) {
            const found = findThumbnailSync(nodeDir);
            return found?.path ?? path.join(nodeDir, getThumbnailFileName('webp'));
        }
        /**
         * 查找节点目录中存在的缩略图（按优先级）
         * @param nodeDir 节点目录
         * @returns 找到的缩略图信息，未找到返回 null
         */
        async findThumbnail(nodeDir) {
            return findThumbnail(nodeDir);
        }
        /**
         * 获取配置的缩略图尺寸
         */
        getThumbnailSize() {
            return {
                width: this.width,
                height: this.height,
            };
        }
    };
    __setFunctionName(_classThis, "ThumbnailGenerationService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ThumbnailGenerationService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ThumbnailGenerationService = _classThis;
})();
export { ThumbnailGenerationService };
//# sourceMappingURL=thumbnail-generation.service.js.map