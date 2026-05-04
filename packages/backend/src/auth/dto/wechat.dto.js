///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
/**
 * 微信用户信息 DTO
 */
let WechatUserInfoDto = (() => {
    var _a;
    let _openid_decorators;
    let _openid_initializers = [];
    let _openid_extraInitializers = [];
    let _nickname_decorators;
    let _nickname_initializers = [];
    let _nickname_extraInitializers = [];
    let _avatar_decorators;
    let _avatar_initializers = [];
    let _avatar_extraInitializers = [];
    let _sex_decorators;
    let _sex_initializers = [];
    let _sex_extraInitializers = [];
    let _province_decorators;
    let _province_initializers = [];
    let _province_extraInitializers = [];
    let _city_decorators;
    let _city_initializers = [];
    let _city_extraInitializers = [];
    let _country_decorators;
    let _country_initializers = [];
    let _country_extraInitializers = [];
    return _a = class WechatUserInfoDto {
            constructor() {
                this.openid = __runInitializers(this, _openid_initializers, void 0);
                this.nickname = (__runInitializers(this, _openid_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.avatar = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _avatar_initializers, void 0));
                this.sex = (__runInitializers(this, _avatar_extraInitializers), __runInitializers(this, _sex_initializers, void 0));
                this.province = (__runInitializers(this, _sex_extraInitializers), __runInitializers(this, _province_initializers, void 0));
                this.city = (__runInitializers(this, _province_extraInitializers), __runInitializers(this, _city_initializers, void 0));
                this.country = (__runInitializers(this, _city_extraInitializers), __runInitializers(this, _country_initializers, void 0));
                __runInitializers(this, _country_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _openid_decorators = [ApiProperty({ description: '用户 openid' })];
            _nickname_decorators = [ApiProperty({ description: '昵称' })];
            _avatar_decorators = [ApiProperty({ description: '头像 URL' })];
            _sex_decorators = [ApiPropertyOptional({ description: '性别' })];
            _province_decorators = [ApiPropertyOptional({ description: '省份' })];
            _city_decorators = [ApiPropertyOptional({ description: '城市' })];
            _country_decorators = [ApiPropertyOptional({ description: '国家' })];
            __esDecorate(null, null, _openid_decorators, { kind: "field", name: "openid", static: false, private: false, access: { has: obj => "openid" in obj, get: obj => obj.openid, set: (obj, value) => { obj.openid = value; } }, metadata: _metadata }, _openid_initializers, _openid_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _avatar_decorators, { kind: "field", name: "avatar", static: false, private: false, access: { has: obj => "avatar" in obj, get: obj => obj.avatar, set: (obj, value) => { obj.avatar = value; } }, metadata: _metadata }, _avatar_initializers, _avatar_extraInitializers);
            __esDecorate(null, null, _sex_decorators, { kind: "field", name: "sex", static: false, private: false, access: { has: obj => "sex" in obj, get: obj => obj.sex, set: (obj, value) => { obj.sex = value; } }, metadata: _metadata }, _sex_initializers, _sex_extraInitializers);
            __esDecorate(null, null, _province_decorators, { kind: "field", name: "province", static: false, private: false, access: { has: obj => "province" in obj, get: obj => obj.province, set: (obj, value) => { obj.province = value; } }, metadata: _metadata }, _province_initializers, _province_extraInitializers);
            __esDecorate(null, null, _city_decorators, { kind: "field", name: "city", static: false, private: false, access: { has: obj => "city" in obj, get: obj => obj.city, set: (obj, value) => { obj.city = value; } }, metadata: _metadata }, _city_initializers, _city_extraInitializers);
            __esDecorate(null, null, _country_decorators, { kind: "field", name: "country", static: false, private: false, access: { has: obj => "country" in obj, get: obj => obj.country, set: (obj, value) => { obj.country = value; } }, metadata: _metadata }, _country_initializers, _country_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { WechatUserInfoDto };
/**
 * 微信登录响应中的用户信息 DTO（包含完整用户数据）
 */
let WechatLoginUserDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _nickname_decorators;
    let _nickname_initializers = [];
    let _nickname_extraInitializers = [];
    let _avatar_decorators;
    let _avatar_initializers = [];
    let _avatar_extraInitializers = [];
    let _wechatId_decorators;
    let _wechatId_initializers = [];
    let _wechatId_extraInitializers = [];
    let _provider_decorators;
    let _provider_initializers = [];
    let _provider_extraInitializers = [];
    let _role_decorators;
    let _role_initializers = [];
    let _role_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _emailVerified_decorators;
    let _emailVerified_initializers = [];
    let _emailVerified_extraInitializers = [];
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _phoneVerified_decorators;
    let _phoneVerified_initializers = [];
    let _phoneVerified_extraInitializers = [];
    return _a = class WechatLoginUserDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.email = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _email_initializers, void 0));
                this.username = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.nickname = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.avatar = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _avatar_initializers, void 0));
                this.wechatId = (__runInitializers(this, _avatar_extraInitializers), __runInitializers(this, _wechatId_initializers, void 0));
                this.provider = (__runInitializers(this, _wechatId_extraInitializers), __runInitializers(this, _provider_initializers, void 0));
                this.role = (__runInitializers(this, _provider_extraInitializers), __runInitializers(this, _role_initializers, void 0));
                this.status = (__runInitializers(this, _role_extraInitializers), __runInitializers(this, _status_initializers, void 0));
                this.emailVerified = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _emailVerified_initializers, void 0));
                this.phone = (__runInitializers(this, _emailVerified_extraInitializers), __runInitializers(this, _phone_initializers, void 0));
                this.phoneVerified = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _phoneVerified_initializers, void 0));
                __runInitializers(this, _phoneVerified_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: '用户 ID' })];
            _email_decorators = [ApiPropertyOptional({ description: '邮箱' })];
            _username_decorators = [ApiProperty({ description: '用户名' })];
            _nickname_decorators = [ApiPropertyOptional({ description: '昵称' })];
            _avatar_decorators = [ApiPropertyOptional({ description: '头像 URL' })];
            _wechatId_decorators = [ApiPropertyOptional({ description: '微信 openid' })];
            _provider_decorators = [ApiProperty({ description: '登录方式' })];
            _role_decorators = [ApiProperty({ description: '角色信息' })];
            _status_decorators = [ApiProperty({ description: '用户状态' })];
            _emailVerified_decorators = [ApiProperty({ description: '邮箱是否验证' })];
            _phone_decorators = [ApiPropertyOptional({ description: '手机号' })];
            _phoneVerified_decorators = [ApiProperty({ description: '手机是否验证' })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _avatar_decorators, { kind: "field", name: "avatar", static: false, private: false, access: { has: obj => "avatar" in obj, get: obj => obj.avatar, set: (obj, value) => { obj.avatar = value; } }, metadata: _metadata }, _avatar_initializers, _avatar_extraInitializers);
            __esDecorate(null, null, _wechatId_decorators, { kind: "field", name: "wechatId", static: false, private: false, access: { has: obj => "wechatId" in obj, get: obj => obj.wechatId, set: (obj, value) => { obj.wechatId = value; } }, metadata: _metadata }, _wechatId_initializers, _wechatId_extraInitializers);
            __esDecorate(null, null, _provider_decorators, { kind: "field", name: "provider", static: false, private: false, access: { has: obj => "provider" in obj, get: obj => obj.provider, set: (obj, value) => { obj.provider = value; } }, metadata: _metadata }, _provider_initializers, _provider_extraInitializers);
            __esDecorate(null, null, _role_decorators, { kind: "field", name: "role", static: false, private: false, access: { has: obj => "role" in obj, get: obj => obj.role, set: (obj, value) => { obj.role = value; } }, metadata: _metadata }, _role_initializers, _role_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _emailVerified_decorators, { kind: "field", name: "emailVerified", static: false, private: false, access: { has: obj => "emailVerified" in obj, get: obj => obj.emailVerified, set: (obj, value) => { obj.emailVerified = value; } }, metadata: _metadata }, _emailVerified_initializers, _emailVerified_extraInitializers);
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _phoneVerified_decorators, { kind: "field", name: "phoneVerified", static: false, private: false, access: { has: obj => "phoneVerified" in obj, get: obj => obj.phoneVerified, set: (obj, value) => { obj.phoneVerified = value; } }, metadata: _metadata }, _phoneVerified_initializers, _phoneVerified_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { WechatLoginUserDto };
/**
 * 微信登录响应 DTO
 */
