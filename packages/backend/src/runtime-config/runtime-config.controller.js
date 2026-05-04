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
import { Controller, Get, Put, Post, UseGuards, } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse, } from '@nestjs/swagger';
import { RuntimeConfigResponseDto, RuntimeConfigDefinitionDto, } from './dto/runtime-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
let RuntimeConfigController = (() => {
    let _classDecorators = [ApiTags('runtime-config'), Controller('runtime-config')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getPublicConfigs_decorators;
    let _getAllConfigs_decorators;
    let _getDefinitions_decorators;
    let _getConfig_decorators;
    let _updateConfig_decorators;
    let _resetConfig_decorators;
    var RuntimeConfigController = _classThis = class {
        constructor(runtimeConfigService) {
            this.runtimeConfigService = (__runInitializers(this, _instanceExtraInitializers), runtimeConfigService);
        }
        /**
         * 获取前端所需的公开配置（无需登录）
         */
        async getPublicConfigs() {
            return this.runtimeConfigService.getPublicConfigs();
        }
        /**
         * 获取所有配置项（需要权限）
         */
        async getAllConfigs() {
            return this.runtimeConfigService.getAllConfigs();
        }
        /**
         * 获取配置定义列表
         */
        async getDefinitions() {
            return this.runtimeConfigService.getDefinitions();
        }
        /**
         * 获取单个配置项
         */
        async getConfig(key) {
            return this.runtimeConfigService.get(key);
        }
        /**
         * 更新配置项
         */
        async updateConfig(key, dto, req) {
            const user = req.user;
            const ip = req.ip;
            await this.runtimeConfigService.set(key, dto.value, user.id, ip);
            return { success: true };
        }
        /**
         * 重置配置为默认值
         */
        async resetConfig(key, req) {
            const user = req.user;
            const ip = req.ip;
            await this.runtimeConfigService.resetToDefault(key, user.id, ip);
            return { success: true };
        }
    };
    __setFunctionName(_classThis, "RuntimeConfigController");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _getPublicConfigs_decorators = [Public(), Get('public'), ApiOperation({ summary: '获取公开配置（前端初始化使用）' }), ApiResponse({
                status: 200,
                description: '返回公开配置键值对',
                type: Object,
                example: {
                    mailEnabled: false,
                    requireEmailVerification: false,
                    supportEmail: 'support@example.com',
                    supportPhone: '400-123-4567',
                    allowRegister: true,
                    systemNotice: '系统维护中',
                },
            })];
        _getAllConfigs_decorators = [Get(), UseGuards(JwtAuthGuard), RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ]), ApiBearerAuth(), ApiOperation({ summary: '获取所有运行时配置' }), ApiResponse({
                status: 200,
                description: '返回所有配置项列表',
                type: [RuntimeConfigResponseDto],
            })];
        _getDefinitions_decorators = [Get('definitions'), UseGuards(JwtAuthGuard), RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ]), ApiBearerAuth(), ApiOperation({ summary: '获取配置项定义' }), ApiResponse({
                status: 200,
                description: '返回配置定义列表',
                type: [RuntimeConfigDefinitionDto],
            })];
        _getConfig_decorators = [Get(':key'), UseGuards(JwtAuthGuard), RequirePermissions([SystemPermission.SYSTEM_CONFIG_READ]), ApiBearerAuth(), ApiOperation({ summary: '获取单个配置项' }), ApiParam({ name: 'key', description: '配置键名' }), ApiResponse({
                status: 200,
                description: '返回配置项详情',
                type: RuntimeConfigResponseDto,
            })];
        _updateConfig_decorators = [Put(':key'), UseGuards(JwtAuthGuard), RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE]), ApiBearerAuth(), ApiOperation({ summary: '更新配置项' }), ApiParam({ name: 'key', description: '配置键名' }), ApiResponse({
                status: 200,
                description: '更新成功',
                schema: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                    },
                },
            })];
        _resetConfig_decorators = [Post(':key/reset'), UseGuards(JwtAuthGuard), RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE]), ApiBearerAuth(), ApiOperation({ summary: '重置配置为默认值' }), ApiParam({ name: 'key', description: '配置键名' }), ApiResponse({
                status: 201,
                description: '重置成功',
                schema: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                    },
                },
            })];
        __esDecorate(_classThis, null, _getPublicConfigs_decorators, { kind: "method", name: "getPublicConfigs", static: false, private: false, access: { has: obj => "getPublicConfigs" in obj, get: obj => obj.getPublicConfigs }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getAllConfigs_decorators, { kind: "method", name: "getAllConfigs", static: false, private: false, access: { has: obj => "getAllConfigs" in obj, get: obj => obj.getAllConfigs }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getDefinitions_decorators, { kind: "method", name: "getDefinitions", static: false, private: false, access: { has: obj => "getDefinitions" in obj, get: obj => obj.getDefinitions }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getConfig_decorators, { kind: "method", name: "getConfig", static: false, private: false, access: { has: obj => "getConfig" in obj, get: obj => obj.getConfig }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateConfig_decorators, { kind: "method", name: "updateConfig", static: false, private: false, access: { has: obj => "updateConfig" in obj, get: obj => obj.updateConfig }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _resetConfig_decorators, { kind: "method", name: "resetConfig", static: false, private: false, access: { has: obj => "resetConfig" in obj, get: obj => obj.resetConfig }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RuntimeConfigController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RuntimeConfigController = _classThis;
})();
export { RuntimeConfigController };
//# sourceMappingURL=runtime-config.controller.js.map