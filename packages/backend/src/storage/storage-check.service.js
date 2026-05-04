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
import { promises as fs } from 'fs';
import path from 'path';
/**
 * 存储检查服务
 * 用于检查文件是否存在于不同存储位置
 */
let StorageCheckService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StorageCheckService = _classThis = class {
        constructor(configService, storageService) {
            this.configService = configService;
            this.storageService = storageService;
            this.logger = new Logger(StorageCheckService.name);
        }
        /**
         * 检查文件是否存在于本地存储
         * @param key 存储键名
         * @returns 是否存在
         */
        async checkInStorage(key) {
            try {
                return await this.storageService.fileExists(key);
            }
            catch (error) {
                this.logger.error(`检查存储文件失败: ${key}`, error);
                return false;
            }
        }
        /**
         * 检查文件是否存在于本地文件系统
         * @param filePath 文件路径
         * @returns 是否存在
         */
        async checkInLocal(filePath) {
            try {
                await fs.access(filePath, fs.constants.F_OK);
                return true;
            }
            catch {
                return false;
            }
        }
        /**
         * 检查文件是否存在于任何位置（存储或本地）
         * @param key 存储键名或文件路径
         * @returns 是否存在
         */
        async checkInAny(key) {
            // 先检查本地
            if (await this.checkInLocal(key)) {
                return true;
            }
            // 再检查存储
            return await this.checkInStorage(key);
        }
        /**
         * 检查文件是否存在于指定本地目录
         * @param fileName 文件名
         * @param directory 目录路径
         * @returns 是否存在
         */
        async checkInLocalDirectory(fileName, directory) {
            const filePath = path.join(directory, fileName);
            return await this.checkInLocal(filePath);
        }
        /**
         * 检查文件是否存在于上传临时目录
         * @param fileName 文件名
         * @returns 是否存在
         */
        async checkInUploadTemp(fileName) {
            const uploadTempPath = this.configService.get('mxcadUploadPath', '../../uploads');
            return await this.checkInLocalDirectory(fileName, uploadTempPath);
        }
        /**
         * 检查文件是否存在于转换目录
         * @param fileName 文件名
         * @returns 是否存在
         */
        async checkInConvertDirectory(fileName) {
            const tempPath = this.configService.get('mxcadTempPath', '../../temp');
            return await this.checkInLocalDirectory(fileName, tempPath);
        }
    };
    __setFunctionName(_classThis, "StorageCheckService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        StorageCheckService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return StorageCheckService = _classThis;
})();
export { StorageCheckService };
//# sourceMappingURL=storage-check.service.js.map