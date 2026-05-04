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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, IsOptional, IsEnum, } from 'class-validator';
/**
 * 检查文件是否存在请求 DTO
 */
let CheckFileExistDto = (() => {
    var _a;
    let _fileHash_decorators;
    let _fileHash_initializers = [];
    let _fileHash_extraInitializers = [];
    let _filename_decorators;
    let _filename_initializers = [];
    let _filename_extraInitializers = [];
    let _nodeId_decorators;
    let _nodeId_initializers = [];
    let _nodeId_extraInitializers = [];
    let _fileSize_decorators;
    let _fileSize_initializers = [];
    let _fileSize_extraInitializers = [];
    let _conflictStrategy_decorators;
    let _conflictStrategy_initializers = [];
    let _conflictStrategy_extraInitializers = [];
    return _a = class CheckFileExistDto {
            constructor() {
                this.fileHash = __runInitializers(this, _fileHash_initializers, void 0);
                this.filename = (__runInitializers(this, _fileHash_extraInitializers), __runInitializers(this, _filename_initializers, void 0));
                this.nodeId = (__runInitializers(this, _filename_extraInitializers), __runInitializers(this, _nodeId_initializers, void 0));
                this.fileSize = (__runInitializers(this, _nodeId_extraInitializers), __runInitializers(this, _fileSize_initializers, void 0));
                this.conflictStrategy = (__runInitializers(this, _fileSize_extraInitializers), __runInitializers(this, _conflictStrategy_initializers, void 0));
                __runInitializers(this, _conflictStrategy_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _fileHash_decorators = [ApiProperty({
                    description: '文件 MD5 哈希值',
                    example: '25e89b5adf19984330f4e68b0f99db64',
                }), IsString(), IsNotEmpty()];
            _filename_decorators = [ApiProperty({
                    description: '原始文件名',
                    example: 'drawing.dwg',
                }), IsString(), IsNotEmpty()];
            _nodeId_decorators = [ApiProperty({
                    description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）',
                    example: 'clx1234567890',
                }), IsString(), IsNotEmpty()];
            _fileSize_decorators = [ApiProperty({
                    description: '文件大小（字节）',
                    example: 1024567,
                }), IsNumber(), IsNotEmpty()];
            _conflictStrategy_decorators = [ApiPropertyOptional({
                    description: '冲突处理策略',
                    enum: ['skip', 'overwrite', 'rename'],
                    default: 'rename',
                }), IsEnum(['skip', 'overwrite', 'rename']), IsOptional()];
            __esDecorate(null, null, _fileHash_decorators, { kind: "field", name: "fileHash", static: false, private: false, access: { has: obj => "fileHash" in obj, get: obj => obj.fileHash, set: (obj, value) => { obj.fileHash = value; } }, metadata: _metadata }, _fileHash_initializers, _fileHash_extraInitializers);
            __esDecorate(null, null, _filename_decorators, { kind: "field", name: "filename", static: false, private: false, access: { has: obj => "filename" in obj, get: obj => obj.filename, set: (obj, value) => { obj.filename = value; } }, metadata: _metadata }, _filename_initializers, _filename_extraInitializers);
            __esDecorate(null, null, _nodeId_decorators, { kind: "field", name: "nodeId", static: false, private: false, access: { has: obj => "nodeId" in obj, get: obj => obj.nodeId, set: (obj, value) => { obj.nodeId = value; } }, metadata: _metadata }, _nodeId_initializers, _nodeId_extraInitializers);
            __esDecorate(null, null, _fileSize_decorators, { kind: "field", name: "fileSize", static: false, private: false, access: { has: obj => "fileSize" in obj, get: obj => obj.fileSize, set: (obj, value) => { obj.fileSize = value; } }, metadata: _metadata }, _fileSize_initializers, _fileSize_extraInitializers);
            __esDecorate(null, null, _conflictStrategy_decorators, { kind: "field", name: "conflictStrategy", static: false, private: false, access: { has: obj => "conflictStrategy" in obj, get: obj => obj.conflictStrategy, set: (obj, value) => { obj.conflictStrategy = value; } }, metadata: _metadata }, _conflictStrategy_initializers, _conflictStrategy_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CheckFileExistDto };
//# sourceMappingURL=check-file-exist.dto.js.map