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
import { IsNotEmpty } from 'class-validator';
/**
 * 更新运行时配置 DTO
 */
let UpdateRuntimeConfigDto = (() => {
    var _a;
    let _value_decorators;
    let _value_initializers = [];
    let _value_extraInitializers = [];
    return _a = class UpdateRuntimeConfigDto {
            constructor() {
                this.value = __runInitializers(this, _value_initializers, void 0);
                __runInitializers(this, _value_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _value_decorators = [ApiProperty({
                    description: '配置值（string | number | boolean）',
                    type: Object,
                    example: false,
                }), IsNotEmpty({ message: '配置值不能为空' })];
            __esDecorate(null, null, _value_decorators, { kind: "field", name: "value", static: false, private: false, access: { has: obj => "value" in obj, get: obj => obj.value, set: (obj, value) => { obj.value = value; } }, metadata: _metadata }, _value_initializers, _value_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UpdateRuntimeConfigDto };
/**
 * 运行时配置项响应 DTO
 */
let RuntimeConfigResponseDto = (() => {
    var _a;
    let _key_decorators;
    let _key_initializers = [];
    let _key_extraInitializers = [];
    let _value_decorators;
    let _value_initializers = [];
    let _value_extraInitializers = [];
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _category_decorators;
    let _category_initializers = [];
    let _category_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _isPublic_decorators;
    let _isPublic_initializers = [];
    let _isPublic_extraInitializers = [];
    let _updatedBy_decorators;
    let _updatedBy_initializers = [];
    let _updatedBy_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    return _a = class RuntimeConfigResponseDto {
            constructor() {
                this.key = __runInitializers(this, _key_initializers, void 0);
                this.value = (__runInitializers(this, _key_extraInitializers), __runInitializers(this, _value_initializers, void 0));
                this.type = (__runInitializers(this, _value_extraInitializers), __runInitializers(this, _type_initializers, void 0));
                this.category = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _category_initializers, void 0));
                this.description = (__runInitializers(this, _category_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.isPublic = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _isPublic_initializers, void 0));
                this.updatedBy = (__runInitializers(this, _isPublic_extraInitializers), __runInitializers(this, _updatedBy_initializers, void 0));
                this.updatedAt = (__runInitializers(this, _updatedBy_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
                __runInitializers(this, _updatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _key_decorators = [ApiProperty({ description: '配置键名', example: 'mailEnabled' })];
            _value_decorators = [ApiProperty({
                    description: '配置值（string | number | boolean）',
                    type: Object,
                    example: false,
                })];
            _type_decorators = [ApiProperty({
                    description: '值类型',
                    enum: ['string', 'number', 'boolean'],
                    example: 'boolean',
                })];
            _category_decorators = [ApiProperty({ description: '分类', example: 'mail' })];
            _description_decorators = [ApiPropertyOptional({ description: '配置说明', example: '邮件服务开关' })];
            _isPublic_decorators = [ApiProperty({ description: '是否公开给前端', example: true })];
            _updatedBy_decorators = [ApiPropertyOptional({ description: '最后修改人 ID' })];
            _updatedAt_decorators = [ApiProperty({
                    description: '最后更新时间',
                    example: '2024-01-01T00:00:00.000Z',
                })];
            __esDecorate(null, null, _key_decorators, { kind: "field", name: "key", static: false, private: false, access: { has: obj => "key" in obj, get: obj => obj.key, set: (obj, value) => { obj.key = value; } }, metadata: _metadata }, _key_initializers, _key_extraInitializers);
            __esDecorate(null, null, _value_decorators, { kind: "field", name: "value", static: false, private: false, access: { has: obj => "value" in obj, get: obj => obj.value, set: (obj, value) => { obj.value = value; } }, metadata: _metadata }, _value_initializers, _value_extraInitializers);
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _category_decorators, { kind: "field", name: "category", static: false, private: false, access: { has: obj => "category" in obj, get: obj => obj.category, set: (obj, value) => { obj.category = value; } }, metadata: _metadata }, _category_initializers, _category_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _isPublic_decorators, { kind: "field", name: "isPublic", static: false, private: false, access: { has: obj => "isPublic" in obj, get: obj => obj.isPublic, set: (obj, value) => { obj.isPublic = value; } }, metadata: _metadata }, _isPublic_initializers, _isPublic_extraInitializers);
            __esDecorate(null, null, _updatedBy_decorators, { kind: "field", name: "updatedBy", static: false, private: false, access: { has: obj => "updatedBy" in obj, get: obj => obj.updatedBy, set: (obj, value) => { obj.updatedBy = value; } }, metadata: _metadata }, _updatedBy_initializers, _updatedBy_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { RuntimeConfigResponseDto };
/**
 * 运行时配置定义 DTO
 */
let RuntimeConfigDefinitionDto = (() => {
    var _a;
    let _key_decorators;
    let _key_initializers = [];
    let _key_extraInitializers = [];
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _category_decorators;
    let _category_initializers = [];
    let _category_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _defaultValue_decorators;
    let _defaultValue_initializers = [];
    let _defaultValue_extraInitializers = [];
    let _isPublic_decorators;
    let _isPublic_initializers = [];
    let _isPublic_extraInitializers = [];
    return _a = class RuntimeConfigDefinitionDto {
            constructor() {
                this.key = __runInitializers(this, _key_initializers, void 0);
                this.type = (__runInitializers(this, _key_extraInitializers), __runInitializers(this, _type_initializers, void 0));
                this.category = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _category_initializers, void 0));
                this.description = (__runInitializers(this, _category_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.defaultValue = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _defaultValue_initializers, void 0));
                this.isPublic = (__runInitializers(this, _defaultValue_extraInitializers), __runInitializers(this, _isPublic_initializers, void 0));
                __runInitializers(this, _isPublic_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _key_decorators = [ApiProperty({ description: '配置键名', example: 'mailEnabled' })];
            _type_decorators = [ApiProperty({
                    description: '值类型',
                    enum: ['string', 'number', 'boolean'],
                    example: 'boolean',
                })];
            _category_decorators = [ApiProperty({ description: '分类', example: 'mail' })];
            _description_decorators = [ApiProperty({ description: '配置说明', example: '邮件服务开关' })];
            _defaultValue_decorators = [ApiProperty({
                    description: '默认值（string | number | boolean）',
                    type: Object,
                    example: false,
                })];
            _isPublic_decorators = [ApiProperty({ description: '是否公开给前端', example: true })];
            __esDecorate(null, null, _key_decorators, { kind: "field", name: "key", static: false, private: false, access: { has: obj => "key" in obj, get: obj => obj.key, set: (obj, value) => { obj.key = value; } }, metadata: _metadata }, _key_initializers, _key_extraInitializers);
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _category_decorators, { kind: "field", name: "category", static: false, private: false, access: { has: obj => "category" in obj, get: obj => obj.category, set: (obj, value) => { obj.category = value; } }, metadata: _metadata }, _category_initializers, _category_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _defaultValue_decorators, { kind: "field", name: "defaultValue", static: false, private: false, access: { has: obj => "defaultValue" in obj, get: obj => obj.defaultValue, set: (obj, value) => { obj.defaultValue = value; } }, metadata: _metadata }, _defaultValue_initializers, _defaultValue_extraInitializers);
            __esDecorate(null, null, _isPublic_decorators, { kind: "field", name: "isPublic", static: false, private: false, access: { has: obj => "isPublic" in obj, get: obj => obj.isPublic, set: (obj, value) => { obj.isPublic = value; } }, metadata: _metadata }, _isPublic_initializers, _isPublic_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { RuntimeConfigDefinitionDto };
//# sourceMappingURL=runtime-config.dto.js.map