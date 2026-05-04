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
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
/**
 * 检查文件是否存在的 DTO（秒传检查）
 */
let CheckFileDto = (() => {
    var _a;
    let _filename_decorators;
    let _filename_initializers = [];
    let _filename_extraInitializers = [];
    let _fileHash_decorators;
    let _fileHash_initializers = [];
    let _fileHash_extraInitializers = [];
    return _a = class CheckFileDto {
            constructor() {
                /** 文件名 */
                this.filename = __runInitializers(this, _filename_initializers, void 0);
                /** 文件 MD5 哈希 */
                this.fileHash = (__runInitializers(this, _filename_extraInitializers), __runInitializers(this, _fileHash_initializers, void 0));
                __runInitializers(this, _fileHash_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _filename_decorators = [IsString(), IsNotEmpty(), ApiProperty({ description: '文件名' })];
            _fileHash_decorators = [IsString(), IsNotEmpty(), ApiProperty({ description: '文件 MD5 哈希' })];
            __esDecorate(null, null, _filename_decorators, { kind: "field", name: "filename", static: false, private: false, access: { has: obj => "filename" in obj, get: obj => obj.filename, set: (obj, value) => { obj.filename = value; } }, metadata: _metadata }, _filename_initializers, _filename_extraInitializers);
            __esDecorate(null, null, _fileHash_decorators, { kind: "field", name: "fileHash", static: false, private: false, access: { has: obj => "fileHash" in obj, get: obj => obj.fileHash, set: (obj, value) => { obj.fileHash = value; } }, metadata: _metadata }, _fileHash_initializers, _fileHash_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CheckFileDto };
/**
 * 文件存在检查响应 DTO
 */
let CheckFileResponseDto = (() => {
    var _a;
    let _exist_decorators;
    let _exist_initializers = [];
    let _exist_extraInitializers = [];
    let _hash_decorators;
    let _hash_initializers = [];
    let _hash_extraInitializers = [];
    let _fileName_decorators;
    let _fileName_initializers = [];
    let _fileName_extraInitializers = [];
    return _a = class CheckFileResponseDto {
            constructor() {
                /** 文件是否已存在 */
                this.exist = __runInitializers(this, _exist_initializers, void 0);
                /** 如果存在，返回文件哈希 */
                this.hash = (__runInitializers(this, _exist_extraInitializers), __runInitializers(this, _hash_initializers, void 0));
                /** 原始文件名 */
                this.fileName = (__runInitializers(this, _hash_extraInitializers), __runInitializers(this, _fileName_initializers, void 0));
                __runInitializers(this, _fileName_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _exist_decorators = [ApiProperty({ description: '文件是否已存在' })];
            _hash_decorators = [ApiPropertyOptional({ description: '文件哈希' })];
            _fileName_decorators = [ApiPropertyOptional({ description: '原始文件名' })];
            __esDecorate(null, null, _exist_decorators, { kind: "field", name: "exist", static: false, private: false, access: { has: obj => "exist" in obj, get: obj => obj.exist, set: (obj, value) => { obj.exist = value; } }, metadata: _metadata }, _exist_initializers, _exist_extraInitializers);
            __esDecorate(null, null, _hash_decorators, { kind: "field", name: "hash", static: false, private: false, access: { has: obj => "hash" in obj, get: obj => obj.hash, set: (obj, value) => { obj.hash = value; } }, metadata: _metadata }, _hash_initializers, _hash_extraInitializers);
            __esDecorate(null, null, _fileName_decorators, { kind: "field", name: "fileName", static: false, private: false, access: { has: obj => "fileName" in obj, get: obj => obj.fileName, set: (obj, value) => { obj.fileName = value; } }, metadata: _metadata }, _fileName_initializers, _fileName_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CheckFileResponseDto };
//# sourceMappingURL=check-file.dto.js.map