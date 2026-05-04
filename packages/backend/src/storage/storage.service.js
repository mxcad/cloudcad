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
import * as fs from 'fs';
import * as path from 'path';
let StorageService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StorageService = _classThis = class {
        constructor(storageProvider, configService) {
            this.storageProvider = storageProvider;
            this.configService = configService;
            this.logger = new Logger(StorageService.name);
            this.filesDataPath = this.configService.get('filesDataPath', {
                infer: true,
            });
        }
        /**
         * 检查文件是否存在
         */
        async fileExists(key) {
            return this.storageProvider.exists(key);
        }
        /**
         * 获取文件流
         */
        async getFileStream(key) {
            return this.storageProvider.getStream(key);
        }
        /**
         * 获取文件信息
         */
        async getFileInfo(key) {
            try {
                const meta = await this.storageProvider.getMetaData(key);
                return {
                    contentType: meta.contentType || 'application/octet-stream',
                    contentLength: meta.contentLength || 0,
                };
            }
            catch (error) {
                this.logger.error(`获取文件信息失败: ${key}`, error);
                return null;
            }
        }
        async healthCheck() {
            try {
                const resolvedPath = path.resolve(this.filesDataPath);
                const exists = fs.existsSync(resolvedPath);
                if (!exists) {
                    return {
                        status: 'unhealthy',
                        message: `存储目录不存在: ${resolvedPath}`,
                    };
                }
                try {
                    fs.accessSync(resolvedPath, fs.constants.W_OK);
                }
                catch (error) {
                    return {
                        status: 'unhealthy',
                        message: `存储目录不可写: ${resolvedPath}`,
                    };
                }
                return {
                    status: 'healthy',
                    message: '本地存储服务正常',
                };
            }
            catch (error) {
                this.logger.error('存储服务健康检查失败:', error);
                return {
                    status: 'unhealthy',
                    message: `存储服务不可用: ${error.message}`,
                };
            }
        }
        /**
         * 列出指定路径下的文件
         */
        async listFiles(prefix, startsWith) {
            const result = await this.storageProvider.listAll(prefix);
            let files = result.objects.filter((o) => o.isFile).map((o) => o.name);
            if (startsWith) {
                files = files.filter((f) => f.startsWith(startsWith));
            }
            return files;
        }
        /**
         * 删除文件
         */
        async deleteFile(key) {
            return this.storageProvider.delete(key);
        }
        /**
         * 递归删除目录及内容
         */
        async deleteAll(prefix) {
            return this.storageProvider.deleteAll(prefix);
        }
        /**
         * 复制文件（存储内）
         */
        async copyFile(source, destination) {
            return this.storageProvider.copy(source, destination);
        }
        /**
         * 移动文件（存储内）
         */
        async moveFile(source, destination) {
            return this.storageProvider.move(source, destination);
        }
        /**
         * 写入文件（字符串或字节）
         */
        async writeFile(key, contents) {
            return this.storageProvider.put(key, contents);
        }
        /**
         * 写入文件（流）
         */
        async writeStream(key, contents) {
            return this.storageProvider.putStream(key, contents);
        }
        /**
         * 从外部文件系统复制文件到存储
         */
        async copyFromFs(sourcePath, destinationKey) {
            return this.storageProvider.copyFromFs(sourcePath, destinationKey);
        }
        /**
         * 获取文件内容（字符串）
         */
        async getFile(key) {
            return this.storageProvider.get(key);
        }
        /**
         * 获取文件内容（字节数组）
         */
        async getFileBytes(key) {
            return this.storageProvider.getBytes(key);
        }
        /**
         * 获取文件公开 URL
         */
        async getUrl(key) {
            return this.storageProvider.getUrl(key);
        }
        /**
         * 获取 IStorageProvider 原始实例（用于需要直接调用的场景）
         */
        getProvider() {
            return this.storageProvider;
        }
    };
    __setFunctionName(_classThis, "StorageService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        StorageService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return StorageService = _classThis;
})();
export { StorageService };
//# sourceMappingURL=storage.service.js.map