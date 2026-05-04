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
import { IsString, IsIn, IsOptional } from 'class-validator';
let SaveMxwebAsDto = (() => {
    var _a;
    let _file_decorators;
    let _file_initializers = [];
    let _file_extraInitializers = [];
    let _targetType_decorators;
    let _targetType_initializers = [];
    let _targetType_extraInitializers = [];
    let _targetParentId_decorators;
    let _targetParentId_initializers = [];
    let _targetParentId_extraInitializers = [];
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    let _format_decorators;
    let _format_initializers = [];
    let _format_extraInitializers = [];
    let _commitMessage_decorators;
    let _commitMessage_initializers = [];
    let _commitMessage_extraInitializers = [];
    let _fileName_decorators;
    let _fileName_initializers = [];
    let _fileName_extraInitializers = [];
    return _a = class SaveMxwebAsDto {
            constructor() {
                this.file = __runInitializers(this, _file_initializers, void 0);
                this.targetType = (__runInitializers(this, _file_extraInitializers), __runInitializers(this, _targetType_initializers, void 0));
                this.targetParentId = (__runInitializers(this, _targetType_extraInitializers), __runInitializers(this, _targetParentId_initializers, void 0));
                this.projectId = (__runInitializers(this, _targetParentId_extraInitializers), __runInitializers(this, _projectId_initializers, void 0));
                this.format = (__runInitializers(this, _projectId_extraInitializers), __runInitializers(this, _format_initializers, 'dwg'));
                this.commitMessage = (__runInitializers(this, _format_extraInitializers), __runInitializers(this, _commitMessage_initializers, void 0));
                this.fileName = (__runInitializers(this, _commitMessage_extraInitializers), __runInitializers(this, _fileName_initializers, void 0));
                __runInitializers(this, _fileName_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _file_decorators = [ApiProperty({
                    description: 'mxweb 文件',
                    type: 'string',
                    format: 'binary',
                }), IsOptional()];
            _targetType_decorators = [ApiProperty({
                    description: '保存类型: personal-我的图纸, project-项目',
                    enum: ['personal', 'project'],
                }), IsIn(['personal', 'project'])];
            _targetParentId_decorators = [ApiProperty({
                    description: '目标父节点ID',
                }), IsString()];
            _projectId_decorators = [ApiProperty({
                    description: '项目ID（targetType为project时必填）',
                    required: false,
                }), IsString(), IsOptional()];
            _format_decorators = [ApiProperty({
                    description: '保存格式: dwg, dxf',
                    enum: ['dwg', 'dxf'],
                    default: 'dwg',
                }), IsIn(['dwg', 'dxf']), IsOptional()];
            _commitMessage_decorators = [ApiProperty({
                    description: '提交信息',
                    required: false,
                }), IsString(), IsOptional()];
            _fileName_decorators = [ApiProperty({
                    description: '文件名（不含扩展名）',
                    required: false,
                }), IsString(), IsOptional()];
            __esDecorate(null, null, _file_decorators, { kind: "field", name: "file", static: false, private: false, access: { has: obj => "file" in obj, get: obj => obj.file, set: (obj, value) => { obj.file = value; } }, metadata: _metadata }, _file_initializers, _file_extraInitializers);
            __esDecorate(null, null, _targetType_decorators, { kind: "field", name: "targetType", static: false, private: false, access: { has: obj => "targetType" in obj, get: obj => obj.targetType, set: (obj, value) => { obj.targetType = value; } }, metadata: _metadata }, _targetType_initializers, _targetType_extraInitializers);
            __esDecorate(null, null, _targetParentId_decorators, { kind: "field", name: "targetParentId", static: false, private: false, access: { has: obj => "targetParentId" in obj, get: obj => obj.targetParentId, set: (obj, value) => { obj.targetParentId = value; } }, metadata: _metadata }, _targetParentId_initializers, _targetParentId_extraInitializers);
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            __esDecorate(null, null, _format_decorators, { kind: "field", name: "format", static: false, private: false, access: { has: obj => "format" in obj, get: obj => obj.format, set: (obj, value) => { obj.format = value; } }, metadata: _metadata }, _format_initializers, _format_extraInitializers);
            __esDecorate(null, null, _commitMessage_decorators, { kind: "field", name: "commitMessage", static: false, private: false, access: { has: obj => "commitMessage" in obj, get: obj => obj.commitMessage, set: (obj, value) => { obj.commitMessage = value; } }, metadata: _metadata }, _commitMessage_initializers, _commitMessage_extraInitializers);
            __esDecorate(null, null, _fileName_decorators, { kind: "field", name: "fileName", static: false, private: false, access: { has: obj => "fileName" in obj, get: obj => obj.fileName, set: (obj, value) => { obj.fileName = value; } }, metadata: _metadata }, _fileName_initializers, _fileName_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SaveMxwebAsDto };
//# sourceMappingURL=save-mxweb-as.dto.js.map