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
import { UserStatus } from '@prisma/client';
import { StorageInfoDto } from '../../common/dto/storage-info.dto';
/**
 * 用户角色 DTO
 */
let UserRoleDto = (() => {
    var _a;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _isSystem_decorators;
    let _isSystem_initializers = [];
    let _isSystem_extraInitializers = [];
    return _a = class UserRoleDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.name = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _name_initializers, void 0));
                this.description = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _description_initializers, void 0));
                this.isSystem = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _isSystem_initializers, void 0));
                __runInitializers(this, _isSystem_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: '角色 ID' })];
            _name_decorators = [ApiProperty({ description: '角色名称' })];
            _description_decorators = [ApiProperty({ description: '角色描述', required: false })];
            _isSystem_decorators = [ApiProperty({ description: '是否为系统角色' })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _isSystem_decorators, { kind: "field", name: "isSystem", static: false, private: false, access: { has: obj => "isSystem" in obj, get: obj => obj.isSystem, set: (obj, value) => { obj.isSystem = value; } }, metadata: _metadata }, _isSystem_initializers, _isSystem_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserRoleDto };
/**
 * 用户响应 DTO
 */
let UserResponseDto = (() => {
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
    let _phone_decorators;
    let _phone_initializers = [];
    let _phone_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _role_decorators;
    let _role_initializers = [];
    let _role_extraInitializers = [];
    let _hasPassword_decorators;
    let _hasPassword_initializers = [];
    let _hasPassword_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    return _a = class UserResponseDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.email = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _email_initializers, void 0));
                this.username = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.nickname = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.avatar = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _avatar_initializers, void 0));
                this.phone = (__runInitializers(this, _avatar_extraInitializers), __runInitializers(this, _phone_initializers, void 0));
                this.status = (__runInitializers(this, _phone_extraInitializers), __runInitializers(this, _status_initializers, void 0));
                this.role = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _role_initializers, void 0));
                this.hasPassword = (__runInitializers(this, _role_extraInitializers), __runInitializers(this, _hasPassword_initializers, void 0));
                this.createdAt = (__runInitializers(this, _hasPassword_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
                this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
                __runInitializers(this, _updatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: '用户 ID' })];
            _email_decorators = [ApiProperty({ description: '用户邮箱' })];
            _username_decorators = [ApiProperty({ description: '用户名' })];
            _nickname_decorators = [ApiProperty({ description: '用户昵称', required: false })];
            _avatar_decorators = [ApiProperty({ description: '头像 URL', required: false })];
            _phone_decorators = [ApiPropertyOptional({ description: '手机号码' })];
            _status_decorators = [ApiProperty({
                    description: '用户状态',
                    enum: Object.values(UserStatus),
                    enumName: 'UserStatusEnum',
                })];
            _role_decorators = [ApiProperty({ description: '用户角色', type: () => UserRoleDto })];
            _hasPassword_decorators = [ApiProperty({
                    description: '是否已设置密码（手机/微信自动注册用户可能未设置）',
                })];
            _createdAt_decorators = [ApiProperty({ description: '创建时间' })];
            _updatedAt_decorators = [ApiProperty({ description: '更新时间' })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _avatar_decorators, { kind: "field", name: "avatar", static: false, private: false, access: { has: obj => "avatar" in obj, get: obj => obj.avatar, set: (obj, value) => { obj.avatar = value; } }, metadata: _metadata }, _avatar_initializers, _avatar_extraInitializers);
            __esDecorate(null, null, _phone_decorators, { kind: "field", name: "phone", static: false, private: false, access: { has: obj => "phone" in obj, get: obj => obj.phone, set: (obj, value) => { obj.phone = value; } }, metadata: _metadata }, _phone_initializers, _phone_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _role_decorators, { kind: "field", name: "role", static: false, private: false, access: { has: obj => "role" in obj, get: obj => obj.role, set: (obj, value) => { obj.role = value; } }, metadata: _metadata }, _role_initializers, _role_extraInitializers);
            __esDecorate(null, null, _hasPassword_decorators, { kind: "field", name: "hasPassword", static: false, private: false, access: { has: obj => "hasPassword" in obj, get: obj => obj.hasPassword, set: (obj, value) => { obj.hasPassword = value; } }, metadata: _metadata }, _hasPassword_initializers, _hasPassword_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserResponseDto };
