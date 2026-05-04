///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
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
export var StorageQuotaType;
(function (StorageQuotaType) {
    StorageQuotaType["PERSONAL"] = "PERSONAL";
    StorageQuotaType["PROJECT"] = "PROJECT";
    StorageQuotaType["LIBRARY"] = "LIBRARY";
})(StorageQuotaType || (StorageQuotaType = {}));
/**
 * 存储空间信息 DTO
 */
let StorageInfoDto = (() => {
    var _a;
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _used_decorators;
    let _used_initializers = [];
    let _used_extraInitializers = [];
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    let _remaining_decorators;
    let _remaining_initializers = [];
    let _remaining_extraInitializers = [];
    let _usagePercent_decorators;
    let _usagePercent_initializers = [];
    let _usagePercent_extraInitializers = [];
    return _a = class StorageInfoDto {
            constructor() {
                this.type = __runInitializers(this, _type_initializers, void 0);
                this.used = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _used_initializers, void 0));
                this.total = (__runInitializers(this, _used_extraInitializers), __runInitializers(this, _total_initializers, void 0));
                this.remaining = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _remaining_initializers, void 0));
                this.usagePercent = (__runInitializers(this, _remaining_extraInitializers), __runInitializers(this, _usagePercent_initializers, void 0));
                __runInitializers(this, _usagePercent_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _type_decorators = [ApiProperty({
                    description: '配额类型',
                    enum: Object.values(StorageQuotaType),
                    enumName: 'StorageQuotaTypeEnum',
                })];
            _used_decorators = [ApiProperty({ description: '已使用空间（字节）' })];
            _total_decorators = [ApiProperty({ description: '总空间（字节）' })];
            _remaining_decorators = [ApiProperty({ description: '剩余空间（字节）' })];
            _usagePercent_decorators = [ApiProperty({ description: '使用百分比' })];
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _used_decorators, { kind: "field", name: "used", static: false, private: false, access: { has: obj => "used" in obj, get: obj => obj.used, set: (obj, value) => { obj.used = value; } }, metadata: _metadata }, _used_initializers, _used_extraInitializers);
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _remaining_decorators, { kind: "field", name: "remaining", static: false, private: false, access: { has: obj => "remaining" in obj, get: obj => obj.remaining, set: (obj, value) => { obj.remaining = value; } }, metadata: _metadata }, _remaining_initializers, _remaining_extraInitializers);
            __esDecorate(null, null, _usagePercent_decorators, { kind: "field", name: "usagePercent", static: false, private: false, access: { has: obj => "usagePercent" in obj, get: obj => obj.usagePercent, set: (obj, value) => { obj.usagePercent = value; } }, metadata: _metadata }, _usagePercent_initializers, _usagePercent_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { StorageInfoDto };
//# sourceMappingURL=storage-info.dto.js.map