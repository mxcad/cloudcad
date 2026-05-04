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
import { IsString, IsNumber, IsOptional } from 'class-validator';
let InitiateMultipartUploadDto = (() => {
    var _a;
    let _fileName_decorators;
    let _fileName_initializers = [];
    let _fileName_extraInitializers = [];
    let _fileSize_decorators;
    let _fileSize_initializers = [];
    let _fileSize_extraInitializers = [];
    let _parentId_decorators;
    let _parentId_initializers = [];
    let _parentId_extraInitializers = [];
    return _a = class InitiateMultipartUploadDto {
            constructor() {
                this.fileName = __runInitializers(this, _fileName_initializers, void 0);
                this.fileSize = (__runInitializers(this, _fileName_extraInitializers), __runInitializers(this, _fileSize_initializers, void 0));
                this.parentId = (__runInitializers(this, _fileSize_extraInitializers), __runInitializers(this, _parentId_initializers, void 0));
                __runInitializers(this, _parentId_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _fileName_decorators = [ApiProperty({ description: '文件名' }), IsString()];
            _fileSize_decorators = [ApiProperty({ description: '文件大小（字节）' }), IsNumber()];
            _parentId_decorators = [ApiProperty({ description: '父节点ID', required: false }), IsString(), IsOptional()];
            __esDecorate(null, null, _fileName_decorators, { kind: "field", name: "fileName", static: false, private: false, access: { has: obj => "fileName" in obj, get: obj => obj.fileName, set: (obj, value) => { obj.fileName = value; } }, metadata: _metadata }, _fileName_initializers, _fileName_extraInitializers);
            __esDecorate(null, null, _fileSize_decorators, { kind: "field", name: "fileSize", static: false, private: false, access: { has: obj => "fileSize" in obj, get: obj => obj.fileSize, set: (obj, value) => { obj.fileSize = value; } }, metadata: _metadata }, _fileSize_initializers, _fileSize_extraInitializers);
            __esDecorate(null, null, _parentId_decorators, { kind: "field", name: "parentId", static: false, private: false, access: { has: obj => "parentId" in obj, get: obj => obj.parentId, set: (obj, value) => { obj.parentId = value; } }, metadata: _metadata }, _parentId_initializers, _parentId_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { InitiateMultipartUploadDto };
let UploadChunkDto = (() => {
    var _a;
    let _uploadId_decorators;
    let _uploadId_initializers = [];
    let _uploadId_extraInitializers = [];
    let _chunkIndex_decorators;
    let _chunkIndex_initializers = [];
    let _chunkIndex_extraInitializers = [];
    let _chunkData_decorators;
    let _chunkData_initializers = [];
    let _chunkData_extraInitializers = [];
    return _a = class UploadChunkDto {
            constructor() {
                this.uploadId = __runInitializers(this, _uploadId_initializers, void 0);
                this.chunkIndex = (__runInitializers(this, _uploadId_extraInitializers), __runInitializers(this, _chunkIndex_initializers, void 0));
                this.chunkData = (__runInitializers(this, _chunkIndex_extraInitializers), __runInitializers(this, _chunkData_initializers, void 0));
                __runInitializers(this, _chunkData_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _uploadId_decorators = [ApiProperty({ description: '上传会话ID' }), IsString()];
            _chunkIndex_decorators = [ApiProperty({ description: '分片索引（从0开始）' }), IsNumber()];
            _chunkData_decorators = [ApiProperty({ description: '分片数据（base64编码）' }), IsString()];
            __esDecorate(null, null, _uploadId_decorators, { kind: "field", name: "uploadId", static: false, private: false, access: { has: obj => "uploadId" in obj, get: obj => obj.uploadId, set: (obj, value) => { obj.uploadId = value; } }, metadata: _metadata }, _uploadId_initializers, _uploadId_extraInitializers);
            __esDecorate(null, null, _chunkIndex_decorators, { kind: "field", name: "chunkIndex", static: false, private: false, access: { has: obj => "chunkIndex" in obj, get: obj => obj.chunkIndex, set: (obj, value) => { obj.chunkIndex = value; } }, metadata: _metadata }, _chunkIndex_initializers, _chunkIndex_extraInitializers);
            __esDecorate(null, null, _chunkData_decorators, { kind: "field", name: "chunkData", static: false, private: false, access: { has: obj => "chunkData" in obj, get: obj => obj.chunkData, set: (obj, value) => { obj.chunkData = value; } }, metadata: _metadata }, _chunkData_initializers, _chunkData_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadChunkDto };
let CompleteMultipartUploadDto = (() => {
    var _a;
    let _uploadId_decorators;
    let _uploadId_initializers = [];
    let _uploadId_extraInitializers = [];
    let _parts_decorators;
    let _parts_initializers = [];
    let _parts_extraInitializers = [];
    return _a = class CompleteMultipartUploadDto {
            constructor() {
                this.uploadId = __runInitializers(this, _uploadId_initializers, void 0);
                this.parts = (__runInitializers(this, _uploadId_extraInitializers), __runInitializers(this, _parts_initializers, void 0));
                __runInitializers(this, _parts_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _uploadId_decorators = [ApiProperty({ description: '上传会话ID' }), IsString()];
            _parts_decorators = [ApiProperty({
                    description: '分片信息',
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            partNumber: { type: 'number' },
                            etag: { type: 'string' },
                        },
                    },
                })];
            __esDecorate(null, null, _uploadId_decorators, { kind: "field", name: "uploadId", static: false, private: false, access: { has: obj => "uploadId" in obj, get: obj => obj.uploadId, set: (obj, value) => { obj.uploadId = value; } }, metadata: _metadata }, _uploadId_initializers, _uploadId_extraInitializers);
            __esDecorate(null, null, _parts_decorators, { kind: "field", name: "parts", static: false, private: false, access: { has: obj => "parts" in obj, get: obj => obj.parts, set: (obj, value) => { obj.parts = value; } }, metadata: _metadata }, _parts_initializers, _parts_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CompleteMultipartUploadDto };
let UploadProgressDto = (() => {
    var _a;
    let _uploadId_decorators;
    let _uploadId_initializers = [];
    let _uploadId_extraInitializers = [];
    return _a = class UploadProgressDto {
            constructor() {
                this.uploadId = __runInitializers(this, _uploadId_initializers, void 0);
                __runInitializers(this, _uploadId_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _uploadId_decorators = [ApiProperty({ description: '上传会话ID' }), IsString()];
            __esDecorate(null, null, _uploadId_decorators, { kind: "field", name: "uploadId", static: false, private: false, access: { has: obj => "uploadId" in obj, get: obj => obj.uploadId, set: (obj, value) => { obj.uploadId = value; } }, metadata: _metadata }, _uploadId_initializers, _uploadId_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadProgressDto };
//# sourceMappingURL=multipart-upload.dto.js.map