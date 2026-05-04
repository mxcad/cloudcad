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
import { IsEnum, IsOptional, IsString } from 'class-validator';
/**
 * 字体上传目标枚举
 */
export var FontUploadTarget;
(function (FontUploadTarget) {
    /** 仅上传到后端转换程序目录 */
    FontUploadTarget["BACKEND"] = "backend";
    /** 仅上传到前端资源目录 */
    FontUploadTarget["FRONTEND"] = "frontend";
    /** 同时上传到两个目录 */
    FontUploadTarget["BOTH"] = "both";
})(FontUploadTarget || (FontUploadTarget = {}));
/**
 * 字体上传 DTO
 */
let UploadFontDto = (() => {
    var _a;
    let _target_decorators;
    let _target_initializers = [];
    let _target_extraInitializers = [];
    return _a = class UploadFontDto {
            constructor() {
                this.target = __runInitializers(this, _target_initializers, void 0);
                __runInitializers(this, _target_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _target_decorators = [ApiProperty({
                    description: '上传目标',
                    enum: Object.values(FontUploadTarget),
                    enumName: 'FontUploadTarget',
                    default: FontUploadTarget.BOTH,
                }), IsEnum(FontUploadTarget), IsOptional()];
            __esDecorate(null, null, _target_decorators, { kind: "field", name: "target", static: false, private: false, access: { has: obj => "target" in obj, get: obj => obj.target, set: (obj, value) => { obj.target = value; } }, metadata: _metadata }, _target_initializers, _target_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UploadFontDto };
/**
 * 字体删除 DTO
 */
let DeleteFontDto = (() => {
    var _a;
    let _target_decorators;
    let _target_initializers = [];
    let _target_extraInitializers = [];
    return _a = class DeleteFontDto {
            constructor() {
                this.target = __runInitializers(this, _target_initializers, void 0);
                __runInitializers(this, _target_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _target_decorators = [ApiProperty({
                    description: '删除目标',
                    enum: Object.values(FontUploadTarget),
                    enumName: 'FontUploadTarget',
                    default: FontUploadTarget.BOTH,
                }), IsEnum(FontUploadTarget), IsOptional()];
            __esDecorate(null, null, _target_decorators, { kind: "field", name: "target", static: false, private: false, access: { has: obj => "target" in obj, get: obj => obj.target, set: (obj, value) => { obj.target = value; } }, metadata: _metadata }, _target_initializers, _target_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { DeleteFontDto };
/**
 * 字体信息响应 DTO
 */
let FontInfoDto = (() => {
    var _a;
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _size_decorators;
    let _size_initializers = [];
    let _size_extraInitializers = [];
    let _extension_decorators;
    let _extension_initializers = [];
    let _extension_extraInitializers = [];
    let _existsInBackend_decorators;
    let _existsInBackend_initializers = [];
    let _existsInBackend_extraInitializers = [];
    let _existsInFrontend_decorators;
    let _existsInFrontend_initializers = [];
    let _existsInFrontend_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    let _creator_decorators;
    let _creator_initializers = [];
    let _creator_extraInitializers = [];
    return _a = class FontInfoDto {
            constructor() {
                this.name = __runInitializers(this, _name_initializers, void 0);
                this.size = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _size_initializers, void 0));
                this.extension = (__runInitializers(this, _size_extraInitializers), __runInitializers(this, _extension_initializers, void 0));
                this.existsInBackend = (__runInitializers(this, _extension_extraInitializers), __runInitializers(this, _existsInBackend_initializers, void 0));
                this.existsInFrontend = (__runInitializers(this, _existsInBackend_extraInitializers), __runInitializers(this, _existsInFrontend_initializers, void 0));
                this.createdAt = (__runInitializers(this, _existsInFrontend_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
                this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
                this.creator = (__runInitializers(this, _updatedAt_extraInitializers), __runInitializers(this, _creator_initializers, void 0));
                __runInitializers(this, _creator_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _name_decorators = [ApiProperty({ description: '字体文件名' }), IsString()];
            _size_decorators = [ApiProperty({ description: '文件大小（字节）' })];
            _extension_decorators = [ApiProperty({ description: '文件扩展名' })];
            _existsInBackend_decorators = [ApiProperty({ description: '后端目录是否存在' })];
            _existsInFrontend_decorators = [ApiProperty({ description: '前端目录是否存在' })];
            _createdAt_decorators = [ApiProperty({ description: '创建时间' })];
            _updatedAt_decorators = [ApiProperty({ description: '更新时间' })];
            _creator_decorators = [ApiProperty({ description: '创建者' })];
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _size_decorators, { kind: "field", name: "size", static: false, private: false, access: { has: obj => "size" in obj, get: obj => obj.size, set: (obj, value) => { obj.size = value; } }, metadata: _metadata }, _size_initializers, _size_extraInitializers);
            __esDecorate(null, null, _extension_decorators, { kind: "field", name: "extension", static: false, private: false, access: { has: obj => "extension" in obj, get: obj => obj.extension, set: (obj, value) => { obj.extension = value; } }, metadata: _metadata }, _extension_initializers, _extension_extraInitializers);
            __esDecorate(null, null, _existsInBackend_decorators, { kind: "field", name: "existsInBackend", static: false, private: false, access: { has: obj => "existsInBackend" in obj, get: obj => obj.existsInBackend, set: (obj, value) => { obj.existsInBackend = value; } }, metadata: _metadata }, _existsInBackend_initializers, _existsInBackend_extraInitializers);
            __esDecorate(null, null, _existsInFrontend_decorators, { kind: "field", name: "existsInFrontend", static: false, private: false, access: { has: obj => "existsInFrontend" in obj, get: obj => obj.existsInFrontend, set: (obj, value) => { obj.existsInFrontend = value; } }, metadata: _metadata }, _existsInFrontend_initializers, _existsInFrontend_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            __esDecorate(null, null, _creator_decorators, { kind: "field", name: "creator", static: false, private: false, access: { has: obj => "creator" in obj, get: obj => obj.creator, set: (obj, value) => { obj.creator = value; } }, metadata: _metadata }, _creator_initializers, _creator_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { FontInfoDto };
//# sourceMappingURL=font.dto.js.map