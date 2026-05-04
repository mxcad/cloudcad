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
import { IsString, IsBoolean, IsNumber, IsEnum, IsArray, } from 'class-validator';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
/**
 * 策略配置 DTO
 *
 * 用于策略配置的传输和验证
 */
let PolicyConfigDto = (() => {
    var _a;
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
    return _a = class PolicyConfigDto {
            constructor() {
                this.type = __runInitializers(this, _type_initializers, void 0);
                this.name = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.description = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.config = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _config_initializers, void 0));
                this.permissions = (__runInitializers(this, _config_extraInitializers), __runInitializers(this, _permissions_initializers, void 0));
                this.enabled = (__runInitializers(this, _permissions_extraInitializers), __runInitializers(this, _enabled_initializers, void 0));
                this.priority = (__runInitializers(this, _enabled_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
                __runInitializers(this, _priority_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _type_decorators = [ApiProperty({
                    description: '策略类型',
                    enum: Object.values(PolicyType),
                    enumName: 'PolicyType',
                    example: PolicyType.TIME,
                }), IsEnum(PolicyType)];
            _name_decorators = [ApiProperty({
                    description: '策略名称',
                    example: '工作时间限制',
                }), IsString()];
            _description_decorators = [ApiPropertyOptional({
                    description: '策略描述',
                    example: '仅允许在工作时间 9:00-18:00 访问',
                }), IsString()];
            _config_decorators = [ApiProperty({
                    description: '策略配置数据',
                    example: {
                        startTime: '09:00',
                        endTime: '18:00',
                        allowedDays: [1, 2, 3, 4, 5],
                    },
                })];
            _permissions_decorators = [ApiProperty({
                    description: '关联的权限',
                    enum: Object.values(PrismaPermission),
                    enumName: 'PrismaPermission',
                    isArray: true,
                    example: [PrismaPermission.SYSTEM_USER_DELETE],
                }), IsEnum(PrismaPermission, { each: true }), IsArray()];
            _enabled_decorators = [ApiPropertyOptional({
                    description: '是否启用',
                    default: true,
                }), IsBoolean()];
            _priority_decorators = [ApiPropertyOptional({
                    description: '优先级（数值越大优先级越高）',
                    default: 0,
                }), IsNumber()];
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _config_decorators, { kind: "field", name: "config", static: false, private: false, access: { has: obj => "config" in obj, get: obj => obj.config, set: (obj, value) => { obj.config = value; } }, metadata: _metadata }, _config_initializers, _config_extraInitializers);
            __esDecorate(null, null, _permissions_decorators, { kind: "field", name: "permissions", static: false, private: false, access: { has: obj => "permissions" in obj, get: obj => obj.permissions, set: (obj, value) => { obj.permissions = value; } }, metadata: _metadata }, _permissions_initializers, _permissions_extraInitializers);
            __esDecorate(null, null, _enabled_decorators, { kind: "field", name: "enabled", static: false, private: false, access: { has: obj => "enabled" in obj, get: obj => obj.enabled, set: (obj, value) => { obj.enabled = value; } }, metadata: _metadata }, _enabled_initializers, _enabled_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyConfigDto };
/**
 * 策略配置列表 DTO
 */
let PolicyConfigListDto = (() => {
    var _a;
    let _policies_decorators;
    let _policies_initializers = [];
    let _policies_extraInitializers = [];
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    return _a = class PolicyConfigListDto {
            constructor() {
                this.policies = __runInitializers(this, _policies_initializers, void 0);
                this.total = (__runInitializers(this, _policies_extraInitializers), __runInitializers(this, _total_initializers, void 0));
                __runInitializers(this, _total_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _policies_decorators = [ApiProperty({
                    description: '策略配置列表',
                    type: () => [PolicyConfigDto],
                })];
            _total_decorators = [ApiProperty({ description: '总数' })];
            __esDecorate(null, null, _policies_decorators, { kind: "field", name: "policies", static: false, private: false, access: { has: obj => "policies" in obj, get: obj => obj.policies, set: (obj, value) => { obj.policies = value; } }, metadata: _metadata }, _policies_initializers, _policies_extraInitializers);
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyConfigListDto };
/**
 * 策略配置统计 DTO
 */
let PolicyConfigStatsDto = (() => {
    var _a;
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    let _enabled_decorators;
    let _enabled_initializers = [];
    let _enabled_extraInitializers = [];
    let _disabled_decorators;
    let _disabled_initializers = [];
    let _disabled_extraInitializers = [];
    let _byType_decorators;
    let _byType_initializers = [];
    let _byType_extraInitializers = [];
    return _a = class PolicyConfigStatsDto {
            constructor() {
                this.total = __runInitializers(this, _total_initializers, void 0);
                this.enabled = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _enabled_initializers, void 0));
                this.disabled = (__runInitializers(this, _enabled_extraInitializers), __runInitializers(this, _disabled_initializers, void 0));
                this.byType = (__runInitializers(this, _disabled_extraInitializers), __runInitializers(this, _byType_initializers, void 0));
                __runInitializers(this, _byType_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _total_decorators = [ApiProperty({ description: '总策略数' })];
            _enabled_decorators = [ApiProperty({ description: '启用的策略数' })];
            _disabled_decorators = [ApiProperty({ description: '禁用的策略数' })];
            _byType_decorators = [ApiProperty({
                    description: '按类型分组的策略数',
                    type: 'object',
                    additionalProperties: {
                        type: 'number',
                    },
                    example: {
                        TIME: 3,
                        IP: 2,
                        DEVICE: 1,
                    },
                })];
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _enabled_decorators, { kind: "field", name: "enabled", static: false, private: false, access: { has: obj => "enabled" in obj, get: obj => obj.enabled, set: (obj, value) => { obj.enabled = value; } }, metadata: _metadata }, _enabled_initializers, _enabled_extraInitializers);
            __esDecorate(null, null, _disabled_decorators, { kind: "field", name: "disabled", static: false, private: false, access: { has: obj => "disabled" in obj, get: obj => obj.disabled, set: (obj, value) => { obj.disabled = value; } }, metadata: _metadata }, _disabled_initializers, _disabled_extraInitializers);
            __esDecorate(null, null, _byType_decorators, { kind: "field", name: "byType", static: false, private: false, access: { has: obj => "byType" in obj, get: obj => obj.byType, set: (obj, value) => { obj.byType = value; } }, metadata: _metadata }, _byType_initializers, _byType_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { PolicyConfigStatsDto };
//# sourceMappingURL=policy-config.dto.js.map