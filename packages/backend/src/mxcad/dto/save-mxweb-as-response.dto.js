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
let SaveMxwebAsResponseDto = (() => {
    var _a;
    let _success_decorators;
    let _success_initializers = [];
    let _success_extraInitializers = [];
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _nodeId_decorators;
    let _nodeId_initializers = [];
    let _nodeId_extraInitializers = [];
    let _fileName_decorators;
    let _fileName_initializers = [];
    let _fileName_extraInitializers = [];
    let _path_decorators;
    let _path_initializers = [];
    let _path_extraInitializers = [];
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    let _parentId_decorators;
    let _parentId_initializers = [];
    let _parentId_extraInitializers = [];
    return _a = class SaveMxwebAsResponseDto {
            constructor() {
                this.success = __runInitializers(this, _success_initializers, void 0);
                this.message = (__runInitializers(this, _success_extraInitializers), __runInitializers(this, _message_initializers, void 0));
                this.nodeId = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _nodeId_initializers, void 0));
                this.fileName = (__runInitializers(this, _nodeId_extraInitializers), __runInitializers(this, _fileName_initializers, void 0));
                this.path = (__runInitializers(this, _fileName_extraInitializers), __runInitializers(this, _path_initializers, void 0));
                this.projectId = (__runInitializers(this, _path_extraInitializers), __runInitializers(this, _projectId_initializers, void 0));
                this.parentId = (__runInitializers(this, _projectId_extraInitializers), __runInitializers(this, _parentId_initializers, void 0));
                __runInitializers(this, _parentId_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _success_decorators = [ApiProperty({
                    description: '是否成功',
                })];
            _message_decorators = [ApiProperty({
                    description: '消息',
                })];
            _nodeId_decorators = [ApiProperty({
                    description: '新文件节点ID',
                })];
            _fileName_decorators = [ApiProperty({
                    description: '文件名',
                })];
            _path_decorators = [ApiProperty({
                    description: '文件路径',
                })];
            _projectId_decorators = [ApiProperty({
                    description: '项目ID',
                    required: false,
                })];
            _parentId_decorators = [ApiProperty({
                    description: '父节点ID',
                })];
            __esDecorate(null, null, _success_decorators, { kind: "field", name: "success", static: false, private: false, access: { has: obj => "success" in obj, get: obj => obj.success, set: (obj, value) => { obj.success = value; } }, metadata: _metadata }, _success_initializers, _success_extraInitializers);
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _nodeId_decorators, { kind: "field", name: "nodeId", static: false, private: false, access: { has: obj => "nodeId" in obj, get: obj => obj.nodeId, set: (obj, value) => { obj.nodeId = value; } }, metadata: _metadata }, _nodeId_initializers, _nodeId_extraInitializers);
            __esDecorate(null, null, _fileName_decorators, { kind: "field", name: "fileName", static: false, private: false, access: { has: obj => "fileName" in obj, get: obj => obj.fileName, set: (obj, value) => { obj.fileName = value; } }, metadata: _metadata }, _fileName_initializers, _fileName_extraInitializers);
            __esDecorate(null, null, _path_decorators, { kind: "field", name: "path", static: false, private: false, access: { has: obj => "path" in obj, get: obj => obj.path, set: (obj, value) => { obj.path = value; } }, metadata: _metadata }, _path_initializers, _path_extraInitializers);
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            __esDecorate(null, null, _parentId_decorators, { kind: "field", name: "parentId", static: false, private: false, access: { has: obj => "parentId" in obj, get: obj => obj.parentId, set: (obj, value) => { obj.parentId = value; } }, metadata: _metadata }, _parentId_initializers, _parentId_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SaveMxwebAsResponseDto };
//# sourceMappingURL=save-mxweb-as-response.dto.js.map