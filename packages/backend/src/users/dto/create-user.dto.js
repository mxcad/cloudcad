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
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, IsBoolean, } from 'class-validator';
let CreateUserDto = (() => {
    var _a;
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _password_decorators;
    let _password_initializers = [];
    let _password_extraInitializers = [];
    let _nickname_decorators;
    let _nickname_initializers = [];
    let _nickname_extraInitializers = [];
    let _avatar_decorators;
    let _avatar_initializers = [];
    let _avatar_extraInitializers = [];
    let _roleId_decorators;
    let _roleId_initializers = [];
    let _roleId_extraInitializers = [];
    let _phoneVerified_decorators;
    let _phoneVerified_initializers = [];
    let _phoneVerified_extraInitializers = [];
    let _emailVerified_decorators;
    let _emailVerified_initializers = [];
    let _emailVerified_extraInitializers = [];
    let _wechatId_decorators;
    let _wechatId_initializers = [];
    let _wechatId_extraInitializers = [];
    let _provider_decorators;
    let _provider_initializers = [];
    let _provider_extraInitializers = [];
    return _a = class CreateUserDto {
            constructor() {
                this.email = __runInitializers(this, _email_initializers, void 0);
                this.phone = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _phone_initializers, void 0));
                this.username = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.password = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _password_initializers, void 0));
                this.nickname = (__runInitializers(this, _password_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.avatar = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _avatar_initializers, void 0));
                this.roleId = (__runInitializers(this, _avatar_extraInitializers), __runInitializers(this, _roleId_initializers, void 0));
                this.phoneVerified = (__runInitializers(this, _roleId_extraInitializers), __runInitializers(this, _phoneVerified_initializers, void 0));
                this.emailVerified = (__runInitializers(this, _phoneVerified_extraInitializers), __runInitializers(this, _emailVerified_initializers, void 0));
                this.wechatId = (__runInitializers(this, _emailVerified_extraInitializers), __runInitializers(this, _wechatId_initializers, void 0));
                this.provider = (__runInitializers(this, _wechatId_extraInitializers), __runInitializers(this, _provider_initializers, void 0));
                __runInitializers(this, _provider_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _email_decorators = [ApiProperty({
                    description: '用户邮箱（可选，当 mailEnabled=true 时建议填写）',
                    example: 'user@example.com',
                    format: 'email',
                    required: false,
                }), IsOptional(), IsEmail({}, { message: '请输入有效的邮箱地址' })];
            _phone_decorators = [ApiProperty({
                    description: '手机号（中国大陆）',
                    example: '13800138000',
                    required: false,
                }), IsOptional(), IsString({ message: '手机号必须是字符串' }), Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的中国大陆手机号' })];
            _username_decorators = [ApiProperty({
                    description: '用户名',
                    example: 'username',
                    minLength: 3,
                    maxLength: 20,
                    pattern: '^[a-zA-Z0-9_]+$',
                }), IsString({ message: '用户名必须是字符串' }), IsNotEmpty({ message: '用户名不能为空' }), MinLength(3, { message: '用户名至少3个字符' }), MaxLength(20, { message: '用户名最多20个字符' }), Matches(/^[a-zA-Z0-9_]+$/, {
                    message: '用户名只能包含字母、数字和下划线',
                })];
            _password_decorators = [ApiProperty({
                    description: '密码',
                    example: 'password123',
                    minLength: 8,
                    maxLength: 50,
                }), IsString({ message: '密码必须是字符串' }), IsNotEmpty({ message: '密码不能为空' }), MinLength(8, { message: '密码至少8个字符' }), MaxLength(50, { message: '密码最多50个字符' })];
            _nickname_decorators = [ApiProperty({ description: '昵称', required: false, maxLength: 50 }), IsOptional(), IsString({ message: '昵称必须是字符串' }), MaxLength(50, { message: '昵称最多50个字符' })];
            _avatar_decorators = [ApiProperty({ description: '头像URL', required: false }), IsOptional(), IsString()];
            _roleId_decorators = [ApiProperty({
                    description: '角色ID',
                    example: 'clh8x9y0z1a2b3c4d5e6f7g8h9',
                    required: false,
                }), IsOptional(), IsString({ message: '角色ID必须是字符串' })];
            _phoneVerified_decorators = [ApiProperty({
                    description: '手机号是否已验证',
                    required: false,
                    default: false,
                }), IsOptional(), IsBoolean({ message: 'phoneVerified 必须是布尔值' })];
            _emailVerified_decorators = [ApiProperty({
                    description: '邮箱是否已验证',
                    required: false,
                    default: false,
                }), IsOptional(), IsBoolean({ message: 'emailVerified 必须是布尔值' })];
            _wechatId_decorators = [ApiProperty({ description: '微信 OpenID', required: false }), IsOptional(), IsString()];
            _provider_decorators = [ApiProperty({
                    description: '登录方式 (LOCAL | WECHAT)',
                    required: false,
                    default: 'LOCAL',
                }), IsOptional(), IsString()];
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _password_decorators, { kind: "field", name: "password", static: false, private: false, access: { has: obj => "password" in obj, get: obj => obj.password, set: (obj, value) => { obj.password = value; } }, metadata: _metadata }, _password_initializers, _password_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _avatar_decorators, { kind: "field", name: "avatar", static: false, private: false, access: { has: obj => "avatar" in obj, get: obj => obj.avatar, set: (obj, value) => { obj.avatar = value; } }, metadata: _metadata }, _avatar_initializers, _avatar_extraInitializers);
            __esDecorate(null, null, _roleId_decorators, { kind: "field", name: "roleId", static: false, private: false, access: { has: obj => "roleId" in obj, get: obj => obj.roleId, set: (obj, value) => { obj.roleId = value; } }, metadata: _metadata }, _roleId_initializers, _roleId_extraInitializers);
            __esDecorate(null, null, _phoneVerified_decorators, { kind: "field", name: "phoneVerified", static: false, private: false, access: { has: obj => "phoneVerified" in obj, get: obj => obj.phoneVerified, set: (obj, value) => { obj.phoneVerified = value; } }, metadata: _metadata }, _phoneVerified_initializers, _phoneVerified_extraInitializers);
            __esDecorate(null, null, _emailVerified_decorators, { kind: "field", name: "emailVerified", static: false, private: false, access: { has: obj => "emailVerified" in obj, get: obj => obj.emailVerified, set: (obj, value) => { obj.emailVerified = value; } }, metadata: _metadata }, _emailVerified_initializers, _emailVerified_extraInitializers);
            __esDecorate(null, null, _wechatId_decorators, { kind: "field", name: "wechatId", static: false, private: false, access: { has: obj => "wechatId" in obj, get: obj => obj.wechatId, set: (obj, value) => { obj.wechatId = value; } }, metadata: _metadata }, _wechatId_initializers, _wechatId_extraInitializers);
            __esDecorate(null, null, _provider_decorators, { kind: "field", name: "provider", static: false, private: false, access: { has: obj => "provider" in obj, get: obj => obj.provider, set: (obj, value) => { obj.provider = value; } }, metadata: _metadata }, _provider_initializers, _provider_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { CreateUserDto };
//# sourceMappingURL=create-user.dto.js.map