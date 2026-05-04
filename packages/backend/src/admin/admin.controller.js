///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
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
import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SystemPermission } from '../common/enums/permissions.enum';
import { AdminStatsResponseDto, } from './dto/admin-response.dto';
let AdminController = (() => {
    let _classDecorators = [ApiTags('管理员'), ApiBearerAuth(), Controller('admin'), UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard), RequirePermissions([SystemPermission.SYSTEM_ADMIN])];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getAdminStats_decorators;
    let _cleanupStorage_decorators;
    let _getCleanupStats_decorators;
    var AdminController = _classThis = class {
        constructor(permissionService, cacheService, storageCleanupService) {
            this.permissionService = (__runInitializers(this, _instanceExtraInitializers), permissionService);
            this.cacheService = cacheService;
            this.storageCleanupService = storageCleanupService;
        }
        async getAdminStats() {
            return {
                message: '管理员统计信息',
                timestamp: new Date().toISOString(),
            };
        }
        async cleanupStorage(delayDays) {
            const result = await this.storageCleanupService.manualCleanup(delayDays);
            return {
                message: '存储清理完成',
                data: {
                    deletedNodes: result.deletedNodes,
                    deletedDirectories: result.deletedDirectories,
                    freedSpace: result.freedSpace,
                    errors: result.errors,
                },
            };
        }
        async getCleanupStats() {
            const stats = await this.storageCleanupService.getPendingCleanupStats();
            return {
                message: '待清理存储统计',
                data: stats,
            };
        }
    };
    __setFunctionName(_classThis, "AdminController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getAdminStats_decorators = [Get('stats'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取管理员统计信息' }), ApiResponse({
                status: 200,
                description: '获取管理员统计信息成功',
                type: AdminStatsResponseDto,
            })];
        _cleanupStorage_decorators = [Post('storage/cleanup'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '手动触发存储清理' }), ApiResponse({
                status: 200,
                description: '存储清理完成',
            }), ApiQuery({
                name: 'delayDays',
                required: false,
                type: Number,
                description: '清理延迟天数（覆盖默认值）',
            })];
        _getCleanupStats_decorators = [Get('storage/cleanup/stats'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '获取待清理存储统计' }), ApiResponse({
                status: 200,
                description: '获取待清理存储统计成功',
            })];
        __esDecorate(_classThis, null, _getAdminStats_decorators, { kind: "method", name: "getAdminStats", static: false, private: false, access: { has: obj => "getAdminStats" in obj, get: obj => obj.getAdminStats }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _cleanupStorage_decorators, { kind: "method", name: "cleanupStorage", static: false, private: false, access: { has: obj => "cleanupStorage" in obj, get: obj => obj.cleanupStorage }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getCleanupStats_decorators, { kind: "method", name: "getCleanupStats", static: false, private: false, access: { has: obj => "getCleanupStats" in obj, get: obj => obj.getCleanupStats }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AdminController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AdminController = _classThis;
})();
export { AdminController };
//# sourceMappingURL=admin.controller.js.map