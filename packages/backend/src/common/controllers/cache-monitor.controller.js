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
import { Controller, Get, Post, UseGuards, HttpCode, HttpStatus, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { SystemPermission } from '../enums/permissions.enum';
let CacheMonitorController = (() => {
    let _classDecorators = [ApiTags('cache'), Controller('cache'), UseGuards(JwtAuthGuard, PermissionsGuard), RequirePermissions([SystemPermission.SYSTEM_ADMIN]), ApiBearerAuth()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getStats_decorators;
    let _clearAll_decorators;
    let _manualWarmup_decorators;
    let _warmupUser_decorators;
    let _warmupProject_decorators;
    var CacheMonitorController = _classThis = class {
        constructor(redisCacheService, cacheWarmupService) {
            this.redisCacheService = (__runInitializers(this, _instanceExtraInitializers), redisCacheService);
            this.cacheWarmupService = cacheWarmupService;
        }
        async getStats() {
            return await this.redisCacheService.getStats();
        }
        async clearAll() {
            await this.redisCacheService.clearAll();
            return {
                message: '所有缓存已清理',
            };
        }
        async manualWarmup() {
            return await this.cacheWarmupService.manualWarmup();
        }
        async warmupUser(userId) {
            await this.cacheWarmupService.warmupUser(userId);
            return {
                message: `用户 ${userId} 的缓存预热完成`,
            };
        }
        async warmupProject(projectId) {
            await this.cacheWarmupService.warmupProject(projectId);
            return {
                message: `项目 ${projectId} 的缓存预热完成`,
            };
        }
    };
    __setFunctionName(_classThis, "CacheMonitorController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getStats_decorators = [Get('stats'), ApiOperation({ summary: '获取缓存统计信息' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功获取缓存统计信息',
            })];
        _clearAll_decorators = [Post('clear'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '清理所有缓存' }), ApiResponse({
                status: HttpStatus.OK,
                description: '成功清理所有缓存',
            })];
        _manualWarmup_decorators = [Post('warmup'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '手动触发缓存预热' }), ApiResponse({
                status: HttpStatus.OK,
                description: '缓存预热完成',
            })];
        _warmupUser_decorators = [Post('warmup/user/:userId'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '预热指定用户的缓存' }), ApiResponse({
                status: HttpStatus.OK,
                description: '用户缓存预热完成',
            })];
        _warmupProject_decorators = [Post('warmup/project/:projectId'), HttpCode(HttpStatus.OK), ApiOperation({ summary: '预热指定项目的缓存' }), ApiResponse({
                status: HttpStatus.OK,
                description: '项目缓存预热完成',
            })];
        __esDecorate(_classThis, null, _getStats_decorators, { kind: "method", name: "getStats", static: false, private: false, access: { has: obj => "getStats" in obj, get: obj => obj.getStats }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _clearAll_decorators, { kind: "method", name: "clearAll", static: false, private: false, access: { has: obj => "clearAll" in obj, get: obj => obj.clearAll }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _manualWarmup_decorators, { kind: "method", name: "manualWarmup", static: false, private: false, access: { has: obj => "manualWarmup" in obj, get: obj => obj.manualWarmup }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _warmupUser_decorators, { kind: "method", name: "warmupUser", static: false, private: false, access: { has: obj => "warmupUser" in obj, get: obj => obj.warmupUser }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _warmupProject_decorators, { kind: "method", name: "warmupProject", static: false, private: false, access: { has: obj => "warmupProject" in obj, get: obj => obj.warmupProject }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CacheMonitorController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CacheMonitorController = _classThis;
})();
export { CacheMonitorController };
//# sourceMappingURL=cache-monitor.controller.js.map