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
import { ApiProperty } from "@nestjs/swagger";
/**
 * 外部参照刷新统计 DTO
 */
let ExternalReferenceStatsDto = (() => {
    var _a;
    let _added_decorators;
    let _added_initializers = [];
    let _added_extraInitializers = [];
    let _updated_decorators;
    let _updated_initializers = [];
    let _updated_extraInitializers = [];
    let _removed_decorators;
    let _removed_initializers = [];
    let _removed_extraInitializers = [];
    return _a = class ExternalReferenceStatsDto {
            constructor() {
                this.added = __runInitializers(this, _added_initializers, void 0);
                this.updated = (__runInitializers(this, _added_extraInitializers), __runInitializers(this, _updated_initializers, void 0));
                this.removed = (__runInitializers(this, _updated_extraInitializers), __runInitializers(this, _removed_initializers, void 0));
                __runInitializers(this, _removed_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _added_decorators = [ApiProperty({
                    description: "新增的外部参照数量",
                    type: Number,
                    required: false,
                })];
            _updated_decorators = [ApiProperty({
                    description: "更新的外部参照数量",
                    type: Number,
                    required: false,
                })];
            _removed_decorators = [ApiProperty({
                    description: "移除的外部参照数量",
                    type: Number,
                    required: false,
                })];
            __esDecorate(null, null, _added_decorators, { kind: "field", name: "added", static: false, private: false, access: { has: obj => "added" in obj, get: obj => obj.added, set: (obj, value) => { obj.added = value; } }, metadata: _metadata }, _added_initializers, _added_extraInitializers);
            __esDecorate(null, null, _updated_decorators, { kind: "field", name: "updated", static: false, private: false, access: { has: obj => "updated" in obj, get: obj => obj.updated, set: (obj, value) => { obj.updated = value; } }, metadata: _metadata }, _updated_initializers, _updated_extraInitializers);
            __esDecorate(null, null, _removed_decorators, { kind: "field", name: "removed", static: false, private: false, access: { has: obj => "removed" in obj, get: obj => obj.removed, set: (obj, value) => { obj.removed = value; } }, metadata: _metadata }, _removed_initializers, _removed_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ExternalReferenceStatsDto };
/**
 * 刷新外部参照响应 DTO
 */
let RefreshExternalReferencesResponseDto = (() => {
    var _a;
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _stats_decorators;
    let _stats_initializers = [];
    let _stats_extraInitializers = [];
    return _a = class RefreshExternalReferencesResponseDto {
            constructor() {
                this.code = __runInitializers(this, _code_initializers, void 0);
                this.message = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _message_initializers, void 0));
                this.stats = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _stats_initializers, void 0));
                __runInitializers(this, _stats_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [ApiProperty({
                    description: "响应状态码",
                    example: 0,
                    type: Number,
                })];
            _message_decorators = [ApiProperty({
                    description: "响应消息",
                    example: "刷新成功",
                    type: String,
                })];
            _stats_decorators = [ApiProperty({
                    description: "外部参照统计信息",
                    type: () => ExternalReferenceStatsDto,
                    required: false,
                })];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _stats_decorators, { kind: "field", name: "stats", static: false, private: false, access: { has: obj => "stats" in obj, get: obj => obj.stats, set: (obj, value) => { obj.stats = value; } }, metadata: _metadata }, _stats_initializers, _stats_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { RefreshExternalReferencesResponseDto };
//# sourceMappingURL=refresh-external-references-response.dto.js.map