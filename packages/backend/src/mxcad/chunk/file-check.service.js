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
/**
 * 文件检查服务
 * 负责检查文件是否存在、是否已存储等操作
 */
let FileCheckService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileCheckService = _classThis = class {
        constructor(storageCheckService, concurrencyManager) {
            this.storageCheckService = storageCheckService;
            this.concurrencyManager = concurrencyManager;
            this.logger = new Logger(FileCheckService.name);
        }
        /**
         * 检查文件是否存在（带并发控制）
         * @param hash 文件哈希值
         * @param filename 文件名
         * @returns 文件是否存在
         */
        async checkFileExists(hash, filename) {
            return this.concurrencyManager.acquireLock(`file-check:${hash}`, () => this.performFileExistenceCheck(hash, filename));
        }
        /**
         * 检查文件是否已存储
         * @param hash 文件哈希值
         * @param filename 文件名
         * @returns 文件是否已存储
         */
        async checkFileInStorage(hash, filename) {
            try {
                const convertedExt = this.getConvertedExtension(filename);
                const convertedFilename = `${hash}${convertedExt}`;
                return await this.storageCheckService.checkInAny(convertedFilename);
            }
            catch (error) {
                this.logger.error(`检查文件存储失败: ${hash}`, error);
                return false;
            }
        }
        /**
         * 执行文件存在性检查（内部方法）
         * @param hash 文件哈希值
         * @param filename 文件名
         * @returns 文件是否存在
         */
        async performFileExistenceCheck(hash, filename) {
            try {
                const exists = await this.checkFileInStorage(hash, filename);
                if (exists) {
                    this.logger.log(`文件已存在: ${hash} (${filename})`);
                }
                return exists;
            }
            catch (error) {
                this.logger.error(`文件存在性检查失败: ${hash}`, error);
                return false;
            }
        }
        /**
         * 获取转换后的文件扩展名
         * @param filename 原始文件名
         * @returns 转换后的扩展名
         */
        getConvertedExtension(filename) {
            const ext = path.extname(filename).toLowerCase();
            // 根据 MxCAD 转换规则返回对应的扩展名
            const conversionMap = {
                '.dwg': '.dwg',
                '.dxf': '.dxf',
                '.pdf': '.pdf',
                // 可以根据需要添加更多转换规则
            };
            return conversionMap[ext] || ext;
        }
    };
    __setFunctionName(_classThis, "FileCheckService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileCheckService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileCheckService = _classThis;
})();
export { FileCheckService };
//# sourceMappingURL=file-check.service.js.map