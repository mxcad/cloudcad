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
 * 保存 mxweb 文件请求体 DTO
 */
let SaveMxwebDto = (() => {
    var _a;
    let _file_decorators;
    let _file_initializers = [];
    let _file_extraInitializers = [];
    let _commitMessage_decorators;
    let _commitMessage_initializers = [];
    let _commitMessage_extraInitializers = [];
    let _expectedTimestamp_decorators;
    let _expectedTimestamp_initializers = [];
    let _expectedTimestamp_extraInitializers = [];
    return _a = class SaveMxwebDto {
            constructor() {
                this.file = __runInitializers(this, _file_initializers, void 0);
                this.commitMessage = (__runInitializers(this, _file_extraInitializers), __runInitializers(this, _commitMessage_initializers, void 0));
                this.expectedTimestamp = (__runInitializers(this, _commitMessage_extraInitializers), __runInitializers(this, _expectedTimestamp_initializers, void 0));
                __runInitializers(this, _expectedTimestamp_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _file_decorators = [ApiProperty({
                    description: 'mxweb 文件',
                    type: 'string',
                    format: 'binary',
                })];
            _commitMessage_decorators = [ApiProperty({
                    description: '提交信息',
                    required: false,
                    example: '保存图纸修改',
                }), IsString(), IsOptional()];
            _expectedTimestamp_decorators = [ApiProperty({
                    description: '乐观锁时间戳（覆盖保存时必须提供，首次保存时不需要）',
                    required: false,
                    example: '2026-05-02T08:30:00.000Z',
                }), IsString(), IsOptional()];
            __esDecorate(null, null, _file_decorators, { kind: "field", name: "file", static: false, private: false, access: { has: obj => "file" in obj, get: obj => obj.file, set: (obj, value) => { obj.file = value; } }, metadata: _metadata }, _file_initializers, _file_extraInitializers);
            __esDecorate(null, null, _commitMessage_decorators, { kind: "field", name: "commitMessage", static: false, private: false, access: { has: obj => "commitMessage" in obj, get: obj => obj.commitMessage, set: (obj, value) => { obj.commitMessage = value; } }, metadata: _metadata }, _commitMessage_initializers, _commitMessage_extraInitializers);
            __esDecorate(null, null, _expectedTimestamp_decorators, { kind: "field", name: "expectedTimestamp", static: false, private: false, access: { has: obj => "expectedTimestamp" in obj, get: obj => obj.expectedTimestamp, set: (obj, value) => { obj.expectedTimestamp = value; } }, metadata: _metadata }, _expectedTimestamp_initializers, _expectedTimestamp_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SaveMxwebDto };
//# sourceMappingURL=save-mxweb.dto.js.map