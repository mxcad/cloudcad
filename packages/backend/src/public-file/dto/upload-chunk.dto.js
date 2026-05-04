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
import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';
/**
 * 上传分片 DTO
 */
let UploadChunkDto = (() => {
    var _a;
    let _hash_decorators;
    let _hash_initializers = [];
    let _hash_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _size_decorators;
    let _size_initializers = [];
    let _size_extraInitializers = [];
    let _chunk_decorators;
    let _chunk_initializers = [];
    let _chunk_extraInitializers = [];
    let _chunks_decorators;
    let _chunks_initializers = [];
    let _chunks_extraInitializers = [];
    return _a = class UploadChunkDto {
            constructor() {
                this.hash = __runInitializers(this, _hash_initializers, void 0);
                this.name = (__runInitializers(this, _hash_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.size = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _size_initializers, void 0));
                this.chunk = (__runInitializers(this, _size_extraInitializers), __runInitializers(this, _chunk_initializers, void 0));
                this.chunks = (__runInitializers(this, _chunk_extraInitializers), __runInitializers(this, _chunks_initializers, void 0));
                __runInitializers(this, _chunks_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _hash_decorators = [ApiProperty({ description: '文件 MD5 哈希值' }), IsString(), IsNotEmpty()];
            _name_decorators = [ApiProperty({ description: '原始文件名' }), IsString(), IsNotEmpty()];
            _size_decorators = [ApiProperty({ description: '文件总大小（字节）' }), IsNumber(), Min(1)];
            _chunk_decorators = [ApiProperty({ description: '当前分片索引（从 0 开始）' }), IsNumber(), Min(0)];
            _chunks_decorators = [ApiProperty({ description: '总分片数量' }), IsNumber(), Min(1)];
            __esDecorate(null, null, _hash_decorators, { kind: "field", name: "hash", static: false, private: false, access: { has: obj => "hash" in obj, get: obj => obj.hash, set: (obj, value) => { obj.hash = value; } }, metadata: _metadata }, _hash_initializers, _hash_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _size_decorators, { kind: "field", name: "size", static: false, private: false, access: { has: obj => "size" in obj, get: obj => obj.size, set: (obj, value) => { obj.size = value; } }, metadata: _metadata }, _size_initializers, _size_extraInitializers);
            __esDecorate(null, null, _chunk_decorators, { kind: "field", name: "chunk", static: false, private: false, access: { has: obj => "chunk" in obj, get: obj => obj.chunk, set: (obj, value) => { obj.chunk = value; } }, metadata: _metadata }, _chunk_initializers, _chunk_extraInitializers);
            __esDecorate(null, null, _chunks_decorators, { kind: "field", name: "chunks", static: false, private: false, access: { has: obj => "chunks" in obj, get: obj => obj.chunks, set: (obj, value) => { obj.chunks = value; } }, metadata: _metadata }, _chunks_initializers, _chunks_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadChunkDto };
/**
 * 合并分片 DTO
 */
let MergeChunksDto = (() => {
    var _a;
    let _hash_decorators;
    let _hash_initializers = [];
    let _hash_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _size_decorators;
    let _size_initializers = [];
    let _size_extraInitializers = [];
    let _chunks_decorators;
    let _chunks_initializers = [];
    let _chunks_extraInitializers = [];
    return _a = class MergeChunksDto {
            constructor() {
                this.hash = __runInitializers(this, _hash_initializers, void 0);
                this.name = (__runInitializers(this, _hash_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.size = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _size_initializers, void 0));
                this.chunks = (__runInitializers(this, _size_extraInitializers), __runInitializers(this, _chunks_initializers, void 0));
                __runInitializers(this, _chunks_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _hash_decorators = [ApiProperty({ description: '文件 MD5 哈希值' }), IsString(), IsNotEmpty()];
            _name_decorators = [ApiProperty({ description: '原始文件名' }), IsString(), IsNotEmpty()];
            _size_decorators = [ApiProperty({ description: '文件总大小（字节）' }), IsNumber(), Min(1)];
            _chunks_decorators = [ApiProperty({ description: '总分片数量' }), IsNumber(), Min(1)];
            __esDecorate(null, null, _hash_decorators, { kind: "field", name: "hash", static: false, private: false, access: { has: obj => "hash" in obj, get: obj => obj.hash, set: (obj, value) => { obj.hash = value; } }, metadata: _metadata }, _hash_initializers, _hash_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _size_decorators, { kind: "field", name: "size", static: false, private: false, access: { has: obj => "size" in obj, get: obj => obj.size, set: (obj, value) => { obj.size = value; } }, metadata: _metadata }, _size_initializers, _size_extraInitializers);
            __esDecorate(null, null, _chunks_decorators, { kind: "field", name: "chunks", static: false, private: false, access: { has: obj => "chunks" in obj, get: obj => obj.chunks, set: (obj, value) => { obj.chunks = value; } }, metadata: _metadata }, _chunks_initializers, _chunks_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { MergeChunksDto };
//# sourceMappingURL=upload-chunk.dto.js.map