/**
 * 用户列表响应 DTO
 */
let UserListResponseDto = (() => {
    var _a;
    let _users_decorators;
    let _users_initializers = [];
    let _users_extraInitializers = [];
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    let _page_decorators;
    let _page_initializers = [];
    let _page_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    let _totalPages_decorators;
    let _totalPages_initializers = [];
    let _totalPages_extraInitializers = [];
    return _a = class UserListResponseDto {
            constructor() {
                this.users = __runInitializers(this, _users_initializers, void 0);
                this.total = (__runInitializers(this, _users_extraInitializers), __runInitializers(this, _total_initializers, void 0));
                this.page = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _page_initializers, void 0));
                this.limit = (__runInitializers(this, _page_extraInitializers), __runInitializers(this, _limit_initializers, void 0));
                this.totalPages = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _totalPages_initializers, void 0));
                __runInitializers(this, _totalPages_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _users_decorators = [ApiProperty({ description: '用户列表', type: () => [UserResponseDto] })];
            _total_decorators = [ApiProperty({ description: '总数' })];
            _page_decorators = [ApiProperty({ description: '当前页码' })];
            _limit_decorators = [ApiProperty({ description: '每页数量' })];
            _totalPages_decorators = [ApiProperty({ description: '总页数' })];
            __esDecorate(null, null, _users_decorators, { kind: "field", name: "users", static: false, private: false, access: { has: obj => "users" in obj, get: obj => obj.users, set: (obj, value) => { obj.users = value; } }, metadata: _metadata }, _users_initializers, _users_extraInitializers);
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _page_decorators, { kind: "field", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page, set: (obj, value) => { obj.page = value; } }, metadata: _metadata }, _page_initializers, _page_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _totalPages_decorators, { kind: "field", name: "totalPages", static: false, private: false, access: { has: obj => "totalPages" in obj, get: obj => obj.totalPages, set: (obj, value) => { obj.totalPages = value; } }, metadata: _metadata }, _totalPages_initializers, _totalPages_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserListResponseDto };
/**
 * 用户搜索结果 DTO
 */
let UserSearchResultDto = (() => {
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
    return _a = class UserSearchResultDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.email = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _email_initializers, void 0));
                this.username = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.nickname = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.avatar = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _avatar_initializers, void 0));
                __runInitializers(this, _avatar_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: '用户 ID' })];
            _email_decorators = [ApiProperty({ description: '用户邮箱' })];
            _username_decorators = [ApiProperty({ description: '用户名' })];
            _nickname_decorators = [ApiProperty({ description: '用户昵称', required: false })];
            _avatar_decorators = [ApiProperty({ description: '头像 URL', required: false })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _avatar_decorators, { kind: "field", name: "avatar", static: false, private: false, access: { has: obj => "avatar" in obj, get: obj => obj.avatar, set: (obj, value) => { obj.avatar = value; } }, metadata: _metadata }, _avatar_initializers, _avatar_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserSearchResultDto };
/**
 * 修改密码响应 DTO
 */
