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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength, ValidatorConstraint, registerDecorator, } from 'class-validator';
/**
 * 字段匹配验证器 - 验证两个字段是否相等
 */
let IsMatchConstraint = (() => {
    let _classDecorators = [ValidatorConstraint({ name: 'isMatch', async: false })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var IsMatchConstraint = _classThis = class {
        validate(value, args) {
            const [relatedPropertyName] = args.constraints;
            const relatedValue = args.object[relatedPropertyName];
            return value === relatedValue;
        }
        defaultMessage(args) {
            const [relatedPropertyName] = args.constraints;
            return `${args.property} 必须与 ${relatedPropertyName} 相同`;
        }
    };
    __setFunctionName(_classThis, "IsMatchConstraint");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        IsMatchConstraint = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return IsMatchConstraint = _classThis;
})();
export { IsMatchConstraint };
/**
 * 字段匹配验证装饰器
 * @param property 要匹配的属性名
 * @param validationOptions 验证选项
 */
export function IsMatch(property, validationOptions) {
    return function (object, propertyName) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints: [property],
            validator: IsMatchConstraint,
        });
    };
}
/**
 * 密码验证装饰器 - 统一密码策略
 * 要求: 8-50位
 */
export function IsStrongPassword() {
    return applyDecorators(ApiProperty({
        description: '密码',
        example: 'password123',
        minLength: 8,
        maxLength: 50,
    }), IsString({ message: '密码必须是字符串' }), IsNotEmpty({ message: '密码不能为空' }), MinLength(8, { message: '密码至少8个字符' }), MaxLength(50, { message: '密码最多50个字符' }));
}
/**
 * 用户名验证装饰器
 */
export function IsUsername() {
    return applyDecorators(ApiProperty({
        description: '用户名',
        example: 'username',
        minLength: 3,
        maxLength: 20,
        pattern: '^[a-zA-Z0-9_]+$',
    }), IsString({ message: '用户名必须是字符串' }), IsNotEmpty({ message: '用户名不能为空' }), MinLength(3, { message: '用户名至少3个字符' }), MaxLength(20, { message: '用户名最多20个字符' }), Matches(/^[a-zA-Z0-9_]+$/, {
        message: '用户名只能包含字母、数字和下划线',
    }));
}
/**
 * 邮箱验证装饰器
 */
export function IsEmailField() {
    return applyDecorators(ApiProperty({
        description: '用户邮箱',
        example: 'user@example.com',
        format: 'email',
    }), IsEmail({}, { message: '请输入有效的邮箱地址' }), IsNotEmpty({ message: '邮箱不能为空' }));
}
/**
 * 昵称验证装饰器
 */
export function IsNickname() {
    return applyDecorators(ApiProperty({
        description: '昵称',
        example: '用户昵称',
        required: false,
        maxLength: 50,
    }), IsString({ message: '昵称必须是字符串' }), MaxLength(50, { message: '昵称最多50个字符' }));
}
//# sourceMappingURL=validation.decorators.js.map