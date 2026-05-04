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
import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';
/**
 * 上传文件请求体 DTO
 */
let UploadFilesDto = (() => {
    var _a;
    let _file_decorators;
    let _file_initializers = [];
    let _file_extraInitializers = [];
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
    let _nodeId_decorators;
    let _nodeId_initializers = [];
    let _nodeId_extraInitializers = [];
    let _srcDwgNodeId_decorators;
    let _srcDwgNodeId_initializers = [];
    let _srcDwgNodeId_extraInitializers = [];
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _lastModifiedDate_decorators;
    let _lastModifiedDate_initializers = [];
    let _lastModifiedDate_extraInitializers = [];
    let _conflictStrategy_decorators;
    let _conflictStrategy_initializers = [];
    let _conflictStrategy_extraInitializers = [];
    return _a = class UploadFilesDto {
            constructor() {
                this.file = __runInitializers(this, _file_initializers, void 0);
                this.hash = (__runInitializers(this, _file_extraInitializers), __runInitializers(this, _hash_initializers, void 0));
                this.name = (__runInitializers(this, _hash_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.size = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _size_initializers, void 0));
                this.chunk = (__runInitializers(this, _size_extraInitializers), __runInitializers(this, _chunk_initializers, void 0));
                this.chunks = (__runInitializers(this, _chunk_extraInitializers), __runInitializers(this, _chunks_initializers, void 0));
                this.nodeId = (__runInitializers(this, _chunks_extraInitializers), __runInitializers(this, _nodeId_initializers, void 0));
                this.srcDwgNodeId = (__runInitializers(this, _nodeId_extraInitializers), __runInitializers(this, _srcDwgNodeId_initializers, void 0));
                this.id = (__runInitializers(this, _srcDwgNodeId_extraInitializers), __runInitializers(this, _id_initializers, void 0));
                this.type = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _type_initializers, void 0));
                this.lastModifiedDate = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _lastModifiedDate_initializers, void 0));
                this.conflictStrategy = (__runInitializers(this, _lastModifiedDate_extraInitializers), __runInitializers(this, _conflictStrategy_initializers, void 0));
                __runInitializers(this, _conflictStrategy_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _file_decorators = [ApiProperty({
                    description: '上传的文件',
                    type: 'string',
                    format: 'binary',
                    required: false,
                }), IsOptional()];
            _hash_decorators = [ApiProperty({ description: '文件 MD5 哈希值' }), IsString()];
            _name_decorators = [ApiProperty({ description: '原始文件名' }), IsString()];
            _size_decorators = [ApiProperty({ description: '文件总大小（字节）' }), IsNumber()];
            _chunk_decorators = [ApiProperty({
                    description: '分片索引（分片上传时必填）',
                    required: false,
                }), IsOptional(), IsNumber()];
            _chunks_decorators = [ApiProperty({
                    description: '总分片数量（分片上传时必填）',
                    required: false,
                }), IsOptional(), IsNumber()];
            _nodeId_decorators = [ApiProperty({
                    description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）',
                    required: false,
                }), IsOptional(), IsString()];
            _srcDwgNodeId_decorators = [ApiProperty({
                    description: '源图纸节点 ID（外部参照上传时使用）',
                    required: false,
                }), IsOptional(), IsString()];
            _id_decorators = [ApiProperty({
                    description: '文件ID（前端传递的标识符）',
                    required: false,
                }), IsOptional(), IsString()];
            _type_decorators = [ApiProperty({
                    description: '文件类型（如 dwg、dxf）',
                    required: false,
                }), IsOptional(), IsString()];
            _lastModifiedDate_decorators = [ApiProperty({
                    description: '文件最后修改日期',
                    required: false,
                }), IsOptional(), IsString()];
            _conflictStrategy_decorators = [ApiProperty({
                    description: '冲突策略：skip（跳过）/ overwrite（覆盖）/ rename（重命名，默认）',
                    required: false,
                    enum: ['skip', 'overwrite', 'rename'],
                }), IsOptional(), IsIn(['skip', 'overwrite', 'rename'])];
            __esDecorate(null, null, _file_decorators, { kind: "field", name: "file", static: false, private: false, access: { has: obj => "file" in obj, get: obj => obj.file, set: (obj, value) => { obj.file = value; } }, metadata: _metadata }, _file_initializers, _file_extraInitializers);
            __esDecorate(null, null, _hash_decorators, { kind: "field", name: "hash", static: false, private: false, access: { has: obj => "hash" in obj, get: obj => obj.hash, set: (obj, value) => { obj.hash = value; } }, metadata: _metadata }, _hash_initializers, _hash_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _size_decorators, { kind: "field", name: "size", static: false, private: false, access: { has: obj => "size" in obj, get: obj => obj.size, set: (obj, value) => { obj.size = value; } }, metadata: _metadata }, _size_initializers, _size_extraInitializers);
            __esDecorate(null, null, _chunk_decorators, { kind: "field", name: "chunk", static: false, private: false, access: { has: obj => "chunk" in obj, get: obj => obj.chunk, set: (obj, value) => { obj.chunk = value; } }, metadata: _metadata }, _chunk_initializers, _chunk_extraInitializers);
            __esDecorate(null, null, _chunks_decorators, { kind: "field", name: "chunks", static: false, private: false, access: { has: obj => "chunks" in obj, get: obj => obj.chunks, set: (obj, value) => { obj.chunks = value; } }, metadata: _metadata }, _chunks_initializers, _chunks_extraInitializers);
            __esDecorate(null, null, _nodeId_decorators, { kind: "field", name: "nodeId", static: false, private: false, access: { has: obj => "nodeId" in obj, get: obj => obj.nodeId, set: (obj, value) => { obj.nodeId = value; } }, metadata: _metadata }, _nodeId_initializers, _nodeId_extraInitializers);
            __esDecorate(null, null, _srcDwgNodeId_decorators, { kind: "field", name: "srcDwgNodeId", static: false, private: false, access: { has: obj => "srcDwgNodeId" in obj, get: obj => obj.srcDwgNodeId, set: (obj, value) => { obj.srcDwgNodeId = value; } }, metadata: _metadata }, _srcDwgNodeId_initializers, _srcDwgNodeId_extraInitializers);
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _lastModifiedDate_decorators, { kind: "field", name: "lastModifiedDate", static: false, private: false, access: { has: obj => "lastModifiedDate" in obj, get: obj => obj.lastModifiedDate, set: (obj, value) => { obj.lastModifiedDate = value; } }, metadata: _metadata }, _lastModifiedDate_initializers, _lastModifiedDate_extraInitializers);
            __esDecorate(null, null, _conflictStrategy_decorators, { kind: "field", name: "conflictStrategy", static: false, private: false, access: { has: obj => "conflictStrategy" in obj, get: obj => obj.conflictStrategy, set: (obj, value) => { obj.conflictStrategy = value; } }, metadata: _metadata }, _conflictStrategy_initializers, _conflictStrategy_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadFilesDto };
//# sourceMappingURL=upload-files.dto.js.map