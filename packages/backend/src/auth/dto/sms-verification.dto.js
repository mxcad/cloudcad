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
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, } from 'class-validator';
/**
 * 发送短信验证码 DTO
 */
let SendSmsCodeDto = (() => {
    var _a;
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    return _a = class SendSmsCodeDto {
            constructor() {
                this.phone = __runInitializers(this, _phone_initializers, void 0);
                __runInitializers(this, _phone_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _phone_decorators = [ApiProperty({
                    description: '手机号（中国大陆，可带 +86 前缀）',
                    example: '13800138000',
                    pattern: '^(\\+86)?1[3-9]\\d{9}$',
                }), IsString({ message: '手机号必须是字符串' }), IsNotEmpty({ message: '手机号不能为空' }), Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })];
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { SendSmsCodeDto };
/**
 * 验证短信验证码 DTO
 */
let VerifySmsCodeDto = (() => {
    var _a;
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    return _a = class VerifySmsCodeDto {
            constructor() {
                this.phone = __runInitializers(this, _phone_initializers, void 0);
                this.code = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _code_initializers, void 0));
                __runInitializers(this, _code_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _phone_decorators = [ApiProperty({
                    description: '手机号（中国大陆，可带 +86 前缀）',
                    example: '13800138000',
                    pattern: '^(\\+86)?1[3-9]\\d{9}$',
                }), IsString({ message: '手机号必须是字符串' }), IsNotEmpty({ message: '手机号不能为空' }), Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })];
            _code_decorators = [ApiProperty({
                    description: '验证码（6位数字）',
                    example: '123456',
                    minLength: 6,
                    maxLength: 6,
                }), IsString({ message: '验证码必须是字符串' }), IsNotEmpty({ message: '验证码不能为空' }), MinLength(6, { message: '验证码必须是6位' }), MaxLength(6, { message: '验证码必须是6位' }), Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })];
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { VerifySmsCodeDto };
/**
 * 手机号注册 DTO
 */
let RegisterByPhoneDto = (() => {
    var _a;
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _password_decorators;
    let _password_initializers = [];
    let _password_extraInitializers = [];
    let _nickname_decorators;
    let _nickname_initializers = [];
    let _nickname_extraInitializers = [];
    return _a = class RegisterByPhoneDto {
            constructor() {
                this.phone = __runInitializers(this, _phone_initializers, void 0);
                this.code = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _code_initializers, void 0));
                this.username = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.password = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _password_initializers, void 0));
                this.nickname = (__runInitializers(this, _password_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                __runInitializers(this, _nickname_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _phone_decorators = [ApiProperty({
                    description: '手机号（中国大陆，可带 +86 前缀）',
                    example: '13800138000',
                    pattern: '^(\\+86)?1[3-9]\\d{9}$',
                }), IsString({ message: '手机号必须是字符串' }), IsNotEmpty({ message: '手机号不能为空' }), Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })];
            _code_decorators = [ApiProperty({
                    description: '验证码（6位数字）',
                    example: '123456',
                    minLength: 6,
                    maxLength: 6,
                }), IsString({ message: '验证码必须是字符串' }), IsNotEmpty({ message: '验证码不能为空' }), MinLength(6, { message: '验证码必须是6位' }), MaxLength(6, { message: '验证码必须是6位' }), Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })];
            _username_decorators = [ApiProperty({
                    type: String,
                    description: '用户名',
                    example: 'username',
                    minLength: 3,
                    maxLength: 20,
                    pattern: '^[a-zA-Z0-9_]+$',
                }), IsString({ message: '用户名必须是字符串' }), IsNotEmpty({ message: '用户名不能为空' }), MinLength(3, { message: '用户名至少3个字符' }), MaxLength(20, { message: '用户名最多20个字符' }), Matches(/^[a-zA-Z0-9_]+$/, {
                    message: '用户名只能包含字母、数字和下划线',
                })];
            _password_decorators = [ApiProperty({
                    type: String,
                    description: '密码',
                    example: 'password123',
                    minLength: 8,
                    maxLength: 50,
                }), IsString({ message: '密码必须是字符串' }), IsNotEmpty({ message: '密码不能为空' }), MinLength(8, { message: '密码至少8个字符' }), MaxLength(50, { message: '密码最多50个字符' })];
            _nickname_decorators = [ApiPropertyOptional({
                    description: '昵称',
                    example: '用户昵称',
                    maxLength: 50,
                }), IsOptional(), IsString({ message: '昵称必须是字符串' }), MaxLength(50, { message: '昵称最多50个字符' })];
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _password_decorators, { kind: "field", name: "password", static: false, private: false, access: { has: obj => "password" in obj, get: obj => obj.password, set: (obj, value) => { obj.password = value; } }, metadata: _metadata }, _password_initializers, _password_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { RegisterByPhoneDto };
/**
 * 手机号登录 DTO
 */
let LoginByPhoneDto = (() => {
    var _a;
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    return _a = class LoginByPhoneDto {
            constructor() {
                this.phone = __runInitializers(this, _phone_initializers, void 0);
                this.code = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _code_initializers, void 0));
                __runInitializers(this, _code_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _phone_decorators = [ApiProperty({
                    description: '手机号（中国大陆，可带 +86 前缀）',
                    example: '13800138000',
                    pattern: '^(\\+86)?1[3-9]\\d{9}$',
                }), IsString({ message: '手机号必须是字符串' }), IsNotEmpty({ message: '手机号不能为空' }), Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })];
            _code_decorators = [ApiProperty({
                    description: '验证码（6位数字）',
                    example: '123456',
                    minLength: 6,
                    maxLength: 6,
                }), IsString({ message: '验证码必须是字符串' }), IsNotEmpty({ message: '验证码不能为空' }), MinLength(6, { message: '验证码必须是6位' }), MaxLength(6, { message: '验证码必须是6位' }), Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })];
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { LoginByPhoneDto };
/**
 * 绑定手机号 DTO
 */
let BindPhoneDto = (() => {
    var _a;
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    return _a = class BindPhoneDto {
            constructor() {
                this.phone = __runInitializers(this, _phone_initializers, void 0);
                this.code = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _code_initializers, void 0));
                __runInitializers(this, _code_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _phone_decorators = [ApiProperty({
                    description: '手机号（中国大陆，可带 +86 前缀）',
                    example: '13800138000',
                    pattern: '^(\\+86)?1[3-9]\\d{9}$',
                }), IsString({ message: '手机号必须是字符串' }), IsNotEmpty({ message: '手机号不能为空' }), Matches(/^(\+86)?1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })];
            _code_decorators = [ApiProperty({
                    description: '验证码（6位数字）',
                    example: '123456',
                    minLength: 6,
                    maxLength: 6,
                }), IsString({ message: '验证码必须是字符串' }), IsNotEmpty({ message: '验证码不能为空' }), MinLength(6, { message: '验证码必须是6位' }), MaxLength(6, { message: '验证码必须是6位' }), Matches(/^\d{6}$/, { message: '验证码必须是6位数字' })];
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { BindPhoneDto };
//# sourceMappingURL=sms-verification.dto.js.map