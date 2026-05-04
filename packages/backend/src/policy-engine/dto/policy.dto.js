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
import { IsString, IsBoolean, IsNumber, IsObject, IsEnum, } from 'class-validator';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
/**
 * 策略配置 DTO（简化负载）
 */
let PolicyConfigPayloadDto = (() => {
    var _a;
    let _config_decorators;
    let _config_initializers = [];
    let _config_extraInitializers = [];
    return _a = class PolicyConfigPayloadDto {
            constructor() {
                this.config = __runInitializers(this, _config_initializers, void 0);
                __runInitializers(this, _config_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _config_decorators = [ApiProperty({
                    description: '策略配置数据',
                    example: {
                        startTime: '09:00',
                        endTime: '18:00',
                        allowedDays: [1, 2, 3, 4, 5],
                    },
                }), IsObject()];
            __esDecorate(null, null, _config_decorators, { kind: "field", name: "config", static: false, private: false, access: { has: obj => "config" in obj, get: obj => obj.config, set: (obj, value) => { obj.config = value; } }, metadata: _metadata }, _config_initializers, _config_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyConfigPayloadDto };
/**
 * 策略响应 DTO
 */
let PolicyResponseDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _config_decorators;
    let _config_initializers = [];
    let _config_extraInitializers = [];
    let _permissions_decorators;
    let _permissions_initializers = [];
    let _permissions_extraInitializers = [];
    let _enabled_decorators;
    let _enabled_initializers = [];
    let _enabled_extraInitializers = [];
    let _priority_decorators;
    let _priority_initializers = [];
    let _priority_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    return _a = class PolicyResponseDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.type = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _type_initializers, void 0));
                this.name = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.description = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.config = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _config_initializers, void 0));
                this.permissions = (__runInitializers(this, _config_extraInitializers), __runInitializers(this, _permissions_initializers, void 0));
                this.enabled = (__runInitializers(this, _permissions_extraInitializers), __runInitializers(this, _enabled_initializers, void 0));
                this.priority = (__runInitializers(this, _enabled_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
                this.createdAt = (__runInitializers(this, _priority_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
                this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
                __runInitializers(this, _updatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: '策略 ID' }), IsString()];
            _type_decorators = [ApiProperty({
                    description: '策略类型',
                    enum: Object.values(PolicyType),
                    enumName: 'PolicyType',
                }), IsEnum(PolicyType)];
            _name_decorators = [ApiProperty({ description: '策略名称' }), IsString()];
            _description_decorators = [ApiPropertyOptional({ description: '策略描述' }), IsString()];
            _config_decorators = [ApiProperty({ description: '策略配置' }), IsObject()];
            _permissions_decorators = [ApiProperty({
                    description: '关联的权限',
                    enum: Object.values(PrismaPermission),
                    enumName: 'PrismaPermission',
                    isArray: true,
                }), IsEnum(PrismaPermission, { each: true })];
            _enabled_decorators = [ApiProperty({ description: '是否启用' }), IsBoolean()];
            _priority_decorators = [ApiPropertyOptional({ description: '优先级' }), IsNumber()];
            _createdAt_decorators = [ApiProperty({ description: '创建时间' })];
            _updatedAt_decorators = [ApiProperty({ description: '更新时间' })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _config_decorators, { kind: "field", name: "config", static: false, private: false, access: { has: obj => "config" in obj, get: obj => obj.config, set: (obj, value) => { obj.config = value; } }, metadata: _metadata }, _config_initializers, _config_extraInitializers);
            __esDecorate(null, null, _permissions_decorators, { kind: "field", name: "permissions", static: false, private: false, access: { has: obj => "permissions" in obj, get: obj => obj.permissions, set: (obj, value) => { obj.permissions = value; } }, metadata: _metadata }, _permissions_initializers, _permissions_extraInitializers);
            __esDecorate(null, null, _enabled_decorators, { kind: "field", name: "enabled", static: false, private: false, access: { has: obj => "enabled" in obj, get: obj => obj.enabled, set: (obj, value) => { obj.enabled = value; } }, metadata: _metadata }, _enabled_initializers, _enabled_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyResponseDto };
/**
 * 策略评估结果 DTO
 */
let PolicyEvaluationResultDto = (() => {
    var _a;
    let _allowed_decorators;
    let _allowed_initializers = [];
    let _allowed_extraInitializers = [];
    let _reason_decorators;
    let _reason_initializers = [];
    let _reason_extraInitializers = [];
    let _policyId_decorators;
    let _policyId_initializers = [];
    let _policyId_extraInitializers = [];
    let _policyType_decorators;
    let _policyType_initializers = [];
    let _policyType_extraInitializers = [];
    let _evaluatedAt_decorators;
    let _evaluatedAt_initializers = [];
    let _evaluatedAt_extraInitializers = [];
    return _a = class PolicyEvaluationResultDto {
            constructor() {
                this.allowed = __runInitializers(this, _allowed_initializers, void 0);
                this.reason = (__runInitializers(this, _allowed_extraInitializers), __runInitializers(this, _reason_initializers, void 0));
                this.policyId = (__runInitializers(this, _reason_extraInitializers), __runInitializers(this, _policyId_initializers, void 0));
                this.policyType = (__runInitializers(this, _policyId_extraInitializers), __runInitializers(this, _policyType_initializers, void 0));
                this.evaluatedAt = (__runInitializers(this, _policyType_extraInitializers), __runInitializers(this, _evaluatedAt_initializers, void 0));
                __runInitializers(this, _evaluatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _allowed_decorators = [ApiProperty({ description: '是否允许访问' })];
            _reason_decorators = [ApiPropertyOptional({ description: '拒绝原因' })];
            _policyId_decorators = [ApiProperty({ description: '策略 ID' })];
            _policyType_decorators = [ApiProperty({ description: '策略类型' })];
            _evaluatedAt_decorators = [ApiProperty({ description: '评估时间' })];
            __esDecorate(null, null, _allowed_decorators, { kind: "field", name: "allowed", static: false, private: false, access: { has: obj => "allowed" in obj, get: obj => obj.allowed, set: (obj, value) => { obj.allowed = value; } }, metadata: _metadata }, _allowed_initializers, _allowed_extraInitializers);
            __esDecorate(null, null, _reason_decorators, { kind: "field", name: "reason", static: false, private: false, access: { has: obj => "reason" in obj, get: obj => obj.reason, set: (obj, value) => { obj.reason = value; } }, metadata: _metadata }, _reason_initializers, _reason_extraInitializers);
            __esDecorate(null, null, _policyId_decorators, { kind: "field", name: "policyId", static: false, private: false, access: { has: obj => "policyId" in obj, get: obj => obj.policyId, set: (obj, value) => { obj.policyId = value; } }, metadata: _metadata }, _policyId_initializers, _policyId_extraInitializers);
            __esDecorate(null, null, _policyType_decorators, { kind: "field", name: "policyType", static: false, private: false, access: { has: obj => "policyType" in obj, get: obj => obj.policyType, set: (obj, value) => { obj.policyType = value; } }, metadata: _metadata }, _policyType_initializers, _policyType_extraInitializers);
            __esDecorate(null, null, _evaluatedAt_decorators, { kind: "field", name: "evaluatedAt", static: false, private: false, access: { has: obj => "evaluatedAt" in obj, get: obj => obj.evaluatedAt, set: (obj, value) => { obj.evaluatedAt = value; } }, metadata: _metadata }, _evaluatedAt_initializers, _evaluatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyEvaluationResultDto };
/**
 * 策略评估汇总 DTO
 */
let PolicyEvaluationSummaryDto = (() => {
    var _a;
    let _allowed_decorators;
    let _allowed_initializers = [];
    let _allowed_extraInitializers = [];
    let _results_decorators;
    let _results_initializers = [];
    let _results_extraInitializers = [];
    let _denialReason_decorators;
    let _denialReason_initializers = [];
    let _denialReason_extraInitializers = [];
    return _a = class PolicyEvaluationSummaryDto {
            constructor() {
                this.allowed = __runInitializers(this, _allowed_initializers, void 0);
                this.results = (__runInitializers(this, _allowed_extraInitializers), __runInitializers(this, _results_initializers, void 0));
                this.denialReason = (__runInitializers(this, _results_extraInitializers), __runInitializers(this, _denialReason_initializers, void 0));
                __runInitializers(this, _denialReason_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _allowed_decorators = [ApiProperty({ description: '是否允许访问' })];
            _results_decorators = [ApiProperty({
                    description: '各策略的评估结果',
                    type: () => [PolicyEvaluationResultDto],
                })];
            _denialReason_decorators = [ApiPropertyOptional({ description: '拒绝原因' })];
            __esDecorate(null, null, _allowed_decorators, { kind: "field", name: "allowed", static: false, private: false, access: { has: obj => "allowed" in obj, get: obj => obj.allowed, set: (obj, value) => { obj.allowed = value; } }, metadata: _metadata }, _allowed_initializers, _allowed_extraInitializers);
            __esDecorate(null, null, _results_decorators, { kind: "field", name: "results", static: false, private: false, access: { has: obj => "results" in obj, get: obj => obj.results, set: (obj, value) => { obj.results = value; } }, metadata: _metadata }, _results_initializers, _results_extraInitializers);
            __esDecorate(null, null, _denialReason_decorators, { kind: "field", name: "denialReason", static: false, private: false, access: { has: obj => "denialReason" in obj, get: obj => obj.denialReason, set: (obj, value) => { obj.denialReason = value; } }, metadata: _metadata }, _denialReason_initializers, _denialReason_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyEvaluationSummaryDto };
/**
 * 策略配置 Schema 属性 DTO
 */
let PolicyConfigSchemaPropertyDto = (() => {
    var _a;
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _default_decorators;
    let _default_initializers = [];
    let _default_extraInitializers = [];
    let _enum_decorators;
    let _enum_initializers = [];
    let _enum_extraInitializers = [];
    let _minimum_decorators;
    let _minimum_initializers = [];
    let _minimum_extraInitializers = [];
    let _maximum_decorators;
    let _maximum_initializers = [];
    let _maximum_extraInitializers = [];
    let _items_decorators;
    let _items_initializers = [];
    let _items_extraInitializers = [];
    return _a = class PolicyConfigSchemaPropertyDto {
            constructor() {
                this.type = __runInitializers(this, _type_initializers, void 0);
                this.description = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.default = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _default_initializers, void 0));
                this.enum = (__runInitializers(this, _default_extraInitializers), __runInitializers(this, _enum_initializers, void 0));
                this.minimum = (__runInitializers(this, _enum_extraInitializers), __runInitializers(this, _minimum_initializers, void 0));
                this.maximum = (__runInitializers(this, _minimum_extraInitializers), __runInitializers(this, _maximum_initializers, void 0));
                this.items = (__runInitializers(this, _maximum_extraInitializers), __runInitializers(this, _items_initializers, void 0));
                __runInitializers(this, _items_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _type_decorators = [ApiProperty({ description: '属性类型' })];
            _description_decorators = [ApiProperty({ description: '属性描述' })];
            _default_decorators = [ApiPropertyOptional({ description: '默认值' })];
            _enum_decorators = [ApiPropertyOptional({ description: '枚举值' })];
            _minimum_decorators = [ApiPropertyOptional({ description: '最小值' })];
            _maximum_decorators = [ApiPropertyOptional({ description: '最大值' })];
            _items_decorators = [ApiPropertyOptional({ description: '属性项类型' })];
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _default_decorators, { kind: "field", name: "default", static: false, private: false, access: { has: obj => "default" in obj, get: obj => obj.default, set: (obj, value) => { obj.default = value; } }, metadata: _metadata }, _default_initializers, _default_extraInitializers);
            __esDecorate(null, null, _enum_decorators, { kind: "field", name: "enum", static: false, private: false, access: { has: obj => "enum" in obj, get: obj => obj.enum, set: (obj, value) => { obj.enum = value; } }, metadata: _metadata }, _enum_initializers, _enum_extraInitializers);
            __esDecorate(null, null, _minimum_decorators, { kind: "field", name: "minimum", static: false, private: false, access: { has: obj => "minimum" in obj, get: obj => obj.minimum, set: (obj, value) => { obj.minimum = value; } }, metadata: _metadata }, _minimum_initializers, _minimum_extraInitializers);
            __esDecorate(null, null, _maximum_decorators, { kind: "field", name: "maximum", static: false, private: false, access: { has: obj => "maximum" in obj, get: obj => obj.maximum, set: (obj, value) => { obj.maximum = value; } }, metadata: _metadata }, _maximum_initializers, _maximum_extraInitializers);
            __esDecorate(null, null, _items_decorators, { kind: "field", name: "items", static: false, private: false, access: { has: obj => "items" in obj, get: obj => obj.items, set: (obj, value) => { obj.items = value; } }, metadata: _metadata }, _items_initializers, _items_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyConfigSchemaPropertyDto };
/**
 * 策略配置 Schema DTO
 */
let PolicyConfigSchemaDto = (() => {
    var _a;
    let _properties_decorators;
    let _properties_initializers = [];
    let _properties_extraInitializers = [];
    let _required_decorators;
    let _required_initializers = [];
    let _required_extraInitializers = [];
    return _a = class PolicyConfigSchemaDto {
            constructor() {
                this.properties = __runInitializers(this, _properties_initializers, void 0);
                this.required = (__runInitializers(this, _properties_extraInitializers), __runInitializers(this, _required_initializers, void 0));
                __runInitializers(this, _required_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _properties_decorators = [ApiProperty({
                    description: '配置属性',
                    type: 'object',
                    additionalProperties: {
                        type: 'object',
                    },
                })];
            _required_decorators = [ApiProperty({ description: '必填属性', isArray: true })];
            __esDecorate(null, null, _properties_decorators, { kind: "field", name: "properties", static: false, private: false, access: { has: obj => "properties" in obj, get: obj => obj.properties, set: (obj, value) => { obj.properties = value; } }, metadata: _metadata }, _properties_initializers, _properties_extraInitializers);
            __esDecorate(null, null, _required_decorators, { kind: "field", name: "required", static: false, private: false, access: { has: obj => "required" in obj, get: obj => obj.required, set: (obj, value) => { obj.required = value; } }, metadata: _metadata }, _required_initializers, _required_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyConfigSchemaDto };
//# sourceMappingURL=policy.dto.js.map