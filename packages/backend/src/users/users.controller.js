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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards, BadRequestException, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SystemPermission } from '../common/enums/permissions.enum';
import { UserResponseDto, UserListResponseDto, UserSearchResultDto, UserProfileResponseDto, UserDashboardStatsDto, } from './dto/user-response.dto';
import { DeactivateAccountApiResponseDto, } from './dto/deactivate-account.dto';
import { RestoreAccountResponseDto, } from './dto/restore-account.dto';
import { ChangePasswordApiResponseDto, } from '../auth/dto/password-reset.dto';
let UsersController = (() => {
    let _classDecorators = [ApiTags('用户管理'), ApiBearerAuth(), Controller('users'), UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _findAll_decorators;
    let _searchByEmail_decorators;
    let _searchUsers_decorators;
    let _getProfile_decorators;
    let _getDashboardStats_decorators;
    let _updateProfile_decorators;
    let _findOne_decorators;
    let _update_decorators;
    let _remove_decorators;
    let _restore_decorators;
    let _deleteImmediately_decorators;
    let _deactivateAccount_decorators;
    let _restoreAccount_decorators;
    let _changePassword_decorators;
    var UsersController = _classThis = class {
        constructor(usersService, databaseService) {
            this.usersService = (__runInitializers(this, _instanceExtraInitializers), usersService);
            this.databaseService = databaseService;
        }
        create(createUserDto) {
            return this.usersService.create(createUserDto);
        }
        findAll(query) {
            return this.usersService.findAll(query);
        }
        searchByEmail(email) {
            return this.usersService.findByEmail(email);
        }
        searchUsers(query, req) {
            return this.usersService.findAll(query, req.user.id);
        }
        getProfile(req) {
            return this.usersService.findOne(req.user.id);
        }
        getDashboardStats(req) {
            return this.usersService.getDashboardStats(req.user.id);
        }
        async updateProfile(req, updateUserDto) {
            // 用户只能更新自己的信息，排除角色ID和状态字段
            const { roleId, status, ...profileData } = updateUserDto;
            // 检查用户名修改限制（一月最多3次）
            if (updateUserDto.username) {
                const existingUser = await this.usersService.findOne(req.user.id);
                // 检查用户名是否有变化
                if (updateUserDto.username !== existingUser.username) {
                    // 获取用户的修改次数和时间
                    const userWithCount = await this.databaseService.user.findUnique({
                        where: { id: req.user.id },
                        select: {
                            usernameChangeCount: true,
                            lastUsernameChangeAt: true,
                        },
                    });
                    const now = new Date();
                    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                    // 如果上次修改时间超过一个月，重置修改次数
                    if (!userWithCount?.lastUsernameChangeAt ||
                        userWithCount.lastUsernameChangeAt < oneMonthAgo) {
                        await this.databaseService.user.update({
                            where: { id: req.user.id },
                            data: {
                                usernameChangeCount: 0,
                                lastUsernameChangeAt: null,
                            },
                        });
                    }
                    // 检查修改次数是否超过限制
                    const updatedUserWithCount = await this.databaseService.user.findUnique({
                        where: { id: req.user.id },
                        select: {
                            usernameChangeCount: true,
                        },
                    });
                    if (updatedUserWithCount &&
                        updatedUserWithCount.usernameChangeCount >= 3) {
                        throw new BadRequestException('用户名一月内只能修改3次');
                    }
                    // 更新用户名时增加修改次数和时间
                    await this.databaseService.user.update({
                        where: { id: req.user.id },
                        data: {
                            usernameChangeCount: {
                                increment: 1,
                            },
                            lastUsernameChangeAt: new Date(),
                        },
                    });
                }
            }
            return this.usersService.update(req.user.id, profileData);
        }
        findOne(id) {
            return this.usersService.findOne(id);
        }
        update(id, updateUserDto) {
            return this.usersService.update(id, updateUserDto);
        }
        remove(id) {
            return this.usersService.softDelete(id);
        }
        restore(id) {
            return this.usersService.restore(id);
        }
        deleteImmediately(id) {
            return this.usersService.deleteImmediately(id);
        }
        async deactivateAccount(req, dto) {
            return this.usersService.deactivate(req.user.id, dto.password, dto.phoneCode, dto.emailCode, dto.wechatConfirm);
        }
        async restoreAccount(req, dto) {
            return this.usersService.restoreAccount(req.user.id, dto.verificationMethod, dto.code);
        }
        async changePassword(req, dto) {
            return this.usersService.changePassword(req.user.id, dto.oldPassword, dto.newPassword);
        }
    };
    __setFunctionName(_classThis, "UsersController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _create_decorators = [Post(), RequirePermissions([SystemPermission.SYSTEM_USER_CREATE]), HttpCode(HttpStatus.CREATED), ApiOperation({ summary: '创建用户' }), ApiResponse({
                status: 201,
                description: '用户创建成功',
                type: UserResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误' }), ApiResponse({ status: 409, description: '用户已存在' })];
        _findAll_decorators = [Get(), RequirePermissions([SystemPermission.SYSTEM_USER_READ]), ApiOperation({ summary: '获取用户列表' }), ApiResponse({
                status: 200,
                description: '获取用户列表成功',
                type: UserListResponseDto,
            })];
        _searchByEmail_decorators = [Get('search/by-email'), ApiOperation({ summary: '根据邮箱搜索用户' }), ApiResponse({
                status: 200,
                description: '搜索成功',
                type: UserSearchResultDto,
            }), ApiResponse({ status: 404, description: '用户不存在' }), RequirePermissions([SystemPermission.SYSTEM_USER_READ]), HttpCode(HttpStatus.OK)];
        _searchUsers_decorators = [Get('search'), ApiOperation({ summary: '搜索用户（用于添加项目成员）' }), ApiResponse({
                status: 200,
                description: '搜索成功',
                type: UserListResponseDto,
            }), HttpCode(HttpStatus.OK)];
        _getProfile_decorators = [Get('profile/me'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取当前用户信息' }), ApiResponse({
                status: 200,
                description: '获取用户信息成功',
                type: UserProfileResponseDto,
            })];
        _getDashboardStats_decorators = [Get('stats/me'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取当前用户仪表盘统计数据' }), ApiResponse({
                status: 200,
                description: '获取统计数据成功',
                type: UserDashboardStatsDto,
            })];
        _updateProfile_decorators = [Patch('profile/me'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '更新当前用户信息' }), ApiResponse({
                status: 200,
                description: '更新用户信息成功',
                type: UserProfileResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误' })];
        _findOne_decorators = [Get(':id'), RequirePermissions([SystemPermission.SYSTEM_USER_READ]), ApiOperation({ summary: '根据 ID 获取用户' }), ApiResponse({
                status: 200,
                description: '获取用户成功',
                type: UserResponseDto,
            }), ApiResponse({ status: 404, description: '用户不存在' })];
        _update_decorators = [Patch(':id'), RequirePermissions([SystemPermission.SYSTEM_USER_UPDATE]), ApiOperation({ summary: '更新用户' }), ApiResponse({
                status: 200,
                description: '更新用户成功',
                type: UserResponseDto,
            }), ApiResponse({ status: 404, description: '用户不存在' })];
        _remove_decorators = [Delete(':id'), RequirePermissions([SystemPermission.SYSTEM_USER_DELETE]), HttpCode(HttpStatus.OK), ApiOperation({ summary: '注销用户账户（软删除）' }), ApiResponse({ status: 200, description: '账户注销成功' }), ApiResponse({ status: 404, description: '用户不存在' })];
        _restore_decorators = [Post(':id/restore'), RequirePermissions([SystemPermission.SYSTEM_USER_DELETE]), HttpCode(HttpStatus.OK), ApiOperation({ summary: '恢复已注销的用户账户' }), ApiResponse({ status: 200, description: '账户恢复成功' }), ApiResponse({ status: 404, description: '用户不存在' })];
        _deleteImmediately_decorators = [Post(':id/delete-immediately'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '立即注销指定用户账户（软删除 + 立即清理）' }), ApiResponse({ status: 200, description: '账户立即注销成功' }), ApiResponse({ status: 404, description: '用户不存在' }), ApiResponse({ status: 403, description: '权限不足' }), RequirePermissions([SystemPermission.SYSTEM_USER_DELETE])];
        _deactivateAccount_decorators = [Post('deactivate-account'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '注销用户账户' }), ApiResponse({
                status: 200,
                description: '账户注销成功',
                type: DeactivateAccountApiResponseDto,
            }), ApiResponse({ status: 400, description: '账户已注销或验证失败' }), ApiResponse({ status: 401, description: '未授权' })];
        _restoreAccount_decorators = [Post('me/restore'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '恢复已注销账户（冷静期内）' }), ApiResponse({
                status: 200,
                description: '账户恢复成功',
                type: RestoreAccountResponseDto,
            }), ApiResponse({ status: 400, description: '账户未注销或已过冷静期' }), ApiResponse({ status: 401, description: '验证失败' })];
        _changePassword_decorators = [Post('change-password'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '修改密码' }), ApiResponse({
                status: 200,
                description: '密码修改成功',
                type: ChangePasswordApiResponseDto,
            }), ApiResponse({ status: 400, description: '请求参数错误' }), ApiResponse({ status: 401, description: '未授权或旧密码不正确' }), ApiResponse({ status: 409, description: '旧密码不正确' })];
        __esDecorate(_classThis, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _searchByEmail_decorators, { kind: "method", name: "searchByEmail", static: false, private: false, access: { has: obj => "searchByEmail" in obj, get: obj => obj.searchByEmail }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _searchUsers_decorators, { kind: "method", name: "searchUsers", static: false, private: false, access: { has: obj => "searchUsers" in obj, get: obj => obj.searchUsers }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProfile_decorators, { kind: "method", name: "getProfile", static: false, private: false, access: { has: obj => "getProfile" in obj, get: obj => obj.getProfile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getDashboardStats_decorators, { kind: "method", name: "getDashboardStats", static: false, private: false, access: { has: obj => "getDashboardStats" in obj, get: obj => obj.getDashboardStats }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateProfile_decorators, { kind: "method", name: "updateProfile", static: false, private: false, access: { has: obj => "updateProfile" in obj, get: obj => obj.updateProfile }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _remove_decorators, { kind: "method", name: "remove", static: false, private: false, access: { has: obj => "remove" in obj, get: obj => obj.remove }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _restore_decorators, { kind: "method", name: "restore", static: false, private: false, access: { has: obj => "restore" in obj, get: obj => obj.restore }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _deleteImmediately_decorators, { kind: "method", name: "deleteImmediately", static: false, private: false, access: { has: obj => "deleteImmediately" in obj, get: obj => obj.deleteImmediately }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _deactivateAccount_decorators, { kind: "method", name: "deactivateAccount", static: false, private: false, access: { has: obj => "deactivateAccount" in obj, get: obj => obj.deactivateAccount }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _restoreAccount_decorators, { kind: "method", name: "restoreAccount", static: false, private: false, access: { has: obj => "restoreAccount" in obj, get: obj => obj.restoreAccount }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _changePassword_decorators, { kind: "method", name: "changePassword", static: false, private: false, access: { has: obj => "changePassword" in obj, get: obj => obj.changePassword }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        UsersController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return UsersController = _classThis;
})();
export { UsersController };
//# sourceMappingURL=users.controller.js.map