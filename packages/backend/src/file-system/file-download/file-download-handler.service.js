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
import { Injectable, Logger, NotFoundException, ForbiddenException, } from '@nestjs/common';
/**
 * 文件下载处理服务
 *
 * 统一处理项目文件、公共资源库文件的下载响应
 * 支持 ETag 缓存、流式传输、错误处理和日志记录
 */
let FileDownloadHandlerService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileDownloadHandlerService = _classThis = class {
        constructor(fileSystemService) {
            this.fileSystemService = fileSystemService;
            this.logger = new Logger(FileDownloadHandlerService.name);
        }
        /**
         * 统一处理下载响应
         * @param nodeId 节点 ID
         * @param userId 用户 ID
         * @param res Express Response 对象
         * @param options 可选配置
         */
        async handleDownload(nodeId, userId, res, options) {
            const clientIp = options?.clientIp || 'unknown';
            try {
                // 1. 调用 Service 获取文件流
                const { stream, filename, mimeType } = await this.fileSystemService.downloadNode(nodeId, userId);
                // 2. 设置 Content-Type
                res.setHeader('Content-Type', mimeType);
                // 3. 设置 Content-Disposition（支持中文文件名）
                const encodedFilename = encodeURIComponent(filename);
                // eslint-disable-next-line no-control-regex
                const fallbackFilename = filename.replace(/[^\x00-\x7F]/g, '_');
                res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`);
                // 4. 设置 ETag 和 Cache-Control
                const node = await this.fileSystemService.getNode(nodeId);
                if (node && !node.isFolder && (node.fileHash || node.id)) {
                    const etag = `"${node.fileHash || node.id}"`;
                    res.setHeader('ETag', etag);
                    // 检查 If-None-Match（304 缓存命中）
                    const ifNoneMatch = res.req?.headers['if-none-match'];
                    if (ifNoneMatch === etag) {
                        if (typeof stream
                            .destroy === 'function') {
                            stream.destroy();
                        }
                        res.status(304).end();
                        this.logger.log(`缓存命中: ${filename} (${nodeId}) by user ${userId}`);
                        return;
                    }
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                }
                else {
                    // 对于动态生成的 ZIP，禁用缓存
                    res.setHeader('Cache-Control', 'no-cache');
                }
                // 5. 记录下载开始
                this.logger.log(`下载开始: ${filename} (${nodeId}) by user ${userId} from IP ${clientIp}`);
                // 6. 开始流式传输
                stream.pipe(res);
                // 7. 错误处理
                stream.on('error', (error) => {
                    this.logger.error(`文件流传输错误: ${error.message}`, error.stack);
                    // 清理资源
                    if (typeof stream
                        .destroy === 'function') {
                        stream.destroy();
                    }
                    if (!res.headersSent) {
                        res.status(500).json({ message: '文件下载失败' });
                    }
                    else if (!res.writableEnded) {
                        // 如果响应已发送但未结束，尝试结束响应
                        res.end();
                    }
                });
                // 8. 记录下载完成
                stream.on('finish', () => {
                    this.logger.log(`下载完成: ${filename} (${nodeId}) by user ${userId}, size: ${node?.size || 0} bytes`);
                });
            }
            catch (error) {
                this.logger.error(`下载失败: ${nodeId} by user ${userId} - ${error.message}`, error.stack);
                if (!res.headersSent) {
                    const status = error instanceof NotFoundException
                        ? 404
                        : error instanceof ForbiddenException
                            ? 403
                            : 500;
                    const errorMessage = error instanceof Error ? error.message : '文件下载失败';
                    res.status(status).json({
                        message: errorMessage,
                    });
                }
            }
        }
    };
    __setFunctionName(_classThis, "FileDownloadHandlerService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileDownloadHandlerService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileDownloadHandlerService = _classThis;
})();
export { FileDownloadHandlerService };
//# sourceMappingURL=file-download-handler.service.js.map