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
import { IsString, IsOptional } from 'class-validator';
/**
 * 文件上传 DTO
 */
let UploadFileDto = (() => {
    var _a;
    let _fileName_decorators;
    let _fileName_initializers = [];
    let _fileName_extraInitializers = [];
    let _fileContent_decorators;
    let _fileContent_initializers = [];
    let _fileContent_extraInitializers = [];
    let _parentId_decorators;
    let _parentId_initializers = [];
    let _parentId_extraInitializers = [];
    return _a = class UploadFileDto {
            constructor() {
                this.fileName = __runInitializers(this, _fileName_initializers, void 0);
                this.fileContent = (__runInitializers(this, _fileName_extraInitializers), __runInitializers(this, _fileContent_initializers, void 0));
                this.parentId = (__runInitializers(this, _fileContent_extraInitializers), __runInitializers(this, _parentId_initializers, void 0));
                __runInitializers(this, _parentId_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _fileName_decorators = [ApiProperty({ description: '文件名称' }), IsString()];
            _fileContent_decorators = [ApiProperty({ description: '文件内容（base64编码）', required: false }), IsString(), IsOptional()];
            _parentId_decorators = [ApiProperty({ description: '父节点ID' }), IsString()];
            __esDecorate(null, null, _fileName_decorators, { kind: "field", name: "fileName", static: false, private: false, access: { has: obj => "fileName" in obj, get: obj => obj.fileName, set: (obj, value) => { obj.fileName = value; } }, metadata: _metadata }, _fileName_initializers, _fileName_extraInitializers);
            __esDecorate(null, null, _fileContent_decorators, { kind: "field", name: "fileContent", static: false, private: false, access: { has: obj => "fileContent" in obj, get: obj => obj.fileContent, set: (obj, value) => { obj.fileContent = value; } }, metadata: _metadata }, _fileContent_initializers, _fileContent_extraInitializers);
            __esDecorate(null, null, _parentId_decorators, { kind: "field", name: "parentId", static: false, private: false, access: { has: obj => "parentId" in obj, get: obj => obj.parentId, set: (obj, value) => { obj.parentId = value; } }, metadata: _metadata }, _parentId_initializers, _parentId_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadFileDto };
//# sourceMappingURL=upload-file.dto.js.map