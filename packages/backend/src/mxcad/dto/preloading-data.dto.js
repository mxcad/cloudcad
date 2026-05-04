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
import { IsString, IsBoolean, IsArray } from 'class-validator';
let PreloadingDataDto = (() => {
    var _a;
    let _tz_decorators;
    let _tz_initializers = [];
    let _tz_extraInitializers = [];
    let _src_file_md5_decorators;
    let _src_file_md5_initializers = [];
    let _src_file_md5_extraInitializers = [];
    let _images_decorators;
    let _images_initializers = [];
    let _images_extraInitializers = [];
    let _externalReference_decorators;
    let _externalReference_initializers = [];
    let _externalReference_extraInitializers = [];
    return _a = class PreloadingDataDto {
            constructor() {
                this.tz = __runInitializers(this, _tz_initializers, void 0);
                this.src_file_md5 = (__runInitializers(this, _tz_extraInitializers), __runInitializers(this, _src_file_md5_initializers, void 0));
                this.images = (__runInitializers(this, _src_file_md5_extraInitializers), __runInitializers(this, _images_initializers, void 0));
                this.externalReference = (__runInitializers(this, _images_extraInitializers), __runInitializers(this, _externalReference_initializers, void 0));
                __runInitializers(this, _externalReference_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _tz_decorators = [ApiProperty({ description: '是否为图纸' }), IsBoolean()];
            _src_file_md5_decorators = [ApiProperty({ description: '源文件哈希值' }), IsString()];
            _images_decorators = [ApiProperty({ description: '图片列表', type: [String] }), IsArray(), IsString({ each: true })];
            _externalReference_decorators = [ApiProperty({ description: '外部参照列表', type: [String] }), IsArray(), IsString({ each: true })];
            __esDecorate(null, null, _tz_decorators, { kind: "field", name: "tz", static: false, private: false, access: { has: obj => "tz" in obj, get: obj => obj.tz, set: (obj, value) => { obj.tz = value; } }, metadata: _metadata }, _tz_initializers, _tz_extraInitializers);
            __esDecorate(null, null, _src_file_md5_decorators, { kind: "field", name: "src_file_md5", static: false, private: false, access: { has: obj => "src_file_md5" in obj, get: obj => obj.src_file_md5, set: (obj, value) => { obj.src_file_md5 = value; } }, metadata: _metadata }, _src_file_md5_initializers, _src_file_md5_extraInitializers);
            __esDecorate(null, null, _images_decorators, { kind: "field", name: "images", static: false, private: false, access: { has: obj => "images" in obj, get: obj => obj.images, set: (obj, value) => { obj.images = value; } }, metadata: _metadata }, _images_initializers, _images_extraInitializers);
            __esDecorate(null, null, _externalReference_decorators, { kind: "field", name: "externalReference", static: false, private: false, access: { has: obj => "externalReference" in obj, get: obj => obj.externalReference, set: (obj, value) => { obj.externalReference = value; } }, metadata: _metadata }, _externalReference_initializers, _externalReference_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PreloadingDataDto };
//# sourceMappingURL=preloading-data.dto.js.map