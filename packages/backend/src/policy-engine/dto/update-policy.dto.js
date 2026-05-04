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
import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsNumber, IsObject, IsEnum, IsArray, } from 'class-validator';
import { PolicyType } from '../enums/policy-type.enum';
import { Permission as PrismaPermission } from '@prisma/client';
import { CreatePolicyDto } from './create-policy.dto';
/**
 * 更新策略 DTO
 */
let UpdatePolicyDto = (() => {
    var _a;
    let _classSuper = PartialType(OmitType(CreatePolicyDto, ['type']));
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
    return _a = class UpdatePolicyDto extends _classSuper {
            constructor() {
                super(...arguments);
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
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _type_decorators = [ApiPropertyOptional({
                    description: '策略类型',
                    enum: PolicyType,
                }), IsOptional(), IsEnum(PolicyType)];
            _name_decorators = [ApiPropertyOptional({
                    description: '策略名称',
                }), IsOptional(), IsString()];
            _description_decorators = [ApiPropertyOptional({
                    description: '策略描述',
                }), IsOptional(), IsString()];
            _config_decorators = [ApiPropertyOptional({
                    description: '策略配置',
                }), IsOptional(), IsObject()];
            _permissions_decorators = [ApiPropertyOptional({
                    description: '关联的权限',
                    enum: PrismaPermission,
                    isArray: true,
                }), IsOptional(), IsEnum(PrismaPermission, { each: true }), IsArray()];
            _enabled_decorators = [ApiPropertyOptional({
                    description: '是否启用',
                }), IsOptional(), IsBoolean()];
            _priority_decorators = [ApiPropertyOptional({
                    description: '优先级',
                }), IsOptional(), IsNumber()];
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
export { UpdatePolicyDto };
//# sourceMappingURL=update-policy.dto.js.map