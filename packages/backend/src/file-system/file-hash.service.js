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
import * as crypto from 'crypto';
let FileHashService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FileHashService = _classThis = class {
        constructor() {
            this.logger = new Logger(FileHashService.name);
        }
        /**
         * 计算文件的 MD5 哈希值
         * 与 mxcad 系统保持一致
         */
        async calculateHash(buffer) {
            return new Promise((resolve, reject) => {
                try {
                    const hash = crypto.createHash('md5');
                    hash.update(buffer);
                    const hashValue = hash.digest('hex');
                    this.logger.debug(`计算文件 MD5 哈希值成功: ${hashValue.substring(0, 16)}...`);
                    resolve(hashValue);
                }
                catch (error) {
                    this.logger.error(`计算文件 MD5 哈希值失败: ${error.message}`, error.stack);
                    reject(error);
                }
            });
        }
        /**
         * 计算流的哈希值（用于大文件）
         */
        async calculateHashFromStream(stream) {
            return new Promise((resolve, reject) => {
                try {
                    const hash = crypto.createHash('md5');
                    stream.on('data', (chunk) => hash.update(chunk));
                    stream.on('end', () => {
                        const hashValue = hash.digest('hex');
                        this.logger.debug(`计算流 MD5 哈希值成功: ${hashValue.substring(0, 16)}...`);
                        resolve(hashValue);
                    });
                    stream.on('error', reject);
                }
                catch (error) {
                    this.logger.error(`计算流 MD5 哈希值失败: ${error.message}`, error.stack);
                    reject(error);
                }
            });
        }
    };
    __setFunctionName(_classThis, "FileHashService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        FileHashService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return FileHashService = _classThis;
})();
export { FileHashService };
//# sourceMappingURL=file-hash.service.js.map