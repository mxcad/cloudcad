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
import { ApiProperty } from '@nestjs/swagger';
/**
 * 检查分片响应 DTO
 */
let CheckChunkResponseDto = (() => {
    var _a;
    let _exist_decorators;
    let _exist_initializers = [];
    let _exist_extraInitializers = [];
    return _a = class CheckChunkResponseDto {
            constructor() {
                this.exist = __runInitializers(this, _exist_initializers, void 0);
                __runInitializers(this, _exist_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _exist_decorators = [ApiProperty({ description: '分片是否存在' })];
            __esDecorate(null, null, _exist_decorators, { kind: "field", name: "exist", static: false, private: false, access: { has: obj => "exist" in obj, get: obj => obj.exist, set: (obj, value) => { obj.exist = value; } }, metadata: _metadata }, _exist_initializers, _exist_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CheckChunkResponseDto };
/**
 * 上传分片响应 DTO
 */
let UploadChunkResponseDto = (() => {
    var _a;
    let _ret_decorators;
    let _ret_initializers = [];
    let _ret_extraInitializers = [];
    let _isLastChunk_decorators;
    let _isLastChunk_initializers = [];
    let _isLastChunk_extraInitializers = [];
    return _a = class UploadChunkResponseDto {
            constructor() {
                this.ret = __runInitializers(this, _ret_initializers, void 0);
                this.isLastChunk = (__runInitializers(this, _ret_extraInitializers), __runInitializers(this, _isLastChunk_initializers, void 0));
                __runInitializers(this, _isLastChunk_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _ret_decorators = [ApiProperty({ description: '上传结果', example: 'success' })];
            _isLastChunk_decorators = [ApiProperty({ description: '是否为最后一个分片', required: false })];
            __esDecorate(null, null, _ret_decorators, { kind: "field", name: "ret", static: false, private: false, access: { has: obj => "ret" in obj, get: obj => obj.ret, set: (obj, value) => { obj.ret = value; } }, metadata: _metadata }, _ret_initializers, _ret_extraInitializers);
            __esDecorate(null, null, _isLastChunk_decorators, { kind: "field", name: "isLastChunk", static: false, private: false, access: { has: obj => "isLastChunk" in obj, get: obj => obj.isLastChunk, set: (obj, value) => { obj.isLastChunk = value; } }, metadata: _metadata }, _isLastChunk_initializers, _isLastChunk_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadChunkResponseDto };
/**
 * 合并完成响应 DTO（返回文件信息）
 */
let MergeCompleteResponseDto = (() => {
    var _a;
    let _ret_decorators;
    let _ret_initializers = [];
    let _ret_extraInitializers = [];
    let _hash_decorators;
    let _hash_initializers = [];
    let _hash_extraInitializers = [];
    let _fileName_decorators;
    let _fileName_initializers = [];
    let _fileName_extraInitializers = [];
    return _a = class MergeCompleteResponseDto {
            constructor() {
                this.ret = __runInitializers(this, _ret_initializers, void 0);
                this.hash = (__runInitializers(this, _ret_extraInitializers), __runInitializers(this, _hash_initializers, void 0));
                this.fileName = (__runInitializers(this, _hash_extraInitializers), __runInitializers(this, _fileName_initializers, void 0));
                __runInitializers(this, _fileName_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _ret_decorators = [ApiProperty({ description: '操作结果', example: 'success' })];
            _hash_decorators = [ApiProperty({ description: '文件哈希' })];
            _fileName_decorators = [ApiProperty({ description: '原始文件名' })];
            __esDecorate(null, null, _ret_decorators, { kind: "field", name: "ret", static: false, private: false, access: { has: obj => "ret" in obj, get: obj => obj.ret, set: (obj, value) => { obj.ret = value; } }, metadata: _metadata }, _ret_initializers, _ret_extraInitializers);
            __esDecorate(null, null, _hash_decorators, { kind: "field", name: "hash", static: false, private: false, access: { has: obj => "hash" in obj, get: obj => obj.hash, set: (obj, value) => { obj.hash = value; } }, metadata: _metadata }, _hash_initializers, _hash_extraInitializers);
            __esDecorate(null, null, _fileName_decorators, { kind: "field", name: "fileName", static: false, private: false, access: { has: obj => "fileName" in obj, get: obj => obj.fileName, set: (obj, value) => { obj.fileName = value; } }, metadata: _metadata }, _fileName_initializers, _fileName_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { MergeCompleteResponseDto };
//# sourceMappingURL=public-file-response.dto.js.map