let ChangePasswordResponseDto = (() => {
    var _a;
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    return _a = class ChangePasswordResponseDto {
            constructor() {
                this.message = __runInitializers(this, _message_initializers, void 0);
                __runInitializers(this, _message_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _message_decorators = [ApiProperty({ description: '提示消息' })];
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { ChangePasswordResponseDto };
/**
 * 用户资料响应 DTO
 */
let UserProfileResponseDto = (() => {
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
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _role_decorators;
    let _role_initializers = [];
    let _role_extraInitializers = [];
    let _hasPassword_decorators;
    let _hasPassword_initializers = [];
    let _hasPassword_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    return _a = class UserProfileResponseDto {
            constructor() {
                this.id = __runInitializers(this, _id_initializers, void 0);
                this.email = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _email_initializers, void 0));
                this.username = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _username_initializers, void 0));
                this.nickname = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _nickname_initializers, void 0));
                this.avatar = (__runInitializers(this, _nickname_extraInitializers), __runInitializers(this, _avatar_initializers, void 0));
                this.status = (__runInitializers(this, _avatar_extraInitializers), __runInitializers(this, _status_initializers, void 0));
                this.role = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _role_initializers, void 0));
                this.hasPassword = (__runInitializers(this, _role_extraInitializers), __runInitializers(this, _hasPassword_initializers, void 0));
                this.createdAt = (__runInitializers(this, _hasPassword_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
                this.updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
                __runInitializers(this, _updatedAt_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [ApiProperty({ description: '用户 ID' })];
            _email_decorators = [ApiProperty({ description: '用户邮箱' })];
            _username_decorators = [ApiProperty({ description: '用户名' })];
            _nickname_decorators = [ApiProperty({ description: '用户昵称', required: false })];
            _avatar_decorators = [ApiProperty({ description: '头像 URL', required: false })];
            _status_decorators = [ApiProperty({
                    description: '用户状态',
                    enum: Object.values(UserStatus),
                    enumName: 'UserStatusEnum',
                })];
            _role_decorators = [ApiProperty({ description: '用户角色', type: () => UserRoleDto })];
            _hasPassword_decorators = [ApiProperty({
                    description: '是否已设置密码（手机/微信自动注册用户可能未设置）',
                })];
            _createdAt_decorators = [ApiProperty({ description: '创建时间' })];
            _updatedAt_decorators = [ApiProperty({ description: '更新时间' })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _nickname_decorators, { kind: "field", name: "nickname", static: false, private: false, access: { has: obj => "nickname" in obj, get: obj => obj.nickname, set: (obj, value) => { obj.nickname = value; } }, metadata: _metadata }, _nickname_initializers, _nickname_extraInitializers);
            __esDecorate(null, null, _avatar_decorators, { kind: "field", name: "avatar", static: false, private: false, access: { has: obj => "avatar" in obj, get: obj => obj.avatar, set: (obj, value) => { obj.avatar = value; } }, metadata: _metadata }, _avatar_initializers, _avatar_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _role_decorators, { kind: "field", name: "role", static: false, private: false, access: { has: obj => "role" in obj, get: obj => obj.role, set: (obj, value) => { obj.role = value; } }, metadata: _metadata }, _role_initializers, _role_extraInitializers);
            __esDecorate(null, null, _hasPassword_decorators, { kind: "field", name: "hasPassword", static: false, private: false, access: { has: obj => "hasPassword" in obj, get: obj => obj.hasPassword, set: (obj, value) => { obj.hasPassword = value; } }, metadata: _metadata }, _hasPassword_initializers, _hasPassword_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserProfileResponseDto };
/**
 * 文件类型统计 DTO
 */
let FileTypeStatsDto = (() => {
    var _a;
    let _dwg_decorators;
    let _dwg_initializers = [];
    let _dwg_extraInitializers = [];
    let _dxf_decorators;
    let _dxf_initializers = [];
    let _dxf_extraInitializers = [];
    let _other_decorators;
    let _other_initializers = [];
    let _other_extraInitializers = [];
    return _a = class FileTypeStatsDto {
            constructor() {
                this.dwg = __runInitializers(this, _dwg_initializers, void 0);
                this.dxf = (__runInitializers(this, _dwg_extraInitializers), __runInitializers(this, _dxf_initializers, void 0));
                this.other = (__runInitializers(this, _dxf_extraInitializers), __runInitializers(this, _other_initializers, void 0));
                __runInitializers(this, _other_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _dwg_decorators = [ApiProperty({ description: 'DWG 文件数量' })];
            _dxf_decorators = [ApiProperty({ description: 'DXF 文件数量' })];
            _other_decorators = [ApiProperty({ description: '其他文件数量' })];
            __esDecorate(null, null, _dwg_decorators, { kind: "field", name: "dwg", static: false, private: false, access: { has: obj => "dwg" in obj, get: obj => obj.dwg, set: (obj, value) => { obj.dwg = value; } }, metadata: _metadata }, _dwg_initializers, _dwg_extraInitializers);
            __esDecorate(null, null, _dxf_decorators, { kind: "field", name: "dxf", static: false, private: false, access: { has: obj => "dxf" in obj, get: obj => obj.dxf, set: (obj, value) => { obj.dxf = value; } }, metadata: _metadata }, _dxf_initializers, _dxf_extraInitializers);
            __esDecorate(null, null, _other_decorators, { kind: "field", name: "other", static: false, private: false, access: { has: obj => "other" in obj, get: obj => obj.other, set: (obj, value) => { obj.other = value; } }, metadata: _metadata }, _other_initializers, _other_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { FileTypeStatsDto };
/**
 * 用户仪表盘统计 DTO
 */
let UserDashboardStatsDto = (() => {
    var _a;
    let _projectCount_decorators;
    let _projectCount_initializers = [];
    let _projectCount_extraInitializers = [];
    let _totalFiles_decorators;
    let _totalFiles_initializers = [];
    let _totalFiles_extraInitializers = [];
    let _todayUploads_decorators;
    let _todayUploads_initializers = [];
    let _todayUploads_extraInitializers = [];
    let _fileTypeStats_decorators;
    let _fileTypeStats_initializers = [];
    let _fileTypeStats_extraInitializers = [];
    let _storage_decorators;
    let _storage_initializers = [];
    let _storage_extraInitializers = [];
    return _a = class UserDashboardStatsDto {
            constructor() {
                this.projectCount = __runInitializers(this, _projectCount_initializers, void 0);
                this.totalFiles = (__runInitializers(this, _projectCount_extraInitializers), __runInitializers(this, _totalFiles_initializers, void 0));
                this.todayUploads = (__runInitializers(this, _totalFiles_extraInitializers), __runInitializers(this, _todayUploads_initializers, void 0));
                this.fileTypeStats = (__runInitializers(this, _todayUploads_extraInitializers), __runInitializers(this, _fileTypeStats_initializers, void 0));
                this.storage = (__runInitializers(this, _fileTypeStats_extraInitializers), __runInitializers(this, _storage_initializers, void 0));
                __runInitializers(this, _storage_extraInitializers);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _projectCount_decorators = [ApiProperty({ description: '项目数量' })];
            _totalFiles_decorators = [ApiProperty({ description: '文件总数' })];
            _todayUploads_decorators = [ApiProperty({ description: '今日上传数量' })];
            _fileTypeStats_decorators = [ApiProperty({ description: '文件类型统计', type: () => FileTypeStatsDto })];
            _storage_decorators = [ApiProperty({ description: '存储空间信息', type: () => StorageInfoDto })];
            __esDecorate(null, null, _projectCount_decorators, { kind: "field", name: "projectCount", static: false, private: false, access: { has: obj => "projectCount" in obj, get: obj => obj.projectCount, set: (obj, value) => { obj.projectCount = value; } }, metadata: _metadata }, _projectCount_initializers, _projectCount_extraInitializers);
            __esDecorate(null, null, _totalFiles_decorators, { kind: "field", name: "totalFiles", static: false, private: false, access: { has: obj => "totalFiles" in obj, get: obj => obj.totalFiles, set: (obj, value) => { obj.totalFiles = value; } }, metadata: _metadata }, _totalFiles_initializers, _totalFiles_extraInitializers);
            __esDecorate(null, null, _todayUploads_decorators, { kind: "field", name: "todayUploads", static: false, private: false, access: { has: obj => "todayUploads" in obj, get: obj => obj.todayUploads, set: (obj, value) => { obj.todayUploads = value; } }, metadata: _metadata }, _todayUploads_initializers, _todayUploads_extraInitializers);
            __esDecorate(null, null, _fileTypeStats_decorators, { kind: "field", name: "fileTypeStats", static: false, private: false, access: { has: obj => "fileTypeStats" in obj, get: obj => obj.fileTypeStats, set: (obj, value) => { obj.fileTypeStats = value; } }, metadata: _metadata }, _fileTypeStats_initializers, _fileTypeStats_extraInitializers);
            __esDecorate(null, null, _storage_decorators, { kind: "field", name: "storage", static: false, private: false, access: { has: obj => "storage" in obj, get: obj => obj.storage, set: (obj, value) => { obj.storage = value; } }, metadata: _metadata }, _storage_initializers, _storage_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { UserDashboardStatsDto };
//# sourceMappingURL=user-response.dto.js.map