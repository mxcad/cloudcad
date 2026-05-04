///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
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
import { Disk } from 'flydrive';
// @ts-expect-error flydrive 使用 exports 字段，moduleResolution:node 无法解析但运行时正常
import { FSDriver } from 'flydrive/drivers/fs';
/**
 * Flydrive 存储提供者
 *
 * 使用 flydrive 的 FSDriver 实现本地文件系统存储。
 * 文件根目录由环境变量 FILES_DATA_PATH 决定，默认 data/files。
 */
let FlydriveStorageProvider = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FlydriveStorageProvider = _classThis = class {
        constructor(configService) {
            this.configService = configService;
            this.logger = new Logger(FlydriveStorageProvider.name);
            const location = this.configService.get('filesDataPath') || 'data/files';
            this.logger.log(`初始化 Flydrive 本地存储，根目录: ${location}`);
            const driver = new FSDriver({
                location,
                visibility: 'public',
            });
            this.disk = new Disk(driver);
            this.logger.log('Flydrive 本地存储初始化完成');
        }
        async exists(key) {
            return this.disk.exists(key);
        }
        existsSync(key) {
            return this.disk.driver.existsSync(key);
        }
        async get(key) {
            return this.disk.get(key);
        }
        async getBytes(key) {
            return this.disk.getBytes(key);
        }
        async getStream(key) {
            return this.disk.getStream(key);
        }
        async getMetaData(key) {
            const meta = await this.disk.getMetaData(key);
            return {
                contentLength: meta.contentLength || 0,
                contentType: meta.contentType || 'application/octet-stream',
                lastModified: meta.lastModified || new Date(),
                etag: meta.etag || '',
            };
        }
        async put(key, contents) {
            // flydrive put requires Uint8Array or string
            if (typeof contents === 'string') {
                await this.disk.put(key, contents);
            }
            else {
                await this.disk.put(key, contents);
            }
        }
        async putStream(key, contents) {
            await this.disk.putStream(key, contents);
        }
        async copy(source, destination) {
            await this.disk.copy(source, destination);
        }
        async move(source, destination) {
            await this.disk.move(source, destination);
        }
        async delete(key) {
            await this.disk.delete(key);
        }
        async deleteAll(prefix) {
            await this.disk.deleteAll(prefix);
        }
        async getUrl(key) {
            return this.disk.getUrl(key);
        }
        async listAll(prefix, options) {
            const result = await this.disk.listAll(prefix, options);
            const objects = [];
            for (const obj of result.objects) {
                objects.push({
                    name: obj.name,
                    isFile: obj.isFile,
                });
            }
            return { objects };
        }
        /**
         * 从根目录外部复制文件到存储（用于上传场景）
         */
        async copyFromFs(sourcePath, destinationKey) {
            const fs = await import('fs');
            const content = await fs.promises.readFile(sourcePath);
            await this.put(destinationKey, new Uint8Array(content));
        }
    };
    __setFunctionName(_classThis, "FlydriveStorageProvider");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FlydriveStorageProvider = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FlydriveStorageProvider = _classThis;
})();
export { FlydriveStorageProvider };
//# sourceMappingURL=flydrive-storage.provider.js.map