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
/////////////////////////////////////////////////////////////////////////////
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
import { Controller, Get, Post, UseGuards, HttpCode, HttpStatus, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, } from '@nestjs/swagger';
import { UserCleanupStatsResponseDto, UserCleanupTriggerResponseDto, } from './dto/user-cleanup.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { SystemPermission } from '../enums/permissions.enum';
let UserCleanupController = (() => {
    let _classDecorators = [ApiTags('user-cleanup'), Controller('user-cleanup'), UseGuards(JwtAuthGuard, PermissionsGuard), RequirePermissions([SystemPermission.SYSTEM_USER_DELETE]), ApiBearerAuth()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getStats_decorators;
    let _triggerCleanup_decorators;
    var UserCleanupController = _classThis = class {
        constructor(userCleanupService) {
            this.userCleanupService = (__runInitializers(this, _instanceExtraInitializers), userCleanupService);
        }
        async getStats() {
            return await this.userCleanupService.getPendingCleanupStats();
        }
        async triggerCleanup(body) {
            const result = await this.userCleanupService.manualCleanup(body.delayDays);
            return {
                message: `清理完成: 处理 ${result.processedUsers} 个用户`,
                success: result.success,
                processedUsers: result.processedUsers,
                deletedMembers: result.deletedMembers,
                deletedProjects: result.deletedProjects,
                deletedAuditLogs: result.deletedAuditLogs,
                markedForStorageCleanup: result.markedForStorageCleanup,
                errors: result.errors,
            };
        }
    };
    __setFunctionName(_classThis, "UserCleanupController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getStats_decorators = [Get('stats'), ApiOperation({ summary: '获取待清理用户统计' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取待清理用户统计',
                type: UserCleanupStatsResponseDto,
            })];
        _triggerCleanup_decorators = [Post('trigger'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '手动触发用户数据清理' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功触发用户数据清理',
                type: UserCleanupTriggerResponseDto,
            })];
        __esDecorate(_classThis, null, _getStats_decorators, { kind: "method", name: "getStats", static: false, private: false, access: { has: obj => "getStats" in obj, get: obj => obj.getStats }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _triggerCleanup_decorators, { kind: "method", name: "triggerCleanup", static: false, private: false, access: { has: obj => "triggerCleanup" in obj, get: obj => obj.triggerCleanup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        UserCleanupController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return UserCleanupController = _classThis;
})();
export { UserCleanupController };
//# sourceMappingURL=user-cleanup.controller.js.map