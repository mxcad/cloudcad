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
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
let RegisterDto = (() => {
    var _a;
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _password_decorators;
    let _password_initializers = [];
    let _password_extraInitializers = [];
    let _nickname_decorators;
    let _nickname_initializers = [];
    let _nickname_extraInitializers = [];
    let _wechatTempToken_decorators;
    let _wechatTempToken_initializers = [];
    let _wechatTempToken_extraInitializers = [];
    return _a = class RegisterDto {
            constructor() {
                this.email = __runInitializers(this, _email_initializers, void 0);
                this.username = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.password = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _password_initializers, void 0));
                this.nickname = (__runInitializers(this, _password_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.wechatTempToken = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _wechatTempToken_initializers, void 0));
                __runInitializers(this, _wechatTempToken_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _email_decorators = [ApiPropertyOptional({
                    description: '用户邮箱（邮件服务启用时可选）',
                    example: 'user@example.com',
                    format: 'email',
                }), IsOptional(), IsEmail({}, { message: '请输入有效的邮箱地址' }), Transform(({ value }) => (value === '' ? undefined : value))];
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
            _nickname_decorators = [ApiProperty({
                    description: '昵称',
                    example: '用户昵称',
                    required: false,
                    maxLength: 50,
                }), IsOptional(), IsString({ message: '昵称必须是字符串' }), MaxLength(50, { message: '昵称最多50个字符' })];
            _wechatTempToken_decorators = [ApiPropertyOptional({
                    description: '微信临时 Token（微信登录跳转注册时携带）',
                    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                }), IsOptional(), IsString({ message: '微信临时 Token 必须是字符串' })];
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _password_decorators, { kind: "field", name: "password", static: false, private: false, access: { has: obj => "password" in obj, get: obj => obj.password, set: (obj, value) => { obj.password = value; } }, metadata: _metadata }, _password_initializers, _password_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _wechatTempToken_decorators, { kind: "field", name: "wechatTempToken", static: false, private: false, access: { has: obj => "wechatTempToken" in obj, get: obj => obj.wechatTempToken, set: (obj, value) => { obj.wechatTempToken = value; } }, metadata: _metadata }, _wechatTempToken_initializers, _wechatTempToken_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { RegisterDto };
let LoginDto = (() => {
    var _a;
    let _account_decorators;
    let _account_initializers = [];
    let _account_extraInitializers = [];
    let _password_decorators;
    let _password_initializers = [];
    let _password_extraInitializers = [];
    return _a = class LoginDto {
            constructor() {
                this.account = __runInitializers(this, _account_initializers, void 0);
                this.password = (__runInitializers(this, _account_extraInitializers), __runInitializers(this, _password_initializers, void 0));
                __runInitializers(this, _password_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _account_decorators = [ApiProperty({
                    description: '邮箱、用户名或手机号',
                    example: 'user@example.com',
                }), IsString({ message: '登录账号必须是字符串' }), IsNotEmpty({ message: '登录账号不能为空' })];
            _password_decorators = [ApiProperty({
                    description: '密码',
                    example: 'Password123!',
                }), IsString({ message: '密码必须是字符串' }), IsNotEmpty({ message: '密码不能为空' })];
            __esDecorate(null, null, _account_decorators, { kind: "field", name: "account", static: false, private: false, access: { has: obj => "account" in obj, get: obj => obj.account, set: (obj, value) => { obj.account = value; } }, metadata: _metadata }, _account_initializers, _account_extraInitializers);
            __esDecorate(null, null, _password_decorators, { kind: "field", name: "password", static: false, private: false, access: { has: obj => "password" in obj, get: obj => obj.password, set: (obj, value) => { obj.password = value; } }, metadata: _metadata }, _password_initializers, _password_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { LoginDto };
let RefreshTokenDto = (() => {
    var _a;
    let _refreshToken_decorators;
    let _refreshToken_initializers = [];
    let _refreshToken_extraInitializers = [];
    return _a = class RefreshTokenDto {
            constructor() {
                this.refreshToken = __runInitializers(this, _refreshToken_initializers, void 0);
                __runInitializers(this, _refreshToken_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _refreshToken_decorators = [ApiProperty({
                    description: '刷新Token',
                    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                }), IsString({ message: '刷新Token必须是字符串' }), IsNotEmpty({ message: '刷新Token不能为空' })];
            __esDecorate(null, null, _refreshToken_decorators, { kind: "field", name: "refreshToken", static: false, private: false, access: { has: obj => "refreshToken" in obj, get: obj => obj.refreshToken, set: (obj, value) => { obj.refreshToken = value; } }, metadata: _metadata }, _refreshToken_initializers, _refreshToken_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { RefreshTokenDto };
let UserDto = (() => {
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
    let _role_decorators;
    let _role_initializers = [];
    let _role_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _phoneVerified_decorators;
    let _phoneVerified_initializers = [];
    let _phoneVerified_extraInitializers = [];
    let _wechatId_decorators;
    let _wechatId_initializers = [];
    let _wechatId_extraInitializers = [];
    let _provider_decorators;
    let _provider_initializers = [];
    let _provider_extraInitializers = [];
    let _hasPassword_decorators;
    let _hasPassword_initializers = [];
    let _hasPassword_extraInitializers = [];
    return _a = class UserDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.email = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _email_initializers, void 0));
                this.username = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.nickname = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.avatar = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _avatar_initializers, void 0));
                this.role = (__runInitializers(this, _avatar_extraInitializers), __runInitializers(this, _role_initializers, void 0));
                this.status = (__runInitializers(this, _role_extraInitializers), __runInitializers(this, _status_initializers, void 0));
                this.phone = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _phone_initializers, void 0));
                this.phoneVerified = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _phoneVerified_initializers, void 0));
                this.wechatId = (__runInitializers(this, _phoneVerified_extraInitializers), __runInitializers(this, _wechatId_initializers, void 0));
                this.provider = (__runInitializers(this, _wechatId_extraInitializers), __runInitializers(this, _provider_initializers, void 0));
                this.hasPassword = (__runInitializers(this, _provider_extraInitializers), __runInitializers(this, _hasPassword_initializers, void 0));
                __runInitializers(this, _hasPassword_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({
                    description: '用户ID',
                    example: '123e4567-e89b-12d3-a456-426614174000',
                })];
            _email_decorators = [ApiPropertyOptional({
                    description: '用户邮箱（可能未绑定）',
                    example: 'user@example.com',
                    nullable: true,
                })];
            _username_decorators = [ApiProperty({
                    description: '用户名',
                    example: 'username',
                })];
            _nickname_decorators = [ApiProperty({
                    description: '昵称',
                    example: '用户昵称',
                    required: false,
                })];
            _avatar_decorators = [ApiProperty({
                    description: '头像URL',
                    example: 'https://example.com/avatar.jpg',
                    required: false,
                })];
            _role_decorators = [ApiProperty({
                    description: '用户角色',
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: 'clxxxxxxx' },
                        name: {
                            type: 'string',
                            enum: ['ADMIN', 'USER_MANAGER', 'FONT_MANAGER', 'USER'],
                            example: 'USER',
                        },
                        description: {
                            type: 'string',
                            example: '普通用户，基础权限',
                            nullable: true,
                        },
                        isSystem: { type: 'boolean', example: true },
                        permissions: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: { permission: { type: 'string' } },
                            },
                        },
                    },
                })];
            _status_decorators = [ApiProperty({
                    description: '用户状态',
                    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
                    example: 'ACTIVE',
                })];
            _phone_decorators = [ApiPropertyOptional({
                    description: '用户手机号（可能未绑定）',
                    example: '13800138000',
                    nullable: true,
                })];
            _phoneVerified_decorators = [ApiPropertyOptional({
                    description: '手机号是否已验证',
                    example: false,
                })];
            _wechatId_decorators = [ApiPropertyOptional({
                    description: '微信 OpenID',
                    example: 'oXYZ123...',
                    nullable: true,
                })];
            _provider_decorators = [ApiPropertyOptional({
                    description: '登录方式 (LOCAL | WECHAT)',
                    example: 'LOCAL',
                })];
            _hasPassword_decorators = [ApiPropertyOptional({
                    description: '是否已设置密码',
                    example: true,
                })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _avatar_decorators, { kind: "field", name: "avatar", static: false, private: false, access: { has: obj => "avatar" in obj, get: obj => obj.avatar, set: (obj, value) => { obj.avatar = value; } }, metadata: _metadata }, _avatar_initializers, _avatar_extraInitializers);
            __esDecorate(null, null, _role_decorators, { kind: "field", name: "role", static: false, private: false, access: { has: obj => "role" in obj, get: obj => obj.role, set: (obj, value) => { obj.role = value; } }, metadata: _metadata }, _role_initializers, _role_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _phoneVerified_decorators, { kind: "field", name: "phoneVerified", static: false, private: false, access: { has: obj => "phoneVerified" in obj, get: obj => obj.phoneVerified, set: (obj, value) => { obj.phoneVerified = value; } }, metadata: _metadata }, _phoneVerified_initializers, _phoneVerified_extraInitializers);
            __esDecorate(null, null, _wechatId_decorators, { kind: "field", name: "wechatId", static: false, private: false, access: { has: obj => "wechatId" in obj, get: obj => obj.wechatId, set: (obj, value) => { obj.wechatId = value; } }, metadata: _metadata }, _wechatId_initializers, _wechatId_extraInitializers);
            __esDecorate(null, null, _provider_decorators, { kind: "field", name: "provider", static: false, private: false, access: { has: obj => "provider" in obj, get: obj => obj.provider, set: (obj, value) => { obj.provider = value; } }, metadata: _metadata }, _provider_initializers, _provider_extraInitializers);
            __esDecorate(null, null, _hasPassword_decorators, { kind: "field", name: "hasPassword", static: false, private: false, access: { has: obj => "hasPassword" in obj, get: obj => obj.hasPassword, set: (obj, value) => { obj.hasPassword = value; } }, metadata: _metadata }, _hasPassword_initializers, _hasPassword_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserDto };
let AuthResponseDto = (() => {
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
    return _a = class AuthResponseDto {
            constructor() {
                this.accessToken = __runInitializers(this, _accessToken_initializers, void 0);
                this.refreshToken = (__runInitializers(this, _accessToken_extraInitializers), __runInitializers(this, _refreshToken_initializers, void 0));
                this.user = (__runInitializers(this, _refreshToken_extraInitializers), __runInitializers(this, _user_initializers, void 0));
                __runInitializers(this, _user_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _accessToken_decorators = [ApiProperty({
                    description: '访问Token',
                    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                })];
            _refreshToken_decorators = [ApiProperty({
                    description: '刷新Token',
                    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                })];
            _user_decorators = [ApiProperty({
                    description: '用户信息',
                    type: () => UserDto,
                })];
            __esDecorate(null, null, _accessToken_decorators, { kind: "field", name: "accessToken", static: false, private: false, access: { has: obj => "accessToken" in obj, get: obj => obj.accessToken, set: (obj, value) => { obj.accessToken = value; } }, metadata: _metadata }, _accessToken_initializers, _accessToken_extraInitializers);
            __esDecorate(null, null, _refreshToken_decorators, { kind: "field", name: "refreshToken", static: false, private: false, access: { has: obj => "refreshToken" in obj, get: obj => obj.refreshToken, set: (obj, value) => { obj.refreshToken = value; } }, metadata: _metadata }, _refreshToken_initializers, _refreshToken_extraInitializers);
            __esDecorate(null, null, _user_decorators, { kind: "field", name: "user", static: false, private: false, access: { has: obj => "user" in obj, get: obj => obj.user, set: (obj, value) => { obj.user = value; } }, metadata: _metadata }, _user_initializers, _user_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { AuthResponseDto };
export class AuthApiResponseDto extends ApiResponseDto {
}
//# sourceMappingURL=auth.dto.js.map