let WechatLoginResponseDto = (() => {
    var _a;
    let _accessToken_decorators;
    let _accessToken_initializers = [];
    let _accessToken_extraInitializers = [];
    let _refreshToken_decorators;
    let _refreshToken_initializers = [];
    let _refreshToken_extraInitializers = [];
    let _user_decorators;
    let _user_initializers = [];
    let _user_extraInitializers = [];
    let _requireEmailBinding_decorators;
    let _requireEmailBinding_initializers = [];
    let _requireEmailBinding_extraInitializers = [];
    let _requirePhoneBinding_decorators;
    let _requirePhoneBinding_initializers = [];
    let _requirePhoneBinding_extraInitializers = [];
    let _tempToken_decorators;
    let _tempToken_initializers = [];
    let _tempToken_extraInitializers = [];
    let _needRegister_decorators;
    let _needRegister_initializers = [];
    let _needRegister_extraInitializers = [];
    return _a = class WechatLoginResponseDto {
            constructor() {
                this.accessToken = __runInitializers(this, _accessToken_initializers, void 0);
                this.refreshToken = (__runInitializers(this, _accessToken_extraInitializers), __runInitializers(this, _refreshToken_initializers, void 0));
                this.user = (__runInitializers(this, _refreshToken_extraInitializers), __runInitializers(this, _user_initializers, void 0));
                this.requireEmailBinding = (__runInitializers(this, _user_extraInitializers), __runInitializers(this, _requireEmailBinding_initializers, void 0));
                this.requirePhoneBinding = (__runInitializers(this, _requireEmailBinding_extraInitializers), __runInitializers(this, _requirePhoneBinding_initializers, void 0));
                this.tempToken = (__runInitializers(this, _requirePhoneBinding_extraInitializers), __runInitializers(this, _tempToken_initializers, void 0));
                this.needRegister = (__runInitializers(this, _tempToken_extraInitializers), __runInitializers(this, _needRegister_initializers, void 0));
                __runInitializers(this, _needRegister_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _accessToken_decorators = [ApiProperty({ description: '访问令牌' })];
            _refreshToken_decorators = [ApiProperty({ description: '刷新令牌' })];
            _user_decorators = [ApiProperty({ description: '用户信息' })];
            _requireEmailBinding_decorators = [ApiProperty({
                    description: '是否需要绑定邮箱',
                    required: false,
                })];
            _requirePhoneBinding_decorators = [ApiProperty({
                    description: '是否需要绑定手机',
                    required: false,
                })];
            _tempToken_decorators = [ApiPropertyOptional({
                    description: '临时令牌（用于绑定流程或待注册状态）',
                })];
            _needRegister_decorators = [ApiPropertyOptional({
                    description: '是否需要注册（首次登录且未开启自动注册时）',
                })];
            __esDecorate(null, null, _accessToken_decorators, { kind: "field", name: "accessToken", static: false, private: false, access: { has: obj => "accessToken" in obj, get: obj => obj.accessToken, set: (obj, value) => { obj.accessToken = value; } }, metadata: _metadata }, _accessToken_initializers, _accessToken_extraInitializers);
            __esDecorate(null, null, _refreshToken_decorators, { kind: "field", name: "refreshToken", static: false, private: false, access: { has: obj => "refreshToken" in obj, get: obj => obj.refreshToken, set: (obj, value) => { obj.refreshToken = value; } }, metadata: _metadata }, _refreshToken_initializers, _refreshToken_extraInitializers);
            __esDecorate(null, null, _user_decorators, { kind: "field", name: "user", static: false, private: false, access: { has: obj => "user" in obj, get: obj => obj.user, set: (obj, value) => { obj.user = value; } }, metadata: _metadata }, _user_initializers, _user_extraInitializers);
            __esDecorate(null, null, _requireEmailBinding_decorators, { kind: "field", name: "requireEmailBinding", static: false, private: false, access: { has: obj => "requireEmailBinding" in obj, get: obj => obj.requireEmailBinding, set: (obj, value) => { obj.requireEmailBinding = value; } }, metadata: _metadata }, _requireEmailBinding_initializers, _requireEmailBinding_extraInitializers);
            __esDecorate(null, null, _requirePhoneBinding_decorators, { kind: "field", name: "requirePhoneBinding", static: false, private: false, access: { has: obj => "requirePhoneBinding" in obj, get: obj => obj.requirePhoneBinding, set: (obj, value) => { obj.requirePhoneBinding = value; } }, metadata: _metadata }, _requirePhoneBinding_initializers, _requirePhoneBinding_extraInitializers);
            __esDecorate(null, null, _tempToken_decorators, { kind: "field", name: "tempToken", static: false, private: false, access: { has: obj => "tempToken" in obj, get: obj => obj.tempToken, set: (obj, value) => { obj.tempToken = value; } }, metadata: _metadata }, _tempToken_initializers, _tempToken_extraInitializers);
            __esDecorate(null, null, _needRegister_decorators, { kind: "field", name: "needRegister", static: false, private: false, access: { has: obj => "needRegister" in obj, get: obj => obj.needRegister, set: (obj, value) => { obj.needRegister = value; } }, metadata: _metadata }, _needRegister_initializers, _needRegister_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { WechatLoginResponseDto };
/**
 * 微信绑定响应 DTO
 */
let WechatBindResponseDto = (() => {
    var _a;
    let _success_decorators;
    let _success_initializers = [];
    let _success_extraInitializers = [];
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class WechatBindResponseDto {
            constructor() {
                this.success = __runInitializers(this, _success_initializers, void 0);
                this.message = (__runInitializers(this, _success_extraInitializers), __runInitializers(this, _message_initializers, void 0));
                __runInitializers(this, _message_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _success_decorators = [ApiProperty({ description: '是否绑定成功' })];
            _message_decorators = [ApiProperty({ description: '消息' })];
            __esDecorate(null, null, _success_decorators, { kind: "field", name: "success", static: false, private: false, access: { has: obj => "success" in obj, get: obj => obj.success, set: (obj, value) => { obj.success = value; } }, metadata: _metadata }, _success_initializers, _success_extraInitializers);
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { WechatBindResponseDto };
/**
 * 微信解绑响应 DTO
 */
let WechatUnbindResponseDto = (() => {
    var _a;
    let _success_decorators;
    let _success_initializers = [];
    let _success_extraInitializers = [];
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class WechatUnbindResponseDto {
            constructor() {
                this.success = __runInitializers(this, _success_initializers, void 0);
                this.message = (__runInitializers(this, _success_extraInitializers), __runInitializers(this, _message_initializers, void 0));
                __runInitializers(this, _message_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _success_decorators = [ApiProperty({ description: '是否解绑成功' })];
            _message_decorators = [ApiProperty({ description: '消息' })];
            __esDecorate(null, null, _success_decorators, { kind: "field", name: "success", static: false, private: false, access: { has: obj => "success" in obj, get: obj => obj.success, set: (obj, value) => { obj.success = value; } }, metadata: _metadata }, _success_initializers, _success_extraInitializers);
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { WechatUnbindResponseDto };
//# sourceMappingURL=wechat.dto.js.map